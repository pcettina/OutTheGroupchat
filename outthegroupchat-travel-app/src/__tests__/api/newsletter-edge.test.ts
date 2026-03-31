import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before any imports that use them.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
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
const API_KEY = 'test-api-key';

const MOCK_SESSION = {
  user: { id: 'clh7nz5vr0000mg0hb9gkfxe0', name: 'Auth User', email: 'auth@example.com' },
  expires: '2099-01-01',
};

const EXISTING_USER = {
  id: 'clh7nz5vr0000mg0hb9gkfxe0',
  email: VALID_EMAIL,
  name: 'Existing User',
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
  newsletterSubscribedAt: new Date('2026-03-30T10:00:00Z'),
  updatedAt: new Date('2026-03-30T10:00:00Z'),
};

const NEW_USER = {
  id: 'clh7nz5vr0001mg0hb9gkfxe1',
  email: VALID_EMAIL,
  name: null,
  password: null,
  newsletterSubscribed: true,
  newsletterSubscribedAt: new Date('2026-03-30T10:00:00Z'),
  createdAt: new Date('2026-03-30T10:00:00Z'),
  updatedAt: new Date('2026-03-30T10:00:00Z'),
  passwordInitialized: false,
};

// ---------------------------------------------------------------------------
// Request builder helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, apiKey: string | null = API_KEY): Request {
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

