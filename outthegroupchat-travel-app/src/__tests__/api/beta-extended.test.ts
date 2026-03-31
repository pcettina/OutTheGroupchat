/**
 * Extended edge-case tests for beta/status and beta/initialize-password routes.
 *
 * These tests cover gaps NOT present in beta.test.ts or beta-initialize-password.test.ts:
 *
 * GET /api/beta/status
 *   - Rate limiting (11th request from same IP → 429)
 *   - Empty string email param (?email=)
 *   - Email with surrounding whitespace is treated as invalid
 *   - passwordInitialized: false returned when user exists but not yet initialized
 *   - x-forwarded-for header drives per-IP rate limiting
 *
 * POST /api/beta/initialize-password
 *   - Missing API key → 401
 *   - Wrong API key → 401
 *   - Password exceeds max length (> 128 chars) → 400
 *   - Missing email field → 400
 *   - Missing password field → 400
 *   - Empty / non-JSON body → 500 (JSON parse failure)
 *   - DB error during user lookup → 500
 *   - DB error during $transaction → 500
 *   - Expired token cleanup: verificationToken.delete is called with correct args
 *   - Pending invitations converted to tripInvitations + notifications on success
 *
 * GET /api/beta/initialize-password (token issuance)
 *   - Missing email query param → 400
 *   - DB error during token creation → 500
 *   - Token rotation when a previous token already exists (deleteMany called)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

import { GET as betaStatusGET } from '@/app/api/beta/status/route';
import {
  POST as initPasswordPOST,
  GET as initPasswordGET,
} from '@/app/api/beta/initialize-password/route';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));

// Mock rate-limit to avoid real Upstash Redis calls and allow per-test control
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 }),
  authRateLimiter: {},
  aiRateLimiter: {},
  apiRateLimiter: {},
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

/**
 * Override the prisma mock from setup.ts to add $transaction support required
 * by the initialize-password POST route. The setup.ts mock does not include it.
 */
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      user: { findUnique: vi.fn(), update: vi.fn() },
      verificationToken: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      pendingInvitation: { findMany: vi.fn(), deleteMany: vi.fn() },
      tripInvitation: { create: vi.fn() },
      notification: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_API_KEY = 'test-n8n-key';
const VALID_TOKEN = 'a'.repeat(64);
const TEST_EMAIL = 'beta@example.com';

const mockUser = {
  id: 'user-1',
  email: TEST_EMAIL,
  name: 'Beta User',
  password: null,
  passwordInitialized: false,
};

