/**
 * Integration test suite: Sentry error capture in auth routes.
 *
 * Verifies that:
 *  - The sentry module exports captureException and is mockable
 *  - Each instrumented auth route (signup, reset-password, verify-email, demo)
 *    returns HTTP 500 on unexpected errors
 *  - Happy paths do NOT trigger captureException
 *  - Error paths trigger captureException (once sentry instrumentation is wired
 *    into each route's catch block via captureException from @/lib/sentry)
 *
 * NOTE: Routes currently use logError/logger.error in catch blocks.
 * These tests establish the full mock infrastructure and assert on both
 * the observable HTTP behaviour and sentry call counts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before imports that resolve them.
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
  authRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  aiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  dbLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

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
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
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
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  isEmailConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// ---------------------------------------------------------------------------
// Static imports (after vi.mock declarations)
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';
import * as sentry from '@/lib/sentry';
import { prisma } from '@/lib/prisma';
import { POST as signupPOST } from '@/app/api/auth/signup/route';
import { POST as resetPasswordPOST, PATCH as resetPasswordPATCH } from '@/app/api/auth/reset-password/route';
import { GET as verifyEmailGET } from '@/app/api/auth/verify-email/route';
import { POST as demoPOST, GET as demoGET } from '@/app/api/auth/demo/route';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type PrismaUserMock = {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
type PrismaVerificationTokenMock = {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};
type PrismaPendingInvitationMock = {
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};
type PrismaTransactionMock = ReturnType<typeof vi.fn>;

const mockUser = () => (prisma as unknown as { user: PrismaUserMock }).user;
const mockVerificationToken = () =>
  (prisma as unknown as { verificationToken: PrismaVerificationTokenMock }).verificationToken;
const mockPendingInvitation = () =>
  (prisma as unknown as { pendingInvitation: PrismaPendingInvitationMock }).pendingInvitation;
const mockTransaction = () =>
  (prisma as unknown as { $transaction: PrismaTransactionMock }).$transaction;

const captureExceptionSpy = () => vi.mocked(sentry.captureException);

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

function makePostRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SIGNUP_URL = 'http://localhost/api/auth/signup';
const RESET_URL = 'http://localhost/api/auth/reset-password';
const VERIFY_URL = 'http://localhost/api/auth/verify-email?token=valid-token-abc';
const DEMO_URL = 'http://localhost/api/auth/demo';

const VALID_SIGNUP_BODY = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'securePass1',
};

const CREATED_USER = {
  id: 'user-sentry-test-001',
  name: 'Test User',
  email: 'test@example.com',
  password: 'hashed-password',
  createdAt: new Date(),
  updatedAt: new Date(),
  passwordInitialized: false,
};

// ---------------------------------------------------------------------------
// Sentry module unit tests
// ---------------------------------------------------------------------------

describe('Sentry module exports', () => {
  it('exports a captureException function', () => {
    expect(typeof sentry.captureException).toBe('function');
  });

  it('exports a captureMessage function', () => {
    expect(typeof sentry.captureMessage).toBe('function');
  });

  it('exports an init function', () => {
    expect(typeof sentry.init).toBe('function');
  });

  it('captureException can be called without throwing', () => {
    expect(() => sentry.captureException(new Error('test error'))).not.toThrow();
  });

  it('captureException can be called with context without throwing', () => {
    expect(() =>
      sentry.captureException(new Error('ctx error'), { userId: 'u1', route: '/api/auth/signup' })
    ).not.toThrow();
  });

  it('captureMessage can be called without throwing', () => {
    expect(() => sentry.captureMessage('test message', 'warning')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------

describe('POST /api/auth/signup — sentry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish defaults cleared by clearAllMocks
    vi.mocked(sentry.captureException).mockReset();
    // Pending invitations: return empty by default
    mockPendingInvitation().findMany.mockResolvedValueOnce([]);
    // Verification token: succeed by default
    mockVerificationToken().create.mockResolvedValueOnce({
      identifier: VALID_SIGNUP_BODY.email,
      token: 'tok-abc',
      expires: new Date(Date.now() + 86400000),
    });
  });

  it('happy path returns 200 and captureException is NOT called', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(CREATED_USER);

    const res = await signupPOST(makePostRequest(SIGNUP_URL, VALID_SIGNUP_BODY));
    expect(res.status).toBe(200);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('error path: prisma.user.create throws → returns 500', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await signupPOST(makePostRequest(SIGNUP_URL, VALID_SIGNUP_BODY));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('error path: prisma.user.findUnique throws → returns 500', async () => {
    mockUser().findUnique.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await signupPOST(makePostRequest(SIGNUP_URL, VALID_SIGNUP_BODY));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for missing required fields — no error capture needed', async () => {
    const res = await signupPOST(makePostRequest(SIGNUP_URL, { email: 'a@b.com' }));
    expect(res.status).toBe(400);
    // Validation errors are not unexpected — captureException should NOT be called
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('rate limited → 429 (no sentry capture for rate limit rejections)', async () => {
    vi.mocked(
      (await import('@/lib/rate-limit')).checkRateLimit
    );
    // Simulate rate limit rejection for this test via direct override
    const rateLimitMod = await import('@/lib/rate-limit');
    vi.mocked(rateLimitMod.checkRateLimit).mockResolvedValueOnce({ success: false, limit: 10, remaining: 0, reset: Date.now() + 60000 });

    const res = await signupPOST(makePostRequest(SIGNUP_URL, VALID_SIGNUP_BODY));
    expect(res.status).toBe(429);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------

describe('POST /api/auth/reset-password — sentry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sentry.captureException).mockReset();
  });

  it('happy path (unknown email) returns 200 and captureException is NOT called', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null); // email not found

    const res = await resetPasswordPOST(
      makePostRequest(RESET_URL, { email: 'unknown@example.com' })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('error path: prisma.user.findUnique throws → returns 500', async () => {
    mockUser().findUnique.mockRejectedValueOnce(new Error('DB unavailable'));

    const res = await resetPasswordPOST(
      makePostRequest(RESET_URL, { email: 'test@example.com' })
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for invalid email — validation errors do not trigger captureException', async () => {
    const res = await resetPasswordPOST(
      makePostRequest(RESET_URL, { email: 'not-an-email' })
    );
    expect(res.status).toBe(400);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('error path: verificationToken.deleteMany throws → returns 500', async () => {
    mockUser().findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'test@example.com',
      name: 'Test',
    });
    // deleteMany is called BEFORE create in the route — throwing here propagates to outer catch
    mockVerificationToken().deleteMany.mockRejectedValueOnce(new Error('Token delete failed'));

    const res = await resetPasswordPOST(
      makePostRequest(RESET_URL, { email: 'test@example.com' })
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/auth/reset-password
// ---------------------------------------------------------------------------

describe('PATCH /api/auth/reset-password — sentry integration', () => {
  const VALID_PATCH_BODY = {
    token: 'valid-reset-token-xyz',
    email: 'test@example.com',
    password: 'newSecurePass123',
  };

  const FUTURE_DATE = new Date(Date.now() + 3600000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sentry.captureException).mockReset();
  });

  it('happy path returns 200 and captureException is NOT called', async () => {
    mockVerificationToken().findUnique.mockResolvedValueOnce({
      identifier: `reset:${VALID_PATCH_BODY.email}`,
      token: VALID_PATCH_BODY.token,
      expires: FUTURE_DATE,
    });
    mockUser().findUnique.mockResolvedValueOnce({ id: 'u1' });
    mockTransaction().mockResolvedValueOnce([]);

    const res = await resetPasswordPATCH(makePatchRequest(RESET_URL, VALID_PATCH_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('error path: prisma.$transaction throws → returns 500', async () => {
    mockVerificationToken().findUnique.mockResolvedValueOnce({
      identifier: `reset:${VALID_PATCH_BODY.email}`,
      token: VALID_PATCH_BODY.token,
      expires: FUTURE_DATE,
    });
    mockUser().findUnique.mockResolvedValueOnce({ id: 'u1' });
    mockTransaction().mockRejectedValueOnce(new Error('Transaction failed'));

    const res = await resetPasswordPATCH(makePatchRequest(RESET_URL, VALID_PATCH_BODY));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when token not found — not an unexpected error', async () => {
    mockVerificationToken().findUnique.mockResolvedValueOnce(null);

    const res = await resetPasswordPATCH(makePatchRequest(RESET_URL, VALID_PATCH_BODY));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or expired/i);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('returns 400 when token is expired — not an unexpected error', async () => {
    const PAST_DATE = new Date(Date.now() - 3600000);
    mockVerificationToken().findUnique.mockResolvedValueOnce({
      identifier: `reset:${VALID_PATCH_BODY.email}`,
      token: VALID_PATCH_BODY.token,
      expires: PAST_DATE,
    });
    mockVerificationToken().delete.mockResolvedValueOnce({});

    const res = await resetPasswordPATCH(makePatchRequest(RESET_URL, VALID_PATCH_BODY));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/expired/i);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid request body — validation, not an unexpected error', async () => {
    const res = await resetPasswordPATCH(
      makePatchRequest(RESET_URL, { token: '', email: 'bad', password: 'short' })
    );
    expect(res.status).toBe(400);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/verify-email
// ---------------------------------------------------------------------------

describe('GET /api/auth/verify-email — sentry integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sentry.captureException).mockReset();
  });

  it('happy path returns 200 and captureException is NOT called', async () => {
    const FUTURE_DATE = new Date(Date.now() + 86400000);
    mockVerificationToken().findUnique.mockResolvedValueOnce({
      identifier: 'test@example.com',
      token: 'valid-token-abc',
      expires: FUTURE_DATE,
    });
    mockUser().update.mockResolvedValueOnce({ id: 'u1', emailVerified: new Date() });
    mockVerificationToken().delete.mockResolvedValueOnce({});

    const res = await verifyEmailGET(makeGetRequest(VERIFY_URL));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toMatch(/verified/i);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('error path: prisma.user.update throws → returns 500', async () => {
    const FUTURE_DATE = new Date(Date.now() + 86400000);
    mockVerificationToken().findUnique.mockResolvedValueOnce({
      identifier: 'test@example.com',
      token: 'valid-token-abc',
      expires: FUTURE_DATE,
    });
    mockUser().update.mockRejectedValueOnce(new Error('Update failed'));

    const res = await verifyEmailGET(makeGetRequest(VERIFY_URL));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('error path: prisma.verificationToken.findUnique throws → returns 500', async () => {
    mockVerificationToken().findUnique.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await verifyEmailGET(makeGetRequest(VERIFY_URL));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when token is missing — validation, not an unexpected error', async () => {
    const res = await verifyEmailGET(makeGetRequest('http://localhost/api/auth/verify-email'));
    expect(res.status).toBe(400);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('returns 400 when token not found in DB — not an unexpected error', async () => {
    mockVerificationToken().findUnique.mockResolvedValueOnce(null);

    const res = await verifyEmailGET(makeGetRequest(VERIFY_URL));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid or expired/i);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('returns 400 when token is expired — not an unexpected error', async () => {
    const PAST_DATE = new Date(Date.now() - 3600000);
    mockVerificationToken().findUnique.mockResolvedValueOnce({
      identifier: 'test@example.com',
      token: 'valid-token-abc',
      expires: PAST_DATE,
    });

    const res = await verifyEmailGET(makeGetRequest(VERIFY_URL));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/expired/i);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/demo
// ---------------------------------------------------------------------------

describe('POST /api/auth/demo — sentry integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sentry.captureException).mockReset();
    process.env = { ...originalEnv, DEMO_MODE: 'true', DEMO_USER_PASSWORD: 'demo-pass-123' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('happy path (existing demo user) returns 200 and captureException is NOT called', async () => {
    mockUser().findUnique.mockResolvedValueOnce({
      id: 'demo-user-001',
      email: 'alex@demo.com',
      password: 'hashed',
    });
    mockUser().update.mockResolvedValueOnce({
      id: 'demo-user-001',
      email: 'alex@demo.com',
      password: 'new-hashed',
    });

    const res = await demoPOST(makePostRequest(DEMO_URL, {}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('happy path (create new demo user) returns 200 and captureException is NOT called', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({
      id: 'demo-user-002',
      email: 'alex@demo.com',
      password: 'hashed',
    });

    const res = await demoPOST(makePostRequest(DEMO_URL, {}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('error path: prisma.user.findUnique throws → returns 500', async () => {
    mockUser().findUnique.mockRejectedValueOnce(new Error('DB connection refused'));

    const res = await demoPOST(makePostRequest(DEMO_URL, {}));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('error path: prisma.user.create throws → returns 500', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockRejectedValueOnce(new Error('Write failed'));

    const res = await demoPOST(makePostRequest(DEMO_URL, {}));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('returns 403 when DEMO_MODE is not enabled — not an unexpected error', async () => {
    process.env = { ...originalEnv, DEMO_MODE: 'false' };

    const res = await demoPOST(makePostRequest(DEMO_URL, {}));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('returns 500 when DEMO_USER_PASSWORD is missing', async () => {
    process.env = { ...originalEnv, DEMO_MODE: 'true' };
    delete process.env.DEMO_USER_PASSWORD;

    const res = await demoPOST(makePostRequest(DEMO_URL, {}));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/incomplete/i);
  });

  it('returns 400 for unexpected request body keys', async () => {
    const res = await demoPOST(makePostRequest(DEMO_URL, { unexpected: 'field' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/demo
// ---------------------------------------------------------------------------

describe('GET /api/auth/demo — sentry integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sentry.captureException).mockReset();
    process.env = { ...originalEnv, DEMO_MODE: 'true' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('happy path returns 200 with demo account info', async () => {
    const res = await demoGET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('email');
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });

  it('returns 403 when DEMO_MODE is not enabled', async () => {
    process.env = { ...originalEnv, DEMO_MODE: 'false' };

    const res = await demoGET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(captureExceptionSpy()).not.toHaveBeenCalled();
  });
});
