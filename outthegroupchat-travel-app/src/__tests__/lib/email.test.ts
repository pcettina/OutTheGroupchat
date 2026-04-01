/**
 * Unit tests for src/lib/email.ts
 *
 * Strategy
 * --------
 * email.ts instantiates the Resend client at module-load time based on
 * RESEND_API_KEY.  We therefore:
 *   1. Mock the 'resend' package so the constructor is a no-op spy.
 *   2. Set process.env.RESEND_API_KEY before importing the module so the
 *      `resend` singleton is non-null.
 *   3. Use vi.resetModules() + dynamic import in a beforeAll to load the
 *      module fresh with the env var in place.
 *
 * All tests share the same dynamically-imported module instance.
 * The mockEmailsSend spy is cleared between tests so return values
 * can be set independently per test.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// The mock declaration must come before any static import that pulls in
// 'resend'.  We keep this file free of static imports from @/lib/email so
// we can control the import order.
// ---------------------------------------------------------------------------
const mockEmailsSend = vi.fn();

vi.mock('resend', () => ({
  // Must be a real constructor (function / class) so `new Resend(...)` works.
  Resend: function () {
    return { emails: { send: mockEmailsSend } };
  },
}));

// logger is mocked globally via setup.ts — re-use its typed references.
import { logError, logSuccess } from '@/lib/logger';
const mockLogError = vi.mocked(logError);
const mockLogSuccess = vi.mocked(logSuccess);

// ---------------------------------------------------------------------------
// Lazy references filled in beforeAll after the module is dynamically loaded.
// ---------------------------------------------------------------------------
type EmailModule = typeof import('@/lib/email');
let emailModule: EmailModule;

beforeAll(async () => {
  // Ensure the API key is present when the module initialises.
  process.env.RESEND_API_KEY = 'test-re-abc123';
  vi.resetModules();

  // Re-declare mock after resetModules so the fresh import sees it.
  vi.mock('resend', () => ({
    Resend: function () {
      return { emails: { send: mockEmailsSend } };
    },
  }));

  emailModule = await import('@/lib/email');
});

afterAll(() => {
  delete process.env.RESEND_API_KEY;
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resendSuccess(id = 'msg-abc-123') {
  mockEmailsSend.mockResolvedValueOnce({ data: { id }, error: null });
}

function resendApiError(message = 'API error') {
  mockEmailsSend.mockResolvedValueOnce({
    data: null,
    error: { name: 'ResendError', message },
  });
}

function resendThrows(message = 'Network failure') {
  mockEmailsSend.mockRejectedValueOnce(new Error(message));
}

// ===========================================================================
// isEmailConfigured
// ===========================================================================
describe('isEmailConfigured', () => {
  it('returns true when RESEND_API_KEY was set at module load time', () => {
    expect(emailModule.isEmailConfigured()).toBe(true);
  });

  it('returns a boolean (not a truthy object)', () => {
    const result = emailModule.isEmailConfigured();
    expect(typeof result).toBe('boolean');
  });
});

// ===========================================================================
// sendInvitationEmail
// ===========================================================================
describe('sendInvitationEmail', () => {
  const BASE_PARAMS = {
    to: 'friend@example.com',
    tripTitle: 'Paris Getaway',
    inviterName: 'Alice',
    tripId: 'trip-123',
  };

  it('returns success with messageId when Resend accepts the email', async () => {
    resendSuccess('msg-001');

    const result = await emailModule.sendInvitationEmail(BASE_PARAMS);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-001');
    expect(result.error).toBeUndefined();
  });

  it('calls resend.emails.send with the correct recipient and subject', async () => {
    resendSuccess();

    await emailModule.sendInvitationEmail(BASE_PARAMS);

    expect(mockEmailsSend).toHaveBeenCalledOnce();
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toEqual(['friend@example.com']);
    expect(call.subject).toContain('Alice');
    expect(call.subject).toContain('Paris Getaway');
  });

  it('includes an expiry year when expiresAt is provided', async () => {
    resendSuccess();
    const expiresAt = new Date('2026-12-31');

    await emailModule.sendInvitationEmail({ ...BASE_PARAMS, expiresAt });

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('2026');
  });

  it('returns failure and calls logError when the email address is invalid', async () => {
    const result = await emailModule.sendInvitationEmail({
      ...BASE_PARAMS,
      to: 'not-an-email',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid email/i);
    expect(mockEmailsSend).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  it('returns failure when Resend returns an API-level error', async () => {
    resendApiError('Domain not verified');

    const result = await emailModule.sendInvitationEmail(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Domain not verified');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('returns failure when Resend returns data with no id', async () => {
    mockEmailsSend.mockResolvedValueOnce({ data: {}, error: null });

    const result = await emailModule.sendInvitationEmail(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no message id/i);
  });

  it('returns failure and calls logError when Resend throws a network error', async () => {
    resendThrows('Connection refused');

    const result = await emailModule.sendInvitationEmail(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('calls logSuccess with the message id on a successful send', async () => {
    resendSuccess('msg-xyz');

    await emailModule.sendInvitationEmail(BASE_PARAMS);

    expect(mockLogSuccess).toHaveBeenCalledWith(
      'EMAIL_SEND',
      expect.stringMatching(/sent/i),
      expect.objectContaining({ messageId: 'msg-xyz' })
    );
  });

  it('sends both html and text body fields', async () => {
    resendSuccess();

    await emailModule.sendInvitationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toBeDefined();
    expect(call.text).toBeDefined();
    expect(typeof call.html).toBe('string');
    expect(typeof call.text).toBe('string');
  });

  it('includes the trip title in the email html body', async () => {
    resendSuccess();

    await emailModule.sendInvitationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('Paris Getaway');
  });

  it('includes the inviter name in the email text body', async () => {
    resendSuccess();

    await emailModule.sendInvitationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('Alice');
  });

  it('includes a signup URL containing the tripId in the email text body', async () => {
    resendSuccess();

    await emailModule.sendInvitationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('trip-123');
  });

  it('omits expiry text when expiresAt is not provided', async () => {
    resendSuccess();

    await emailModule.sendInvitationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    // expiryText is empty string; it should not appear as a meaningful sentence
    expect(call.text).not.toMatch(/expires on/i);
  });

  it('returns { success: false } when Resend returns null data and no error', async () => {
    mockEmailsSend.mockResolvedValueOnce({ data: null, error: null });

    const result = await emailModule.sendInvitationEmail(BASE_PARAMS);

    expect(result.success).toBe(false);
  });

  it('rejects emails with missing @ symbol', async () => {
    const result = await emailModule.sendInvitationEmail({
      ...BASE_PARAMS,
      to: 'invalidemail.com',
    });

    expect(result.success).toBe(false);
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it('rejects emails with only whitespace', async () => {
    const result = await emailModule.sendInvitationEmail({
      ...BASE_PARAMS,
      to: '   ',
    });

    expect(result.success).toBe(false);
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// sendNotificationEmail
// ===========================================================================
describe('sendNotificationEmail', () => {
  const BASE_PARAMS = {
    to: 'user@example.com',
    subject: 'Your trip was updated',
    title: 'Trip Update',
    message: 'Your itinerary has changed.',
  };

  it('returns success with messageId on a successful send', async () => {
    resendSuccess('notif-001');

    const result = await emailModule.sendNotificationEmail(BASE_PARAMS);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('notif-001');
  });

  it('sends to the correct recipient with the correct subject', async () => {
    resendSuccess();

    await emailModule.sendNotificationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toEqual(['user@example.com']);
    expect(call.subject).toBe('Your trip was updated');
  });

  it('includes action button URL and text in the email bodies', async () => {
    resendSuccess();

    await emailModule.sendNotificationEmail({
      ...BASE_PARAMS,
      actionUrl: 'https://outthegroupchat.com/trips/123',
      actionText: 'View Trip',
    });

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('https://outthegroupchat.com/trips/123');
    expect(call.html).toContain('View Trip');
    expect(call.text).toContain('View Trip');
  });

  it('returns failure when Resend returns an API error', async () => {
    resendApiError('Rate limit exceeded');

    const result = await emailModule.sendNotificationEmail(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limit exceeded');
  });

  it('returns failure when Resend throws', async () => {
    resendThrows('Timeout');

    const result = await emailModule.sendNotificationEmail(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout');
  });

  it('sends both html and text body fields', async () => {
    resendSuccess();

    await emailModule.sendNotificationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toBeDefined();
    expect(call.text).toBeDefined();
  });

  it('includes the notification title and message in the html body', async () => {
    resendSuccess();

    await emailModule.sendNotificationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('Trip Update');
    expect(call.html).toContain('Your itinerary has changed.');
  });

  it('includes the notification message in the text body', async () => {
    resendSuccess();

    await emailModule.sendNotificationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.text).toContain('Your itinerary has changed.');
  });

  it('omits action link from text body when actionUrl is not provided', async () => {
    resendSuccess();

    await emailModule.sendNotificationEmail(BASE_PARAMS);

    const call = mockEmailsSend.mock.calls[0][0];
    // When no actionUrl is provided the template renders an empty string
    expect(call.text).not.toContain('http');
  });

  it('calls logError when Resend returns an API error', async () => {
    resendApiError('Forbidden');

    await emailModule.sendNotificationEmail(BASE_PARAMS);

    expect(mockLogError).toHaveBeenCalled();
  });

  it('calls logError when Resend throws a network error', async () => {
    resendThrows('Socket hang up');

    await emailModule.sendNotificationEmail(BASE_PARAMS);

    expect(mockLogError).toHaveBeenCalled();
  });

  it('returns messageId as undefined when Resend returns data without id', async () => {
    mockEmailsSend.mockResolvedValueOnce({ data: {}, error: null });

    const result = await emailModule.sendNotificationEmail(BASE_PARAMS);

    expect(result.success).toBe(true);
    expect(result.messageId).toBeUndefined();
  });
});