function makeRawRequest(rawBody: string, apiKey: string | null = API_KEY): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey !== null) {
    headers['x-api-key'] = apiKey;
  }
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/newsletter/subscribe — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('N8N_API_KEY', API_KEY);
    // Default: authenticated session + rate limit success
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    mockCheckRateLimit.mockResolvedValue({ success: true } as Awaited<ReturnType<typeof checkRateLimit>>);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // 1. Rate limit exceeded → 429
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
    } as Awaited<ReturnType<typeof checkRateLimit>>);

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
  });

  // -------------------------------------------------------------------------
  // 2. Rate limit check called with correct key prefix
  // -------------------------------------------------------------------------
  it('calls checkRateLimit with a key prefixed with "newsletter:"', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    await POST(makeRequest({ email: VALID_EMAIL }));

    expect(mockCheckRateLimit).toHaveBeenCalledOnce();
    const [, key] = mockCheckRateLimit.mock.calls[0] as [unknown, string];
    expect(key).toMatch(/^newsletter:/);
  });

  // -------------------------------------------------------------------------
  // 3. Empty string email → 400 validation error
  // -------------------------------------------------------------------------
  it('returns 400 when email is an empty string', async () => {
    const res = await POST(makeRequest({ email: '' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.details).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 4. Email with no TLD → 400 (Zod rejects "user@localhost" style addresses)
  // -------------------------------------------------------------------------
  it('returns 400 when email has no TLD (e.g. user@localhost)', async () => {
    const res = await POST(makeRequest({ email: 'user@localhost' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.details).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Tagged email (plus addressing) is valid and accepted → 200
  // -------------------------------------------------------------------------
  it('accepts a valid tagged email like joe+tag@example.com', async () => {
    const taggedEmail = 'joe+tag@example.com';
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({
      ...NEW_USER,
      email: taggedEmail,
    });

    const res = await POST(makeRequest({ email: taggedEmail }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Numeric email field → 400
  // -------------------------------------------------------------------------
  it('returns 400 when email field is a number instead of a string', async () => {
    const res = await POST(makeRequest({ email: 12345 }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.details).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. Boolean email field → 400
  // -------------------------------------------------------------------------
  it('returns 400 when email field is a boolean', async () => {
    const res = await POST(makeRequest({ email: true }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.details).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 8. Array email field → 400
  // -------------------------------------------------------------------------
  it('returns 400 when email field is an array', async () => {
    const res = await POST(makeRequest({ email: ['a@b.com', 'c@d.com'] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 9. Invalid JSON body → 500 (global catch handles JSON.parse failure)
  // -------------------------------------------------------------------------
  it('returns 500 when body is malformed JSON', async () => {
    const res = await POST(makeRawRequest('{ not valid json '));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 10. HTML injection in email field → 400 (Zod email validation rejects it)
  // -------------------------------------------------------------------------
  it('returns 400 when email contains HTML injection attempt', async () => {
    const res = await POST(makeRequest({ email: '<script>alert(1)</script>@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 11. DB error on update (existing user path) → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.update throws on existing user path', async () => {
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_USER);
    mockUser().update.mockRejectedValueOnce(new Error('DB update failed'));

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 12. DB error on create (new user path) → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.create throws on new user path', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockRejectedValueOnce(new Error('DB create failed'));

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 13. Already-subscribed user is re-subscribed → 200 (idempotent)
  // -------------------------------------------------------------------------
  it('returns 200 and re-subscribes an already-subscribed user', async () => {
    const alreadySubscribed = { ...EXISTING_USER, newsletterSubscribed: true };
    mockUser().findUnique.mockResolvedValueOnce(alreadySubscribed);
    mockUser().update.mockResolvedValueOnce(UPDATED_USER);

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.subscribed).toBe(true);
    // update should still be called to refresh newsletterSubscribedAt
    expect(mockUser().update).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 14. Null email field → 400
  // -------------------------------------------------------------------------
  it('returns 400 when email field is null', async () => {
    const res = await POST(makeRequest({ email: null }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 15. Name with whitespace-only string (passes min(1)) → 200
  // -------------------------------------------------------------------------
  it('accepts a name that is only whitespace (min(1) passes for non-empty string)', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({ ...NEW_USER, name: '   ' });

    const res = await POST(makeRequest({ email: VALID_EMAIL, name: '   ' }));
    const body = await res.json();

    // Zod min(1) passes for " " (whitespace counts as chars), so this should succeed
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 16. Email with uppercase domain is normalized to lowercase
  // -------------------------------------------------------------------------
  it('lowercases email with uppercase domain before storing', async () => {
    const mixedDomainEmail = 'user@EXAMPLE.COM';
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({
      ...NEW_USER,
      email: mixedDomainEmail.toLowerCase(),
    });

    const res = await POST(makeRequest({ email: mixedDomainEmail }));
    await res.json();

    expect(res.status).toBe(200);
    const createArg = mockUser().create.mock.calls[0][0] as {
      data: { email: string };
    };
    expect(createArg.data.email).toBe('user@example.com');
  });

  // -------------------------------------------------------------------------
  // 17. Response does NOT expose password field on existing user path
  // -------------------------------------------------------------------------
  it('does not expose password in response for existing user update path', async () => {
    mockUser().findUnique.mockResolvedValueOnce(EXISTING_USER);
    mockUser().update.mockResolvedValueOnce(UPDATED_USER);

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user).toBeDefined();
    expect(body.user).not.toHaveProperty('password');
  });

  // -------------------------------------------------------------------------
  // 18. Subdomain email is accepted as valid
  // -------------------------------------------------------------------------
  it('accepts a valid subdomain email like user@mail.example.co.uk', async () => {
    const subdomainEmail = 'user@mail.example.co.uk';
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({
      ...NEW_USER,
      email: subdomainEmail,
    });

    const res = await POST(makeRequest({ email: subdomainEmail }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 19. Name field is optional — request succeeds without it
  // -------------------------------------------------------------------------
  it('returns 200 when no name is provided (name is optional)', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce({ ...NEW_USER, name: null });

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const createArg = mockUser().create.mock.calls[0][0] as {
      data: { name: null };
    };
    expect(createArg.data.name).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 20. Object body with extra unknown fields is accepted (Zod strips extras)
  // -------------------------------------------------------------------------
  it('ignores extra unknown fields in the request body (Zod strips them)', async () => {
    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(NEW_USER);

    const res = await POST(makeRequest({
      email: VALID_EMAIL,
      name: 'Valid Name',
      unknownField: 'should be stripped',
      anotherExtra: 42,
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
