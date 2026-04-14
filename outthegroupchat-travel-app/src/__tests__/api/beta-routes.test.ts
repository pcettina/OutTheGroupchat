/**
 * Unit tests for beta API routes:
 *   POST /api/beta/signup
 *   GET  /api/beta/status
 *   GET  /api/beta/initialize-password  (issue token)
 *   POST /api/beta/initialize-password  (set password)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, bcryptjs, logger) are mocked.
 * - Route handlers imported statically at the top of the file (avoids the
 *   10-second dynamic-import timeout seen with beforeEach imports).
 * - vi.clearAllMocks() in beforeEach to reset call history.
 * - All mock setups use mockResolvedValueOnce() per the mock hygiene rules.
 * - beta/status uses its own in-memory rate limiter (not Redis); rate-limit
 *   tests drive 10+ requests from the same IP to trigger the 429 path.
 *
 * Coverage
 * --------
 * beta/signup:
 *   - Missing / invalid API key → 401
 *   - Invalid body (missing email, bad format) → 400
 *   - New user created → 201 with user object
 *   - New user without optional name → 201
 *   - Email lowercased before create
 *   - Existing user without betaSignupDate → 200, updates date
 *   - Existing user with betaSignupDate → 200, returns existing
 *   - passwordInitialized reflects existing password field
 *   - Unique-constraint DB error → 400
 *   - Unexpected DB error → 500
 *
 * beta/status:
 *   - Missing email param → 400
 *   - Invalid email format → 400
 *   - Unknown email → 200 { exists: false, passwordInitialized: false }
 *   - Known email, not initialized → 200 { exists: true, passwordInitialized: false }
 *   - Known email, initialized → 200 { exists: true, passwordInitialized: true }
 *   - Email normalized to lowercase
 *   - No email/betaSignupDate exposed in response
 *   - In-memory rate limit exceeded (11th request same IP) → 429
 *   - DB error → 500
 *
 * beta/initialize-password GET (issue token):
 *   - Missing / invalid API key → 401
 *   - N8N_API_KEY env var unset → 401 (fail-closed)
 *   - Missing email param → 400
 *   - Invalid email format → 400
 *   - User not found → 404
 *   - Password already initialized → 400
 *   - Happy path → 200 with token + expires
 *   - Token rotation (deleteMany before create)
 *   - DB error → 500
 *
 * beta/initialize-password POST (set password):
 *   - Missing / invalid API key → 401
 *   - Invalid body (missing fields, short password, bad email) → 400
 *   - User not found → 400 (avoids enumeration)
 *   - Password already initialized → 400
 *   - Token not found → 400
 *   - Expired token → 400 (cleans up record)
 *   - Happy path (no pending invitations) → 200 { success: true }
 *   - Happy path with pending invitations → 200, invitations processed
 *   - Invitation processing error is non-fatal → still 200
 *   - DB error → 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: bcryptjs — prevent real bcrypt computation in tests
// ---------------------------------------------------------------------------
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — explicit vi.fn() for every model method + $transaction
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
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    pendingInvitation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    tripInvitation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    trip: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/logger — silence output
// ---------------------------------------------------------------------------
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
}));

// ---------------------------------------------------------------------------
// Static imports of all route handlers (must come AFTER all vi.mock() calls)
// ---------------------------------------------------------------------------
import { POST as betaSignupPOST } from '@/app/api/beta/signup/route';
import { GET as betaStatusGET } from '@/app/api/beta/status/route';
import {
  GET as initPasswordGET,
  POST as initPasswordPOST,
} from '@/app/api/beta/initialize-password/route';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_API_KEY = 'test-n8n-api-key';
const MOCK_EMAIL = 'beta@example.com';
const MOCK_NAME = 'Beta User';
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const VALID_TOKEN = 'a'.repeat(64); // 32-byte hex = 64 hex chars
const FUTURE_DATE = new Date(Date.now() + 72 * 60 * 60 * 1000);
const PAST_DATE = new Date(Date.now() - 1000);
const BASE_URL = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_BASE = {
  id: MOCK_USER_ID,
  email: MOCK_EMAIL,
  name: MOCK_NAME,
  password: null,
  passwordInitialized: false,
  betaSignupDate: null,
  newsletterSubscribed: false,
};

const MOCK_USER_BETA_SET = {
  ...MOCK_USER_BASE,
  betaSignupDate: new Date('2026-03-01T00:00:00Z'),
};

const MOCK_USER_WITH_PASSWORD = {
  ...MOCK_USER_BASE,
  password: 'hashed-password',
  passwordInitialized: true,
  betaSignupDate: new Date('2026-03-01T00:00:00Z'),
};

const MOCK_VERIFICATION_TOKEN = {
  identifier: `beta-init:${MOCK_EMAIL}`,
  token: VALID_TOKEN,
  expires: FUTURE_DATE,
};

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------

function makeSignupRequest(body: unknown, apiKey: string | null = VALID_API_KEY): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey !== null) headers['x-api-key'] = apiKey;
  return new NextRequest(`${BASE_URL}/api/beta/signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// Each status request uses a unique IP to avoid cross-test rate-limit pollution
let _ipSeq = 0;
function makeStatusRequest(email: string | null, ip?: string): NextRequest {
  const uniqueIp = ip ?? `10.255.${Math.floor(++_ipSeq / 256)}.${_ipSeq % 256}`;
  const url = email !== null
    ? `${BASE_URL}/api/beta/status?email=${encodeURIComponent(email)}`
    : `${BASE_URL}/api/beta/status`;
  return new NextRequest(url, {
    method: 'GET',
    headers: { 'x-forwarded-for': uniqueIp },
  });
}

function makeInitPasswordGetRequest(
  email: string | null,
  apiKey: string | null = VALID_API_KEY,
): NextRequest {
  const url = email !== null
    ? `${BASE_URL}/api/beta/initialize-password?email=${encodeURIComponent(email)}`
    : `${BASE_URL}/api/beta/initialize-password`;
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers['x-api-key'] = apiKey;
  return new NextRequest(url, { method: 'GET', headers });
}

function makeInitPasswordPostRequest(
  body: unknown,
  apiKey: string | null = VALID_API_KEY,
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey !== null) headers['x-api-key'] = apiKey;
  return new NextRequest(`${BASE_URL}/api/beta/initialize-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.N8N_API_KEY = VALID_API_KEY;
});

// ===========================================================================
// POST /api/beta/signup
// ===========================================================================

describe('POST /api/beta/signup', () => {
  it('returns 401 when API key header is missing', async () => {
    const req = makeSignupRequest({ email: MOCK_EMAIL }, null);
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 401 when API key is incorrect', async () => {
    const req = makeSignupRequest({ email: MOCK_EMAIL }, 'wrong-key');
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when email is missing from body', async () => {
    const req = makeSignupRequest({ name: 'No Email' });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
    expect(json.details).toBeDefined();
  });

  it('returns 400 when email is malformed', async () => {
    const req = makeSignupRequest({ email: 'not-an-email' });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('creates a new user and returns 201 with user object', async () => {
    const createdUser = { ...MOCK_USER_BASE, betaSignupDate: new Date() };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce(createdUser as never);

    const req = makeSignupRequest({ email: MOCK_EMAIL, name: MOCK_NAME });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.email).toBe(MOCK_EMAIL);
    expect(json.user.passwordInitialized).toBe(false);
    expect(json.user.betaSignupDate).toBeDefined();
  });

  it('creates a new user without optional name field', async () => {
    const createdUser = { ...MOCK_USER_BASE, name: null, betaSignupDate: new Date() };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce(createdUser as never);

    const req = makeSignupRequest({ email: MOCK_EMAIL });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('normalizes email to lowercase before calling findUnique', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      ...MOCK_USER_BASE,
      betaSignupDate: new Date(),
    } as never);

    const req = makeSignupRequest({ email: 'BETA@EXAMPLE.COM' });
    await betaSignupPOST(req);

    expect(vi.mocked(prisma.user.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'beta@example.com' } }),
    );
  });

  it('updates existing user who has no betaSignupDate and returns 200', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ ...MOCK_USER_BASE } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(MOCK_USER_BETA_SET as never);

    const req = makeSignupRequest({ email: MOCK_EMAIL, name: MOCK_NAME });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledOnce();
  });

  it('returns 200 with existing data when user already has betaSignupDate (no update)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_BETA_SET as never);

    const req = makeSignupRequest({ email: MOCK_EMAIL });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user.id).toBe(MOCK_USER_ID);
    expect(vi.mocked(prisma.user.update)).not.toHaveBeenCalled();
  });

  it('reflects passwordInitialized: true when existing user has a password hash', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_WITH_PASSWORD as never);

    const req = makeSignupRequest({ email: MOCK_EMAIL });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.passwordInitialized).toBe(true);
  });

  it('returns 400 on Unique constraint DB error', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`email`)'),
    );

    const req = makeSignupRequest({ email: MOCK_EMAIL });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Email already exists');
  });

  it('returns 500 on unexpected DB error', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeSignupRequest({ email: MOCK_EMAIL });
    const res = await betaSignupPOST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/unable to process/i);
  });
});

// ===========================================================================
// GET /api/beta/status
// ===========================================================================

describe('GET /api/beta/status', () => {
  it('returns 400 when email param is missing', async () => {
    const req = makeStatusRequest(null);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/email parameter is required/i);
  });

  it('returns 400 when email format is invalid', async () => {
    const req = makeStatusRequest('not-an-email');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid email/i);
  });

  it('returns exists: false, passwordInitialized: false when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const req = makeStatusRequest(MOCK_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.exists).toBe(false);
    expect(json.passwordInitialized).toBe(false);
  });

  it('returns exists: true, passwordInitialized: false when user exists but has no password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ passwordInitialized: false } as never);

    const req = makeStatusRequest(MOCK_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.exists).toBe(true);
    expect(json.passwordInitialized).toBe(false);
  });

  it('returns exists: true, passwordInitialized: true when user has initialized password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ passwordInitialized: true } as never);

    const req = makeStatusRequest(MOCK_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.exists).toBe(true);
    expect(json.passwordInitialized).toBe(true);
  });

  it('normalizes email to lowercase before querying', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const req = makeStatusRequest('BETA@EXAMPLE.COM');
    await betaStatusGET(req);

    expect(vi.mocked(prisma.user.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'beta@example.com' } }),
    );
  });

  it('does NOT expose email or betaSignupDate in the response', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ passwordInitialized: false } as never);

    const req = makeStatusRequest(MOCK_EMAIL);
    const res = await betaStatusGET(req);
    const json = await res.json();
    expect(json.email).toBeUndefined();
    expect(json.betaSignupDate).toBeUndefined();
  });

  it('returns 429 when in-memory rate limit is exceeded for the same IP (11th request)', async () => {
    // Use a unique IP to avoid pollution from other tests
    const ip = `192.168.200.${(_ipSeq % 200) + 1}`;
    // 10 successful requests
    for (let i = 0; i < 10; i++) {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
      const res = await betaStatusGET(makeStatusRequest(MOCK_EMAIL, ip));
      expect(res.status).toBe(200);
    }
    // 11th should be blocked
    const res = await betaStatusGET(makeStatusRequest(MOCK_EMAIL, ip));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/too many requests/i);
  });

  it('returns 500 on unexpected DB error', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB timeout'));

    const req = makeStatusRequest(MOCK_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/unable to check status/i);
  });
});

// ===========================================================================
// GET /api/beta/initialize-password  (issue token)
// ===========================================================================

describe('GET /api/beta/initialize-password (issue token)', () => {
  it('returns 401 when API key header is missing', async () => {
    const req = makeInitPasswordGetRequest(MOCK_EMAIL, null);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 401 when API key is incorrect', async () => {
    const req = makeInitPasswordGetRequest(MOCK_EMAIL, 'wrong-key');
    const res = await initPasswordGET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when N8N_API_KEY env var is unset (fail-closed)', async () => {
    delete process.env.N8N_API_KEY;
    const req = makeInitPasswordGetRequest(MOCK_EMAIL, VALID_API_KEY);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(401);
    // Restore
    process.env.N8N_API_KEY = VALID_API_KEY;
  });

  it('returns 400 when email param is missing', async () => {
    const req = makeInitPasswordGetRequest(null);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('returns 400 when email format is invalid', async () => {
    const req = makeInitPasswordGetRequest('bad-email');
    const res = await initPasswordGET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('returns 404 when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const req = makeInitPasswordGetRequest(MOCK_EMAIL);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('User not found');
  });

  it('returns 400 when password is already initialized', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      passwordInitialized: true,
    } as never);

    const req = makeInitPasswordGetRequest(MOCK_EMAIL);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/already initialized/i);
  });

  it('issues a token and returns 200 with token (64 hex chars) and expires', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      passwordInitialized: false,
    } as never);
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValueOnce({ count: 0 } as never);
    vi.mocked(prisma.verificationToken.create).mockResolvedValueOnce(
      MOCK_VERIFICATION_TOKEN as never,
    );

    const req = makeInitPasswordGetRequest(MOCK_EMAIL);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.token).toBe('string');
    expect(json.token).toHaveLength(64);
    expect(json.expires).toBeDefined();
  });

  it('rotates existing token: calls deleteMany before create', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      passwordInitialized: false,
    } as never);
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.verificationToken.create).mockResolvedValueOnce(
      MOCK_VERIFICATION_TOKEN as never,
    );

    const req = makeInitPasswordGetRequest(MOCK_EMAIL);
    await initPasswordGET(req);

    const deleteManyOrder =
      vi.mocked(prisma.verificationToken.deleteMany).mock.invocationCallOrder[0];
    const createOrder =
      vi.mocked(prisma.verificationToken.create).mock.invocationCallOrder[0];
    expect(deleteManyOrder).toBeLessThan(createOrder);
  });

  it('passes correct identifier to deleteMany (token rotation)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      passwordInitialized: false,
    } as never);
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValueOnce({ count: 0 } as never);
    vi.mocked(prisma.verificationToken.create).mockResolvedValueOnce(
      MOCK_VERIFICATION_TOKEN as never,
    );

    const req = makeInitPasswordGetRequest(MOCK_EMAIL);
    await initPasswordGET(req);

    expect(vi.mocked(prisma.verificationToken.deleteMany)).toHaveBeenCalledWith({
      where: { identifier: `beta-init:${MOCK_EMAIL}` },
    });
  });

  it('returns 500 on unexpected DB error', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB error'));

    const req = makeInitPasswordGetRequest(MOCK_EMAIL);
    const res = await initPasswordGET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/unable to issue/i);
  });
});

// ===========================================================================
// POST /api/beta/initialize-password  (set password)
// ===========================================================================

describe('POST /api/beta/initialize-password (set password)', () => {
  const VALID_BODY = {
    email: MOCK_EMAIL,
    password: 'SecurePass123!',
    token: VALID_TOKEN,
  };

  /**
   * Helper to wire up a successful $transaction mock that calls the
   * callback with a minimal tx stub.
   */
  function mockSuccessfulTransaction() {
    const updatedUser = { ...MOCK_USER_BASE, password: 'hashed', passwordInitialized: true };
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      (async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { update: vi.fn().mockResolvedValueOnce(updatedUser) },
          verificationToken: { delete: vi.fn().mockResolvedValueOnce({}) },
        })) as never,
    );
    return updatedUser;
  }

  it('returns 401 when API key header is missing', async () => {
    const req = makeInitPasswordPostRequest(VALID_BODY, null);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 401 when API key is incorrect', async () => {
    const req = makeInitPasswordPostRequest(VALID_BODY, 'bad-key');
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when email is missing from body', async () => {
    const req = makeInitPasswordPostRequest({ password: 'SecurePass123!', token: VALID_TOKEN });
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('returns 400 when password is too short (< 8 chars)', async () => {
    const req = makeInitPasswordPostRequest({ email: MOCK_EMAIL, password: 'short', token: VALID_TOKEN });
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('returns 400 when password exceeds 128 characters', async () => {
    const req = makeInitPasswordPostRequest({
      email: MOCK_EMAIL,
      password: 'A'.repeat(129),
      token: VALID_TOKEN,
    });
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('returns 400 when token is missing from body', async () => {
    const req = makeInitPasswordPostRequest({ email: MOCK_EMAIL, password: 'SecurePass123!' });
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('returns 400 when email format is invalid', async () => {
    const req = makeInitPasswordPostRequest({ email: 'bad-email', password: 'SecurePass123!', token: VALID_TOKEN });
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('returns 400 (not 404) when user is not found — prevents email enumeration', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid or expired/i);
  });

  it('returns 400 when password is already initialized', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_WITH_PASSWORD as never);

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/already initialized/i);
  });

  it('returns 400 when verification token is not found in the database', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_BASE as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(null);

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid or expired/i);
  });

  it('returns 400 when token is expired and attempts to clean up the record', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_BASE as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce({
      ...MOCK_VERIFICATION_TOKEN,
      expires: PAST_DATE,
    } as never);
    vi.mocked(prisma.verificationToken.delete).mockResolvedValueOnce({} as never);

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/expired/i);
    // Route should attempt cleanup
    expect(vi.mocked(prisma.verificationToken.delete)).toHaveBeenCalledOnce();
  });

  it('returns 200 with success message when password is successfully initialized', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_BASE as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      MOCK_VERIFICATION_TOKEN as never,
    );
    mockSuccessfulTransaction();
    vi.mocked(prisma.pendingInvitation.findMany).mockResolvedValueOnce([]);

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/initialized successfully/i);
  });

  it('processes pending trip invitations on success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_BASE as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      MOCK_VERIFICATION_TOKEN as never,
    );
    const updatedUser = mockSuccessfulTransaction();

    const pendingInvitation = {
      id: 'pi-1',
      tripId: 'trip-abc',
      email: MOCK_EMAIL,
      expiresAt: FUTURE_DATE,
      trip: { title: 'Barcelona Trip' },
    };
    vi.mocked(prisma.pendingInvitation.findMany).mockResolvedValueOnce([pendingInvitation] as never);
    vi.mocked(prisma.tripInvitation.create).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.notification.create).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.pendingInvitation.deleteMany).mockResolvedValueOnce({ count: 1 } as never);

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(200);

    expect(vi.mocked(prisma.tripInvitation.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: 'trip-abc',
          userId: updatedUser.id,
          status: 'PENDING',
        }),
      }),
    );
    expect(vi.mocked(prisma.notification.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: updatedUser.id,
          type: 'TRIP_INVITATION',
        }),
      }),
    );
    expect(vi.mocked(prisma.pendingInvitation.deleteMany)).toHaveBeenCalledWith({
      where: { email: MOCK_EMAIL },
    });
  });

  it('returns 200 even when invitation processing throws (non-fatal path)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_BASE as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      MOCK_VERIFICATION_TOKEN as never,
    );
    mockSuccessfulTransaction();
    vi.mocked(prisma.pendingInvitation.findMany).mockRejectedValueOnce(
      new Error('invitation DB error'),
    );

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('token is consumed inside the transaction (delete called with correct args)', async () => {
    const txDelete = vi.fn().mockResolvedValueOnce({});
    const txUserUpdate = vi.fn().mockResolvedValueOnce({
      ...MOCK_USER_BASE,
      password: 'hashed',
      passwordInitialized: true,
    });

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_BASE as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValueOnce(
      MOCK_VERIFICATION_TOKEN as never,
    );
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      (async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          user: { update: txUserUpdate },
          verificationToken: { delete: txDelete },
        })) as never,
    );
    vi.mocked(prisma.pendingInvitation.findMany).mockResolvedValueOnce([]);

    const req = makeInitPasswordPostRequest(VALID_BODY);
    await initPasswordPOST(req);

    expect(txDelete).toHaveBeenCalledWith({
      where: {
        identifier_token: {
          identifier: `beta-init:${MOCK_EMAIL}`,
          token: VALID_TOKEN,
        },
      },
    });
  });

  it('returns 500 on unexpected top-level DB error', async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('Connection refused'));

    const req = makeInitPasswordPostRequest(VALID_BODY);
    const res = await initPasswordPOST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/unable to initialize/i);
  });
});
