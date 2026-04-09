import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before any imports that use them.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
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
}));

import { POST } from '@/app/api/newsletter/subscribe/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { checkRateLimit } from '@/lib/rate-limit';

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

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const VALID_EMAIL = 'subscriber@example.com';
const VALID_NAME = 'Edge Case Tester';
const API_KEY = 'test-api-key';

const MOCK_SESSION = {
  user: { id: 'user-edge-001', name: 'Edge User', email: 'edge@example.com' },
  expires: '2099-01-01',
};

const EXISTING_SUBSCRIBED_USER = {
  id: 'user-existing-sub-001',
  email: VALID_EMAIL,
  name: VALID_NAME,
  password: null,
  newsletterSubscribed: true,
  newsletterSubscribedAt: new Date('2025-06-01'),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
  passwordInitialized: false,
};

const EXISTING_UNSUBSCRIBED_USER = {
  id: 'user-existing-unsub-001',
  email: VALID_EMAIL,
  name: VALID_NAME,
  password: null,
  newsletterSubscribed: false,
  newsletterSubscribedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  passwordInitialized: false,
};

// ---------------------------------------------------------------------------
// Request builder helper — uses NextRequest-compatible plain Request
// ---------------------------------------------------------------------------
function makeRequest(
  body: unknown,
  apiKey: string | null = API_KEY,
  rawBody?: string
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey !== null) {
    headers['x-api-key'] = apiKey;
  }
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers,
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/newsletter/subscribe — email edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('N8N_API_KEY', API_KEY);
    // Default: authenticated session for all tests (overridden per-test where needed)
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    // Default: rate limit passes
    mockCheckRateLimit.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: Date.now() + 60000 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // 1. Rate limiting — 429 when checkRateLimit returns { success: false }
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
  });

  // -------------------------------------------------------------------------
  // 2. Very long email (>255 chars) — Zod .email() has no max length guard,
  //    so a syntactically-valid long email passes validation and reaches the
  //    DB layer. Without a mock the route's catch block returns 500.
  // -------------------------------------------------------------------------
  it('returns 500 when a syntactically valid but very long email (>255 chars) reaches the DB layer', async () => {
    const longLocalPart = 'a'.repeat(250);
    const longEmail = `${longLocalPart}@example.com`; // 263 chars total

    // findUnique is not mocked — prisma throws internally, caught as 500
    const res = await POST(makeRequest({ email: longEmail }));
    const body = await res.json();

    // Zod accepts long valid emails; the DB layer rejects → 500
    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 3. Email with valid special chars (+ addressing, dots) — should pass Zod
  // -------------------------------------------------------------------------
  it('accepts email with plus-addressing and dots as valid', async () => {
    const specialEmail = 'user.name+tag@sub.example.com';
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({
      id: 'user-special-001',
      email: specialEmail.toLowerCase(),
      name: null,
      password: null,
      newsletterSubscribed: true,
      newsletterSubscribedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordInitialized: false,
    });

    const res = await POST(makeRequest({ email: specialEmail }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Already-subscribed user re-subscribes — idempotent 200 update
  // -------------------------------------------------------------------------
  it('returns 200 idempotently when already-subscribed user re-subscribes', async () => {
    const updatedUser = {
      ...EXISTING_SUBSCRIBED_USER,
      newsletterSubscribedAt: new Date(),
      updatedAt: new Date(),
    };
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_SUBSCRIBED_USER);
    mockUser().update.mockResolvedValueOnce(updatedUser);

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.subscribed).toBe(true);
    // update is called again even when already subscribed
    expect(mockUser().update).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 5. DB error on user.update (existing user path) → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.update throws during existing user update', async () => {
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_UNSUBSCRIBED_USER);
    mockUser().update.mockRejectedValueOnce(new Error('Deadlock detected'));

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 6. DB error on user.create (new user path) → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.create throws during new subscriber creation', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockRejectedValueOnce(new Error('Unique constraint violation'));

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. Null email field — should fail Zod validation
  // -------------------------------------------------------------------------
  it('returns 400 when email field is null', async () => {
    const res = await POST(makeRequest({ email: null }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 8. Numeric email field — should fail Zod .string() validation
  // -------------------------------------------------------------------------
  it('returns 400 when email field is a number', async () => {
    const res = await POST(makeRequest({ email: 12345 }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 9. Malformed JSON body → 500 (JSON.parse error caught by catch block)
  // -------------------------------------------------------------------------
  it('returns 500 when request body is not valid JSON', async () => {
    const res = await POST(makeRequest(null, API_KEY, 'not-valid-json{'));
    const body = await res.json();

    // The route calls req.json() which throws a SyntaxError caught by catch → 500
    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 10. Name provided on update is used (not fallback to existing name)
  // -------------------------------------------------------------------------
  it('uses the provided name when updating existing user', async () => {
    const newName = 'Updated Subscriber Name';
    const updatedUser = {
      ...EXISTING_UNSUBSCRIBED_USER,
      name: newName,
      newsletterSubscribed: true,
      newsletterSubscribedAt: new Date(),
    };
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_UNSUBSCRIBED_USER);
    mockUser().update.mockResolvedValueOnce(updatedUser);

    await POST(makeRequest({ email: VALID_EMAIL, name: newName }));

    const updateArg = mockUser().update.mock.calls[0][0] as {
      data: { name: string };
    };
    expect(updateArg.data.name).toBe(newName);
  });

  // -------------------------------------------------------------------------
  // 11. Response never exposes password field (security check)
  // -------------------------------------------------------------------------
  it('does not expose the password field in the response user object', async () => {
    const newUser = {
      id: 'user-new-edge-001',
      email: VALID_EMAIL,
      name: null,
      password: 'hashed-password-should-not-appear',
      newsletterSubscribed: true,
      newsletterSubscribedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      passwordInitialized: false,
    };
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(newUser);

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user).not.toHaveProperty('password');
  });

  // -------------------------------------------------------------------------
  // 12. N8N_API_KEY env var not set — any key should fail
  // -------------------------------------------------------------------------
  it('returns 401 when N8N_API_KEY env var is not set', async () => {
    vi.unstubAllEnvs();
    // N8N_API_KEY is now undefined — no key matches
    const res = await POST(makeRequest({ email: VALID_EMAIL }, 'some-key'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
  });

  // -------------------------------------------------------------------------
  // 13. Email with leading/trailing whitespace — Zod .email() rejects
  // -------------------------------------------------------------------------
  it('returns 400 when email has leading whitespace', async () => {
    const res = await POST(makeRequest({ email: '  subscriber@example.com' }));
    const body = await res.json();

    // Zod .email() does not trim; whitespace causes format rejection
    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 14. Empty object body — no email field → 400
  // -------------------------------------------------------------------------
  it('returns 400 when body is an empty object', async () => {
    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.details).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 15. Validation error response shape includes details array
  // -------------------------------------------------------------------------
  it('includes a details array in validation error response', async () => {
    const res = await POST(makeRequest({ email: 'bad-format' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 16. Rate limit checked before session auth (API key checked first)
  // -------------------------------------------------------------------------
  it('checks rate limit before session validation (rate limit runs after API key check)', async () => {
    // Rate limit returns failure after API key passes
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    // Session mock should NOT matter since rate limit fires before it
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: VALID_EMAIL }));

    // 429 from rate limit, not 401 from missing session
    expect(res.status).toBe(429);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });
});
