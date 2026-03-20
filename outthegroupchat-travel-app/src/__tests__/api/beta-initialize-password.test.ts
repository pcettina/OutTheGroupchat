/**
 * Unit tests for POST /api/beta/initialize-password
 * and GET  /api/beta/initialize-password (token issuance).
 *
 * Security invariants verified:
 *  - POST without a token → 400
 *  - POST with an unknown token → 400
 *  - POST with an expired token → 400
 *  - POST with a valid token → 200, token consumed
 *  - POST for already-initialised user → 400
 *  - GET without API key → 401
 *  - GET with API key issues a token and rotates any existing one
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
  hash: vi.fn().mockResolvedValue('hashed-password'),
}));

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
      pendingInvitation: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      tripInvitation: { create: vi.fn() },
      notification: { create: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_API_KEY = 'test-n8n-key';
const VALID_TOKEN   = 'a'.repeat(64); // 32-byte hex string (64 chars)
const TEST_EMAIL    = 'beta@example.com';

function makePostRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/beta/initialize-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': VALID_API_KEY, ...headers },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(email: string, apiKey?: string): Request {
  const url = `http://localhost/api/beta/initialize-password?email=${encodeURIComponent(email)}`;
  return new Request(url, {
    method: 'GET',
    headers: apiKey ? { 'x-api-key': apiKey } : {},
  });
}

const mockUser = {
  id: 'user-1',
  email: TEST_EMAIL,
  name: 'Beta User',
  password: null,
  passwordInitialized: false,
};

const mockToken = {
  identifier: `beta-init:${TEST_EMAIL}`,
  token: VALID_TOKEN,
  expires: new Date(Date.now() + 72 * 60 * 60 * 1000),
};

// ── Import route under test ──────────────────────────────────────────────────

// Must happen after mocks are registered.
process.env.N8N_API_KEY = VALID_API_KEY;
const { POST, GET } = await import('@/app/api/beta/initialize-password/route');

// ── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/beta/initialize-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.pendingInvitation.findMany).mockResolvedValue([]);
  });

  it('returns 400 when token field is missing', async () => {
    const req = makePostRequest({ email: TEST_EMAIL, password: 'SecurePass123' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when token is an empty string', async () => {
    const req = makePostRequest({ email: TEST_EMAIL, password: 'SecurePass123', token: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short (< 8 chars)', async () => {
    const req = makePostRequest({ email: TEST_EMAIL, password: 'short', token: VALID_TOKEN });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 (not 404) when user does not exist — prevents enumeration', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const req = makePostRequest({ email: 'nobody@example.com', password: 'SecurePass123', token: VALID_TOKEN });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid or expired');
  });

  it('returns 400 when user already has password initialized', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      password: 'already-hashed',
      passwordInitialized: true,
    } as never);
    const req = makePostRequest({ email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Password already initialized');
  });

  it('returns 400 when token is not found in the database', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(null);
    const req = makePostRequest({ email: TEST_EMAIL, password: 'SecurePass123', token: 'bad-token' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid or expired');
  });

  it('returns 400 when token is expired', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue({
      ...mockToken,
      expires: new Date(Date.now() - 1000), // 1 second ago
    });
    vi.mocked(prisma.verificationToken.delete).mockResolvedValue(mockToken);

    const req = makePostRequest({ email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('expired');
  });

  it('returns 200 and initializes password when token is valid', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(mockToken);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn({
        user: { update: vi.fn().mockResolvedValue({ ...mockUser, password: 'hashed', passwordInitialized: true }) },
        verificationToken: { delete: vi.fn() },
      } as never)
    );

    const req = makePostRequest({ email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('initialized successfully');
  });

  it('consumes the token inside a transaction on success', async () => {
    const txDelete = vi.fn().mockResolvedValue(mockToken);
    const txUserUpdate = vi.fn().mockResolvedValue({ ...mockUser, passwordInitialized: true });

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(mockToken);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn({
        user: { update: txUserUpdate },
        verificationToken: { delete: txDelete },
      } as never)
    );

    const req = makePostRequest({ email: TEST_EMAIL, password: 'SecurePass123', token: VALID_TOKEN });
    await POST(req);

    expect(txDelete).toHaveBeenCalledWith({
      where: {
        identifier_token: {
          identifier: `beta-init:${TEST_EMAIL}`,
          token: VALID_TOKEN,
        },
      },
    });
  });
});

// ── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/beta/initialize-password (token issuance)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when API key is missing', async () => {
    const req = makeGetRequest(TEST_EMAIL);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when API key is wrong', async () => {
    const req = makeGetRequest(TEST_EMAIL, 'wrong-key');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid email format', async () => {
    const req = makeGetRequest('not-an-email', VALID_API_KEY);
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const req = makeGetRequest(TEST_EMAIL, VALID_API_KEY);
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when user already has password initialized', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      passwordInitialized: true,
    } as never);
    const req = makeGetRequest(TEST_EMAIL, VALID_API_KEY);
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('issues a token, rotates existing, and returns plaintext token + expiry', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.verificationToken.create).mockResolvedValue(mockToken);

    const req = makeGetRequest(TEST_EMAIL, VALID_API_KEY);
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token).toHaveLength(64); // 32 random bytes → 64 hex chars
    expect(body.expires).toBeDefined();

    // Verify old tokens were rotated first.
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: `beta-init:${TEST_EMAIL}` },
    });
    expect(prisma.verificationToken.create).toHaveBeenCalledOnce();
  });
});