const mockVerificationToken = {
  identifier: `beta-init:${TEST_EMAIL}`,
  token: VALID_TOKEN,
  expires: new Date(Date.now() + 72 * 60 * 60 * 1000),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatusRequest(emailParam?: string, ip?: string): NextRequest {
  const url = emailParam !== undefined
    ? `http://localhost:3000/api/beta/status?email=${encodeURIComponent(emailParam)}`
    : 'http://localhost:3000/api/beta/status';
  const headers: Record<string, string> = {};
  if (ip) {
    headers['x-forwarded-for'] = ip;
  }
  return new NextRequest(url, { method: 'GET', headers });
}

function makeInitPasswordPostRequest(
  body: unknown,
  apiKey?: string,
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey !== undefined) {
    headers['x-api-key'] = apiKey;
  }
  return new Request('http://localhost/api/beta/initialize-password', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function makeInitPasswordGetRequest(
  emailParam?: string,
  apiKey?: string,
): Request {
  const base = 'http://localhost/api/beta/initialize-password';
  const url = emailParam !== undefined
    ? `${base}?email=${encodeURIComponent(emailParam)}`
    : base;
  const headers: Record<string, string> = {};
  if (apiKey !== undefined) {
    headers['x-api-key'] = apiKey;
  }
  return new Request(url, { method: 'GET', headers });
}

// ---------------------------------------------------------------------------
// GET /api/beta/status — extended edge cases
// ---------------------------------------------------------------------------

describe('GET /api/beta/status — extended edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('N8N_API_KEY', VALID_API_KEY);
    // Re-establish rate-limit mock after resetAllMocks (default: allow all requests)
    vi.mocked(checkRateLimit).mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 400 when email param is an empty string', async () => {
    // ?email= → empty string, not missing, but fails Zod email validation
    const req = makeStatusRequest('');
    const res = await betaStatusGET(req);
    // Empty string fails the `!email` guard (falsy) → 400 "Email parameter is required"
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 when email param is whitespace only', async () => {
    const req = makeStatusRequest('   ');
    const res = await betaStatusGET(req);
    // Whitespace-only string passes the `!email` check but fails Zod email validation
    expect(res.status).toBe(400);
  });

  it('returns passwordInitialized: false when user exists but is not yet initialized', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      passwordInitialized: false,
    } as never);

    const req = makeStatusRequest(TEST_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // The `exists` field is intentionally omitted to prevent user enumeration.
    expect(body.exists).toBeUndefined();
    expect(body.passwordInitialized).toBe(false);
  });

  it('returns 429 when checkRateLimit indicates limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const req = makeStatusRequest(TEST_EMAIL, '10.0.0.1');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('uses x-forwarded-for IP as the rate-limit identifier', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const req = makeStatusRequest(TEST_EMAIL, '203.0.113.42');
    await betaStatusGET(req);
    expect(vi.mocked(checkRateLimit)).toHaveBeenCalledWith(
      expect.anything(),
      'beta-status:203.0.113.42',
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/beta/initialize-password — extended edge cases
// ---------------------------------------------------------------------------

describe('POST /api/beta/initialize-password — extended edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('N8N_API_KEY', VALID_API_KEY);
    // pendingInvitation.findMany defaults to empty — override per-test when needed
    vi.mocked(prisma.pendingInvitation.findMany).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when API key header is absent', async () => {
    // makeInitPasswordPostRequest without apiKey omits the header
    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN },
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 401 when API key is incorrect', async () => {
    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN },
      'wrong-key',
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when password exceeds 128 characters', async () => {
    const tooLong = 'A'.repeat(129);
    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: tooLong, token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when email field is missing from body', async () => {
    const req = makeInitPasswordPostRequest(
      { password: 'SecurePass123', token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when password field is missing from body', async () => {
    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 500 when body is not valid JSON', async () => {
    const req = makeInitPasswordPostRequest('not-valid-json{{', VALID_API_KEY);
    const res = await initPasswordPOST(req);
    // JSON.parse throws → caught by the outer try/catch → 500
    expect(res.status).toBe(500);
  });

  it('returns 500 when prisma.user.findUnique throws', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(
      new Error('DB connection error'),
    );
    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(500);
  });

  it('returns 500 when $transaction throws', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      mockVerificationToken,
    );
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error('Transaction failed'),
    );

    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(500);
  });

  it('cleans up expired token record via verificationToken.delete', async () => {
    const expiredToken = {
      ...mockVerificationToken,
      expires: new Date(Date.now() - 1000), // 1 second ago
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      expiredToken,
    );
    vi.mocked(prisma.verificationToken.delete).mockResolvedValueOnce(
      expiredToken,
    );

    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('expired');

    // Verify the route attempted to clean up the expired record
    expect(prisma.verificationToken.delete).toHaveBeenCalledWith({
      where: {
        identifier_token: {
          identifier: `beta-init:${TEST_EMAIL}`,
          token: VALID_TOKEN,
        },
      },
    });
  });

  it('converts pending invitations to tripInvitations and notifications on success', async () => {
    const tripId = 'trip-abc';
    const pendingInvites = [
      {
        id: 'pi-1',
        tripId,
        email: TEST_EMAIL,
        expiresAt: new Date(Date.now() + 60_000),
        trip: { title: 'Beach Trip' },
      },
    ];

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      mockVerificationToken,
    );

    const updatedUser = { ...mockUser, password: 'hashed', passwordInitialized: true };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) =>
      fn({
        user: { update: vi.fn().mockResolvedValue(updatedUser) },
        verificationToken: { delete: vi.fn() },
      } as never),
    );

    vi.mocked(prisma.pendingInvitation.findMany).mockResolvedValueOnce(
      pendingInvites as never,
    );
    vi.mocked(prisma.tripInvitation.create).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.notification.create).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.pendingInvitation.deleteMany).mockResolvedValueOnce(
      { count: 1 },
    );

    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(200);

    // Pending invitations should be converted
    expect(prisma.tripInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tripId, userId: updatedUser.id, status: 'PENDING' }),
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: updatedUser.id,
          type: 'TRIP_INVITATION',
        }),
      }),
    );
    expect(prisma.pendingInvitation.deleteMany).toHaveBeenCalledWith({
      where: { email: TEST_EMAIL },
    });
  });

  it('returns 200 even when pending invitation processing fails (non-fatal error path)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      mockVerificationToken,
    );

    const updatedUser = { ...mockUser, password: 'hashed', passwordInitialized: true };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) =>
      fn({
        user: { update: vi.fn().mockResolvedValue(updatedUser) },
        verificationToken: { delete: vi.fn() },
      } as never),
    );

    // Simulate an error in the invitation processing step
    vi.mocked(prisma.pendingInvitation.findMany).mockRejectedValueOnce(
      new Error('Invitation lookup failed'),
    );

    const req = makeInitPasswordPostRequest(
      { email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN },
      VALID_API_KEY,
    );
    const res = await initPasswordPOST(req);
    // The route catches invitation errors internally and still returns 200
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/beta/initialize-password (token issuance) — extended edge cases
// ---------------------------------------------------------------------------

describe('GET /api/beta/initialize-password — extended edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('N8N_API_KEY', VALID_API_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 400 when email query param is missing entirely', async () => {
    const req = makeInitPasswordGetRequest(undefined, VALID_API_KEY);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when email query param is an empty string', async () => {
    const req = makeInitPasswordGetRequest('', VALID_API_KEY);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 when verificationToken.create throws', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValueOnce(
      { count: 0 },
    );
    vi.mocked(prisma.verificationToken.create).mockRejectedValueOnce(
      new Error('DB write error'),
    );

    const req = makeInitPasswordGetRequest(TEST_EMAIL, VALID_API_KEY);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(500);
  });

  it('rotates an existing token (deleteMany called before create) and returns new token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);
    // Simulate 1 existing token being deleted
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValueOnce(
      { count: 1 },
    );
    vi.mocked(prisma.verificationToken.create).mockResolvedValueOnce(
      mockVerificationToken,
    );

    const req = makeInitPasswordGetRequest(TEST_EMAIL, VALID_API_KEY);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(200);

    // deleteMany must be called before create (rotation)
    const deleteManyOrder = vi.mocked(prisma.verificationToken.deleteMany).mock.invocationCallOrder[0];
    const createOrder = vi.mocked(prisma.verificationToken.create).mock.invocationCallOrder[0];
    expect(deleteManyOrder).toBeLessThan(createOrder);

    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.expires).toBeDefined();
  });

  it('returns 500 when user lookup throws during token issuance', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(
      new Error('DB failure'),
    );
    const req = makeInitPasswordGetRequest(TEST_EMAIL, VALID_API_KEY);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(500);
  });
});
