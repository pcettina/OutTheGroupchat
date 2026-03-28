// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before any imports that use them.
// setup.ts already mocks prisma.user and @/lib/logger, so we rely on those.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  authRateLimiter: null,
  aiRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
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

import { POST } from '@/app/api/newsletter/subscribe/route';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Typed prisma accessor helpers
// ---------------------------------------------------------------------------
type PrismaUserMock = {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockUser = () =>
  (prisma as unknown as { user: PrismaUserMock }).user;

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const VALID_EMAIL = 'subscriber@example.com';
const VALID_NAME = 'Jane Subscriber';
const API_KEY = 'test-api-key';

const EXISTING_USER = {
  id: 'user-existing-001',
  email: VALID_EMAIL,
  name: VALID_NAME,
  password: null,
  newsletterSubscribed: false,
  newsletterSubscribedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  passwordInitialized: false,
};

const UPDATED_USER = {
  ...EXISTING_USER,
  newsletterSubscribed: true,
  newsletterSubscribedAt: new Date('2026-03-22T10:00:00Z'),
  updatedAt: new Date('2026-03-22T10:00:00Z'),
};

const NEW_USER = {
  id: 'user-new-001',
  email: VALID_EMAIL,
  name: VALID_NAME,
  password: null,
  newsletterSubscribed: true,
  newsletterSubscribedAt: new Date('2026-03-22T10:00:00Z'),
  createdAt: new Date('2026-03-22T10:00:00Z'),
  updatedAt: new Date('2026-03-22T10:00:00Z'),
  passwordInitialized: false,
};

// ---------------------------------------------------------------------------
// Request builder helper
// ---------------------------------------------------------------------------
function makeRequest(body: object, apiKey: string | null = API_KEY): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey !== null) {
    headers['x-api-key'] = apiKey;
  }
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/newsletter/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('N8N_API_KEY', API_KEY);
    // Default: authenticated session (L5 added getServerSession check to this route)
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'user-newsletter-001', email: 'subscriber@example.com', name: 'Subscriber' } } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // 1. Missing x-api-key header → 401
  // -------------------------------------------------------------------------
  it('returns 401 when x-api-key header is missing', async () => {
    const res = await POST(makeRequest({ email: VALID_EMAIL }, null));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
  });

  // -------------------------------------------------------------------------
  // 2. Wrong API key → 401
  // -------------------------------------------------------------------------
  it('returns 401 when x-api-key is incorrect', async () => {
    const res = await POST(makeRequest({ email: VALID_EMAIL }, 'wrong-key'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
  });

  // -------------------------------------------------------------------------
  // 3. Missing email → 400
  // -------------------------------------------------------------------------
  it('returns 400 when body is missing the email field', async () => {
    const res = await POST(makeRequest({ name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. Invalid email format → 400
  // -------------------------------------------------------------------------
  it('returns 400 when email is not a valid email format', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.details).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Empty string name (fails z.string().min(1)) → 400
  // -------------------------------------------------------------------------
  it('returns 400 when name is an empty string', async () => {
    const res = await POST(makeRequest({ email: VALID_EMAIL, name: '' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 6. Existing user → 200, updates newsletterSubscribed
  // -------------------------------------------------------------------------
  it('returns 200 and updates existing user when email already exists', async () => {
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_USER);
    mockUser().update.mockResolvedValueOnce(UPDATED_USER);

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.subscribed).toBe(true);
    expect(mockUser().update).toHaveBeenCalledOnce();
    expect(mockUser().create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. New user → 200, creates passwordless user
  // -------------------------------------------------------------------------
  it('returns 200 and creates a new passwordless user when email does not exist', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(NEW_USER);

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.subscribed).toBe(true);
    expect(mockUser().create).toHaveBeenCalledOnce();
    expect(mockUser().update).not.toHaveBeenCalled();

    // Verify user is created with password: null (passwordless)
    const createArg = mockUser().create.mock.calls[0][0] as {
      data: { password: null; passwordInitialized: boolean };
    };
    expect(createArg.data.password).toBeNull();
    expect(createArg.data.passwordInitialized).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. Existing user without name in body → preserves existing name
  // -------------------------------------------------------------------------
  it('preserves existing user name when name is not provided in body', async () => {
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_USER);
    mockUser().update.mockResolvedValueOnce(UPDATED_USER);

    const res = await POST(makeRequest({ email: VALID_EMAIL })); // no name
    await res.json();

    expect(res.status).toBe(200);
    const updateArg = mockUser().update.mock.calls[0][0] as {
      data: { name: string | null };
    };
    // name || existingUser.name — since name is undefined, should fall back to existingUser.name
    expect(updateArg.data.name).toBe(EXISTING_USER.name);
  });

  // -------------------------------------------------------------------------
  // 9. Correct response shape on success (new user path)
  // -------------------------------------------------------------------------
  it('returns correct response shape with user object on success', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(NEW_USER);

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      subscribed: true,
      user: {
        id: NEW_USER.id,
        email: NEW_USER.email,
        newsletterSubscribed: true,
      },
    });
    // newsletterSubscribedAt should be present
    expect(body.user.newsletterSubscribedAt).toBeDefined();
    // Password must NOT be exposed in the response
    expect(body.user).not.toHaveProperty('password');
  });

  // -------------------------------------------------------------------------
  // 10. Database error on findUnique → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.findUnique throws an unexpected error', async () => {
    mockUser().findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 11. email is lowercased before querying the database
  // -------------------------------------------------------------------------
  it('lowercases the email before querying the database', async () => {
    const mixedCaseEmail = 'Subscriber@EXAMPLE.COM';
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({ ...NEW_USER, email: mixedCaseEmail.toLowerCase() });

    const res = await POST(makeRequest({ email: mixedCaseEmail }));
    await res.json();

    expect(res.status).toBe(200);
    const findUniqueArg = mockUser().findUnique.mock.calls[0][0] as {
      where: { email: string };
    };
    expect(findUniqueArg.where.email).toBe(mixedCaseEmail.toLowerCase());
  });

  // -------------------------------------------------------------------------
  // 12. Newsletter subscribe sets newsletterSubscribed = true on create
  // -------------------------------------------------------------------------
  it('sets newsletterSubscribed to true and newsletterSubscribedAt on new user create', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(NEW_USER);

    await POST(makeRequest({ email: VALID_EMAIL }));

    const createArg = mockUser().create.mock.calls[0][0] as {
      data: { newsletterSubscribed: boolean; newsletterSubscribedAt: Date | null };
    };
    expect(createArg.data.newsletterSubscribed).toBe(true);
    expect(createArg.data.newsletterSubscribedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // 13. Rate limit exceeded → 429
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 1743033600,
    });

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
  });

  // -------------------------------------------------------------------------
  // 14. Rate limit exceeded → includes rate-limit headers in response
  // -------------------------------------------------------------------------
  it('includes rate limit headers in 429 response', async () => {
    const rateLimitResult = {
      success: false,
      limit: 100,
      remaining: 0,
      reset: 1743033600,
    };
    vi.mocked(checkRateLimit).mockResolvedValueOnce(rateLimitResult);
    vi.mocked(getRateLimitHeaders).mockReturnValueOnce({
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '1743033600',
    });

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: VALID_NAME }));

    expect(res.status).toBe(429);
    // getRateLimitHeaders must be called with the result from checkRateLimit
    expect(getRateLimitHeaders).toHaveBeenCalledWith(rateLimitResult);
  });

  // -------------------------------------------------------------------------
  // 15. Rate limit not checked when API key is invalid (401 returned first)
  // -------------------------------------------------------------------------
  it('does not call checkRateLimit when x-api-key is invalid', async () => {
    const res = await POST(makeRequest({ email: VALID_EMAIL }, 'bad-key'));

    expect(res.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 16. Prisma create throws → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.create throws an unexpected error', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockRejectedValueOnce(new Error('Unique constraint violation'));

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 17. Prisma update throws → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.update throws an unexpected error', async () => {
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_USER);
    mockUser().update.mockRejectedValueOnce(new Error('Deadlock detected'));

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });
});
