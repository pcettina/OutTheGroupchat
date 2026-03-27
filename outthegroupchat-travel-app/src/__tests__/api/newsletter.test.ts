import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before any imports that use them.
// setup.ts already mocks prisma.user and @/lib/logger, so we rely on those.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const VALID_EMAIL = 'subscriber@example.com';
const VALID_NAME = 'Jane Subscriber';
const API_KEY = 'test-api-key';

const MOCK_SESSION = {
  user: { id: 'user-session-001', name: 'Auth User', email: 'auth@example.com' },
  expires: '2099-01-01',
};

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
    // Default: authenticated session for all tests (overridden per-test where needed)
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
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
  // 3. No session (valid API key) → 401 Authentication required
  // -------------------------------------------------------------------------
  it('returns 401 when no session exists (unauthenticated user)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });

  // -------------------------------------------------------------------------
  // 4. Missing email → 400
  // -------------------------------------------------------------------------
  it('returns 400 when body is missing the email field', async () => {
    const res = await POST(makeRequest({ name: VALID_NAME }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Invalid email format → 400
  // -------------------------------------------------------------------------
  it('returns 400 when email is not a valid email format', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.details).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 6. Empty string name (fails z.string().min(1)) → 400
  // -------------------------------------------------------------------------
  it('returns 400 when name is an empty string', async () => {
    const res = await POST(makeRequest({ email: VALID_EMAIL, name: '' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. Existing user → 200, updates newsletterSubscribed
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
  // 8. New user → 200, creates passwordless user
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
  // 9. Existing user without name in body → preserves existing name
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
  // 10. Correct response shape on success (new user path)
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
  // 11. Database error on findUnique → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.findUnique throws an unexpected error', async () => {
    mockUser().findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await POST(makeRequest({ email: VALID_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 12. email is lowercased before querying the database
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
  // 13. Newsletter subscribe sets newsletterSubscribed = true on create
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
});
