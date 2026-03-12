/**
 * Unit tests for src/lib/invitations.ts
 *
 * Strategy
 * --------
 * - Prisma is mocked globally via setup.ts.
 * - sendInvitationEmail and isEmailConfigured are mocked locally so we can
 *   control whether the email service appears "configured" per test.
 * - processInvitations is called directly; no HTTP layer is involved.
 *
 * Coverage goals
 * --------------
 * - Unregistered email  → creates PendingInvitation + sends email
 * - Unregistered email  → updates existing PendingInvitation when one exists
 * - Unregistered email  → records email_failed when send fails
 * - Unregistered email  → records email_pending when email service is off
 * - Registered user     → creates TripInvitation + Notification
 * - Registered user     → updates existing TripInvitation
 * - Registered user     → skips user already a member
 * - Error per email     → captured in errors array without aborting the loop
 * - Trip status         → transitions PLANNING → INVITING at the end
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// setup.ts mocks @/lib/invitations globally so the trips API tests can stub
// processInvitations out.  In THIS file we ARE testing processInvitations, so
// we must undo that global mock before importing the real implementation.
// ---------------------------------------------------------------------------
vi.unmock('@/lib/invitations');

// ---------------------------------------------------------------------------
// Mock the email helpers so invitation logic does not depend on Resend.
//
// vi.mock() factories are hoisted to the top of the file by Vitest, which
// means they execute before any `const` declarations in the module body.
// Variables referenced inside a factory must therefore be created with
// vi.hoisted() so they are available when the factory runs.
// ---------------------------------------------------------------------------
const { mockSendInvitationEmail, mockIsEmailConfigured } = vi.hoisted(() => ({
  mockSendInvitationEmail: vi.fn(),
  mockIsEmailConfigured: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendInvitationEmail: mockSendInvitationEmail,
  isEmailConfigured: mockIsEmailConfigured,
}));

// Import the function under test AFTER mocks are configured.
import { processInvitations } from '@/lib/invitations';

// ---------------------------------------------------------------------------
// Typed references to prisma mocks (provided by setup.ts)
// ---------------------------------------------------------------------------
const mockUser = vi.mocked(prisma.user);
const mockPendingInvitation = vi.mocked(prisma.pendingInvitation);
const mockTripMember = vi.mocked(prisma.tripMember);
const mockTripInvitation = vi.mocked(prisma.tripInvitation);
const mockNotification = vi.mocked(prisma.notification);
const mockTrip = vi.mocked(prisma.trip);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const BASE_PARAMS = {
  tripId: 'trip-001',
  tripTitle: 'Paris Getaway',
  emails: ['guest@example.com'],
  inviterId: 'user-host',
  inviterName: 'Alice',
  expirationHours: 24,
};

const REGISTERED_USER = {
  id: 'user-reg-001',
  email: 'guest@example.com',
  name: 'Bob',
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default: email service is configured and sends successfully
  mockIsEmailConfigured.mockReturnValue(true);
  mockSendInvitationEmail.mockResolvedValue({ success: true, messageId: 'msg-001' });

  // Default: trip.update (PLANNING→INVITING) silently resolves
  mockTrip.update.mockResolvedValue({} as never);
});

// ===========================================================================
// Unregistered user paths
// ===========================================================================
describe('processInvitations — unregistered email', () => {
  beforeEach(() => {
    // No registered user found
    mockUser.findUnique.mockResolvedValue(null);
    // No existing pending invitation
    mockPendingInvitation.findFirst.mockResolvedValue(null);
    mockPendingInvitation.create.mockResolvedValue({} as never);
    mockPendingInvitation.update.mockResolvedValue({} as never);
  });

  it('creates a PendingInvitation for an unregistered email', async () => {
    await processInvitations(BASE_PARAMS);

    expect(mockPendingInvitation.create).toHaveBeenCalledOnce();
    const createCall = mockPendingInvitation.create.mock.calls[0][0];
    expect(createCall.data.email).toBe('guest@example.com');
    expect(createCall.data.tripId).toBe('trip-001');
    expect(createCall.data.invitedBy).toBe('user-host');
  });

  it('sends an invitation email for an unregistered email', async () => {
    await processInvitations(BASE_PARAMS);

    expect(mockSendInvitationEmail).toHaveBeenCalledOnce();
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'guest@example.com',
        tripTitle: 'Paris Getaway',
        inviterName: 'Alice',
        tripId: 'trip-001',
      })
    );
  });

  it('returns email_sent status when the email is delivered', async () => {
    const { invitations, errors } = await processInvitations(BASE_PARAMS);

    expect(invitations).toHaveLength(1);
    expect(invitations[0].status).toBe('email_sent');
    expect(errors).toHaveLength(0);
  });

  it('updates an existing PendingInvitation instead of creating a duplicate', async () => {
    const existing = { id: 'pending-existing', email: 'guest@example.com', tripId: 'trip-001' };
    mockPendingInvitation.findFirst.mockResolvedValue(existing as never);

    await processInvitations(BASE_PARAMS);

    expect(mockPendingInvitation.create).not.toHaveBeenCalled();
    expect(mockPendingInvitation.update).toHaveBeenCalledOnce();
    expect(mockPendingInvitation.update.mock.calls[0][0].where.id).toBe('pending-existing');
  });

  it('returns email_failed status when sendInvitationEmail fails', async () => {
    mockSendInvitationEmail.mockResolvedValue({ success: false, error: 'Resend error' });

    const { invitations, errors } = await processInvitations(BASE_PARAMS);

    expect(invitations).toHaveLength(1);
    expect(invitations[0].status).toBe('email_failed');
    expect(errors).toHaveLength(0);
  });

  it('returns email_pending status when email service is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false);

    const { invitations } = await processInvitations(BASE_PARAMS);

    expect(mockSendInvitationEmail).not.toHaveBeenCalled();
    expect(invitations[0].status).toBe('email_pending');
  });
});

// ===========================================================================
// Registered user paths
// ===========================================================================
describe('processInvitations — registered user', () => {
  beforeEach(() => {
    mockUser.findUnique.mockResolvedValue(REGISTERED_USER as never);
    mockTripMember.findFirst.mockResolvedValue(null); // not yet a member
    mockTripInvitation.findFirst.mockResolvedValue(null); // no existing invitation
    mockTripInvitation.create.mockResolvedValue({ id: 'inv-001' } as never);
    mockTripInvitation.update.mockResolvedValue({} as never);
    mockNotification.create.mockResolvedValue({} as never);
  });

  it('creates a TripInvitation for a registered user', async () => {
    await processInvitations(BASE_PARAMS);

    expect(mockTripInvitation.create).toHaveBeenCalledOnce();
    const createCall = mockTripInvitation.create.mock.calls[0][0];
    expect(createCall.data.tripId).toBe('trip-001');
    expect(createCall.data.userId).toBe(REGISTERED_USER.id);
    expect(createCall.data.status).toBe('PENDING');
  });

  it('creates a TRIP_INVITATION notification for a registered user', async () => {
    await processInvitations(BASE_PARAMS);

    expect(mockNotification.create).toHaveBeenCalledOnce();
    const notifCall = mockNotification.create.mock.calls[0][0];
    expect(notifCall.data.userId).toBe(REGISTERED_USER.id);
    expect(notifCall.data.type).toBe('TRIP_INVITATION');
    expect(notifCall.data.message).toContain('Paris Getaway');
  });

  it('returns invited status for a newly invited registered user', async () => {
    const { invitations, errors } = await processInvitations(BASE_PARAMS);

    expect(invitations[0].status).toBe('invited');
    expect(errors).toHaveLength(0);
  });

  it('updates an existing pending TripInvitation instead of creating a new one', async () => {
    const existingInv = { id: 'inv-existing', status: 'PENDING' };
    mockTripInvitation.findFirst.mockResolvedValue(existingInv as never);

    const { invitations } = await processInvitations(BASE_PARAMS);

    expect(mockTripInvitation.create).not.toHaveBeenCalled();
    expect(mockTripInvitation.update).toHaveBeenCalledOnce();
    expect(invitations[0].status).toBe('updated');
  });

  it('skips a user who is already a trip member', async () => {
    mockTripMember.findFirst.mockResolvedValue({ userId: REGISTERED_USER.id, role: 'MEMBER' } as never);

    const { invitations, errors } = await processInvitations(BASE_PARAMS);

    expect(invitations).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].status).toBe('skipped');
    expect(mockTripInvitation.create).not.toHaveBeenCalled();
  });

  it('does not send an invitation email to registered users', async () => {
    await processInvitations(BASE_PARAMS);

    expect(mockSendInvitationEmail).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Multi-email and error handling
// ===========================================================================
describe('processInvitations — multiple emails and error handling', () => {
  it('processes each email independently in a single call', async () => {
    const params = {
      ...BASE_PARAMS,
      emails: ['a@example.com', 'b@example.com'],
    };

    mockUser.findUnique.mockResolvedValue(null); // both unregistered
    mockPendingInvitation.findFirst.mockResolvedValue(null);
    mockPendingInvitation.create.mockResolvedValue({} as never);

    const { invitations } = await processInvitations(params);

    expect(invitations).toHaveLength(2);
    expect(mockPendingInvitation.create).toHaveBeenCalledTimes(2);
  });

  it('records an error entry and continues processing remaining emails when one throws', async () => {
    const params = {
      ...BASE_PARAMS,
      emails: ['bad@example.com', 'good@example.com'],
    };

    // First email throws; second succeeds
    mockUser.findUnique
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce(null);

    mockPendingInvitation.findFirst.mockResolvedValue(null);
    mockPendingInvitation.create.mockResolvedValue({} as never);

    const { invitations, errors } = await processInvitations(params);

    expect(errors).toHaveLength(1);
    expect(errors[0].email).toBe('bad@example.com');
    expect(errors[0].status).toBe('error');

    // The second email should still be processed
    expect(invitations).toHaveLength(1);
    expect(invitations[0].email).toBe('good@example.com');
  });
});

// ===========================================================================
// Trip status transition
// ===========================================================================
describe('processInvitations — trip status transition', () => {
  it('attempts to transition the trip from PLANNING to INVITING', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockPendingInvitation.findFirst.mockResolvedValue(null);
    mockPendingInvitation.create.mockResolvedValue({} as never);

    await processInvitations(BASE_PARAMS);

    expect(mockTrip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-001', status: 'PLANNING' },
        data: { status: 'INVITING' },
      })
    );
  });

  it('still resolves successfully if the trip.update rejects (non-PLANNING trip)', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockPendingInvitation.findFirst.mockResolvedValue(null);
    mockPendingInvitation.create.mockResolvedValue({} as never);

    // Simulate the trip not being in PLANNING (update throws / rejects)
    mockTrip.update.mockRejectedValueOnce(new Error('Record not found'));

    await expect(processInvitations(BASE_PARAMS)).resolves.not.toThrow();
  });
});
