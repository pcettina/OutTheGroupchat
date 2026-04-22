import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before any imports that use them.
// setup.ts does NOT include verificationToken, so we declare a full prisma
// mock here that overrides the setup.ts mock for this file.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    verificationToken: {
      create: vi.fn(),
    },
    pendingInvitation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    tripInvitation: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
}));

// Mock bcryptjs to avoid real hashing in tests.
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password-xyz'),
    compare: vi.fn(),
  },
}));

// Mock @/lib/email so Resend is never called in tests.
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(),
  sendAuthVerificationEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'test-msg-id' }),
  sendInvitationEmail: vi.fn(),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}));

import { prisma } from '@/lib/prisma';
import { sendNotificationEmail, sendAuthVerificationEmail } from '@/lib/email';
import { POST } from '@/app/api/auth/signup/route';

// ---------------------------------------------------------------------------
// Typed prisma accessor helpers (avoids repetition of long casts)
// ---------------------------------------------------------------------------
type PrismaUserMock = {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
type PrismaVerificationTokenMock = {
  create: ReturnType<typeof vi.fn>;
};
type PrismaPendingInvitationMock = {
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

const mockUser = () =>
  (prisma as unknown as { user: PrismaUserMock }).user;

const mockVerificationToken = () =>
  (prisma as unknown as { verificationToken: PrismaVerificationTokenMock }).verificationToken;

const mockPendingInvitation = () =>
  (prisma as unknown as { pendingInvitation: PrismaPendingInvitationMock }).pendingInvitation;

const mockSendNotificationEmail = () =>
  vi.mocked(sendNotificationEmail);

const mockSendAuthVerificationEmail = () =>
  vi.mocked(sendAuthVerificationEmail);

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: 'Alice Example',
  email: 'alice@example.com',
  password: 'securePass1',
};

const CREATED_USER = {
  id: 'user-abc-123',
  name: 'Alice Example',
  email: 'alice@example.com',
  password: 'hashed-password-xyz',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no pending invitations (prevents test pollution from that branch)
    mockPendingInvitation().findMany.mockResolvedValueOnce([]);
    // Default: verificationToken.create succeeds
    mockVerificationToken().create.mockResolvedValueOnce({
      identifier: VALID_BODY.email,
      token: 'some-random-token',
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    // Default: sendNotificationEmail returns success
    mockSendNotificationEmail().mockResolvedValueOnce({ success: true, messageId: 'msg-id-001' });
    // Default: sendAuthVerificationEmail returns success
    mockSendAuthVerificationEmail().mockResolvedValueOnce({ success: true, messageId: 'msg-id-002' });
  });

  // -------------------------------------------------------------------------
  // 1. Valid data → 200, returns user without password field
  // -------------------------------------------------------------------------
  it('returns 200 with user data (no password) for a valid signup request', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null); // no existing user
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user).toMatchObject({
      id: CREATED_USER.id,
      name: CREATED_USER.name,
      email: CREATED_USER.email,
    });
  });

  // -------------------------------------------------------------------------
  // 2. Response does NOT include the password field
  // -------------------------------------------------------------------------
  it('does not expose the password field in the success response', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(body.user).not.toHaveProperty('password');
  });

  // -------------------------------------------------------------------------
  // 3. Duplicate email (user exists with password) → 400
  // -------------------------------------------------------------------------
  it('returns 400 when a user with that email already exists and has a password', async () => {
    mockUser().findUnique.mockResolvedValueOnce({
      ...CREATED_USER,
      password: 'existing-hash',
    });

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
  });

  // -------------------------------------------------------------------------
  // 4. Missing email → 400
  // -------------------------------------------------------------------------
  it('returns 400 when the email field is missing', async () => {
    const { email: _omitted, ...noEmail } = VALID_BODY;
    const res = await POST(makeRequest(noEmail));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Missing password → 400
  // -------------------------------------------------------------------------
  it('returns 400 when the password field is missing', async () => {
    const { password: _omitted, ...noPassword } = VALID_BODY;
    const res = await POST(makeRequest(noPassword));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 6. Missing name → 400
  // -------------------------------------------------------------------------
  it('returns 400 when the name field is missing', async () => {
    const { name: _omitted, ...noName } = VALID_BODY;
    const res = await POST(makeRequest(noName));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. Weak password (too short — Zod min(6)) → 400
  // -------------------------------------------------------------------------
  it('returns 400 when the password is shorter than 6 characters', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, password: 'abc' }));
    const body = await res.json();

    // Short password passes the missing-field check (truthy) but fails Zod min(6)
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/at least 6/i);
  });

  // -------------------------------------------------------------------------
  // 8. Success → prisma.verificationToken.create called with correct shape
  // -------------------------------------------------------------------------
  it('calls prisma.verificationToken.create with identifier and expires on success', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    await POST(makeRequest(VALID_BODY));

    const tokenCreate = mockVerificationToken().create;
    expect(tokenCreate).toHaveBeenCalledOnce();
    const callArg = tokenCreate.mock.calls[0][0] as { data: { identifier: string; token: string; expires: Date } };
    expect(callArg.data.identifier).toBe(VALID_BODY.email);
    expect(typeof callArg.data.token).toBe('string');
    expect(callArg.data.token.length).toBeGreaterThan(0);
    expect(callArg.data.expires).toBeInstanceOf(Date);
    expect(callArg.data.expires.getTime()).toBeGreaterThan(Date.now());
  });

  // -------------------------------------------------------------------------
  // 9. Success → sendAuthVerificationEmail called (fire-and-forget)
  // -------------------------------------------------------------------------
  it('calls sendAuthVerificationEmail after a successful signup', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    await POST(makeRequest(VALID_BODY));

    expect(mockSendAuthVerificationEmail()).toHaveBeenCalledOnce();
    const callArg = mockSendAuthVerificationEmail().mock.calls[0][0] as { to: string; verifyUrl: string };
    expect(callArg.to).toBe(VALID_BODY.email);
    expect(callArg.verifyUrl).toMatch(/verify-email/i);
  });

  // -------------------------------------------------------------------------
  // 10. Prisma user.create throws → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.create throws an unexpected error', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 11. Prisma unique constraint error → 400 (handled by catch block)
  // -------------------------------------------------------------------------
  it('returns 400 when prisma.user.create throws a Unique constraint error', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`email`)')
    );

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
  });

  // -------------------------------------------------------------------------
  // 12. Invalid email format → 400 Zod error
  // -------------------------------------------------------------------------
  it('returns 400 when the email is not a valid email format', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, email: 'not-an-email' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid email/i);
  });

  // -------------------------------------------------------------------------
  // 13. sendAuthVerificationEmail failure does NOT affect signup success
  // -------------------------------------------------------------------------
  it('returns 200 even when sendAuthVerificationEmail fails (fire-and-forget)', async () => {
    // Override default sendAuthVerificationEmail mock to simulate failure
    vi.clearAllMocks();
    mockPendingInvitation().findMany.mockResolvedValueOnce([]);
    mockVerificationToken().create.mockResolvedValueOnce({
      identifier: VALID_BODY.email,
      token: 'some-token',
      expires: new Date(Date.now() + 86400000),
    });
    mockSendAuthVerificationEmail().mockResolvedValueOnce({ success: false, error: 'Resend unavailable' });

    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 14. verificationToken.create throws → signup still returns 200 (non-fatal)
  // -------------------------------------------------------------------------
  it('returns 200 even when prisma.verificationToken.create throws (fire-and-forget)', async () => {
    // Override default verificationToken mock to simulate failure
    vi.clearAllMocks();
    mockPendingInvitation().findMany.mockResolvedValueOnce([]);
    mockVerificationToken().create.mockRejectedValueOnce(new Error('Token table locked'));
    // sendNotificationEmail won't be called if token create throws, but we still need no crash

    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 15. prisma.user.create called with hashed password (not plain text)
  // -------------------------------------------------------------------------
  it('creates the user with a hashed password (not plain text)', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    await POST(makeRequest(VALID_BODY));

    const userCreate = mockUser().create;
    expect(userCreate).toHaveBeenCalledOnce();
    const createArg = userCreate.mock.calls[0][0] as { data: { password: string; email: string; name: string } };
    expect(createArg.data.password).not.toBe(VALID_BODY.password);
    expect(createArg.data.password).toBe('hashed-password-xyz');
    expect(createArg.data.email).toBe(VALID_BODY.email);
    expect(createArg.data.name).toBe(VALID_BODY.name);
  });
});
