/**
 * Unit tests for the Auth Signup API route handler.
 *
 * Route: POST /api/auth/signup
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, logger) are mocked in
 *   src/__tests__/setup.ts.  This file extends those mocks with the
 *   additional Prisma models and methods the signup handler calls:
 *   user.create, user.update, pendingInvitation.findMany,
 *   pendingInvitation.deleteMany, and tripInvitation.create.
 * - bcryptjs is mocked so tests run without real hashing overhead and so the
 *   "does not store plaintext" test can assert that bcrypt.hash was called.
 * - The signup route does NOT use NextAuth sessions — it is a public endpoint.
 * - Duplicate email returns HTTP 400 (not 409) — this matches the route
 *   implementation which uses NextResponse.json({ error: ... }, { status: 400 }).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock rate-limit so tests don't hit real Upstash Redis (avoids ~4500ms latency).
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  authRateLimiter: null,
  apiRateLimiter: null,
  aiRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Mock bcryptjs so hash() is deterministic and fast in tests.
// ---------------------------------------------------------------------------
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password-value'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue('hashed-password-value'),
  compare: vi.fn().mockResolvedValue(true),
}));

// Extend the global prisma mock with the additional models and methods the
// signup handler calls beyond what setup.ts provides.
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
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
        create: vi.fn(),
        update: vi.fn(),
      },
      notification: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
});

// Import the handler after the mock declarations.
import { POST } from '@/app/api/auth/signup/route';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockBcryptHash = vi.mocked(bcrypt.hash);
const mockPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockPrismaPendingInvitation = prisma.pendingInvitation as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-signup-444';

const VALID_BODY = {
  name: 'New User',
  email: 'newuser@example.com',
  password: 'securepass123',
};

/** A minimal user row as Prisma would return it after creation. */
const MOCK_CREATED_USER = {
  id: MOCK_USER_ID,
  name: 'New User',
  email: 'newuser@example.com',
  password: 'hashed-password-value',
  passwordInitialized: true,
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-01'),
};

/** Build a minimal Request accepted by the App Router handlers. */
function makeRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Parse JSON from a NextResponse-compatible Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Default: no pending invitations to process
  mockPrismaPendingInvitation.findMany.mockResolvedValue([]);
});

// ===========================================================================
// POST /api/auth/signup
// ===========================================================================
describe('POST /api/auth/signup', () => {
  it('creates a new user with valid email and password', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null); // no existing user
    mockPrismaUser.create.mockResolvedValueOnce(MOCK_CREATED_USER);

    const req = makeRequest('/api/auth/signup', VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user.id).toBe(MOCK_USER_ID);
    expect(body.user.email).toBe(VALID_BODY.email);
    expect(mockPrismaUser.create).toHaveBeenCalledOnce();
  });

  it('returns 400 when email is missing', async () => {
    const { email: _omitted, ...bodyWithoutEmail } = VALID_BODY;
    const req = makeRequest('/api/auth/signup', bodyWithoutEmail);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Missing required fields');
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });

  it('returns 400 when password is missing', async () => {
    const { password: _omitted, ...bodyWithoutPassword } = VALID_BODY;
    const req = makeRequest('/api/auth/signup', bodyWithoutPassword);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Missing required fields');
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const { name: _omitted, ...bodyWithoutName } = VALID_BODY;
    const req = makeRequest('/api/auth/signup', bodyWithoutName);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Missing required fields');
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the email format is invalid', async () => {
    const req = makeRequest('/api/auth/signup', { ...VALID_BODY, email: 'not-an-email' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid email format');
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the password is fewer than 6 characters', async () => {
    const req = makeRequest('/api/auth/signup', { ...VALID_BODY, password: 'abc' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Password must be at least 6 characters');
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the email is already registered with a password', async () => {
    // Simulate an existing user who already has a password set
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      ...MOCK_CREATED_USER,
      password: 'already-hashed',
    });

    const req = makeRequest('/api/auth/signup', VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('An account with this email already exists');
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });

  it('does not store the plaintext password — bcrypt.hash is called before create', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    mockPrismaUser.create.mockResolvedValueOnce(MOCK_CREATED_USER);

    const req = makeRequest('/api/auth/signup', VALID_BODY);
    await POST(req);

    // bcrypt.hash must have been called with the plaintext password
    expect(mockBcryptHash).toHaveBeenCalledWith(VALID_BODY.password, expect.any(Number));

    // The value passed to prisma.user.create must be the hashed output, not
    // the original plaintext password
    const createCall = mockPrismaUser.create.mock.calls[0][0];
    expect(createCall.data.password).toBe('hashed-password-value');
    expect(createCall.data.password).not.toBe(VALID_BODY.password);
  });

  it('allows a beta user (existing account with no password) to set a password', async () => {
    // Beta signup: user exists in DB but has no password yet
    const betaUser = { ...MOCK_CREATED_USER, password: null, passwordInitialized: false };
    mockPrismaUser.findUnique.mockResolvedValueOnce(betaUser);
    mockPrismaUser.update.mockResolvedValueOnce({ ...betaUser, password: 'hashed-password-value', passwordInitialized: true });

    const req = makeRequest('/api/auth/signup', VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // update must be called, not create
    expect(mockPrismaUser.update).toHaveBeenCalledOnce();
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });

  it('returns 500 when Prisma throws an unexpected error', async () => {
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('/api/auth/signup', VALID_BODY);
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
    expect(mockPrismaUser.create).not.toHaveBeenCalled();
  });
});
