import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const makeReq = () => new NextRequest('http://localhost/api/auth/demo', { method: 'POST' });

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before imports.
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
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock bcryptjs so hashing is instant and deterministic in tests.
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-demo-password'),
    compare: vi.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import { POST, GET } from '@/app/api/auth/demo/route';

// ---------------------------------------------------------------------------
// Typed accessor helpers
// ---------------------------------------------------------------------------
type PrismaUserMock = {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockUser = () =>
  (prisma as unknown as { user: PrismaUserMock }).user;

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------
const DEMO_USER = {
  id: 'demo-user-id-123',
  email: 'alex@demo.com',
  name: 'Alex Johnson',
  password: 'hashed-demo-password',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// POST /api/auth/demo
// ---------------------------------------------------------------------------
describe('POST /api/auth/demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore env defaults so each test starts clean
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // 1. DEMO_MODE not set → 403
  // -------------------------------------------------------------------------
  it('returns 403 when DEMO_MODE env var is not set', async () => {
    // DEMO_MODE is not set (undefined)
    delete process.env.DEMO_MODE;

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not enabled/i);
  });

  // -------------------------------------------------------------------------
  // 2. DEMO_MODE='false' → 403
  // -------------------------------------------------------------------------
  it('returns 403 when DEMO_MODE is set to "false"', async () => {
    vi.stubEnv('DEMO_MODE', 'false');

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. DEMO_MODE='true' but DEMO_USER_PASSWORD not set → 500
  // -------------------------------------------------------------------------
  it('returns 500 when DEMO_MODE is true but DEMO_USER_PASSWORD is not configured', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    delete process.env.DEMO_USER_PASSWORD;

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/incomplete/i);
  });

  // -------------------------------------------------------------------------
  // 4. DEMO_MODE='true', password set, user does NOT exist → creates user, returns 200
  // -------------------------------------------------------------------------
  it('creates demo user and returns 200 with credentials when user does not exist', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_USER_PASSWORD', 'demo-pass-secret');

    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(DEMO_USER);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.credentials).toMatchObject({
      email: expect.any(String),
      password: 'demo-pass-secret',
    });
    expect(body.message).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. DEMO_MODE='true', user exists → updates password, returns 200
  // -------------------------------------------------------------------------
  it('updates demo user password and returns 200 with credentials when user exists', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_USER_PASSWORD', 'updated-demo-pass');

    mockUser().findUnique.mockResolvedValueOnce(DEMO_USER);
    mockUser().update.mockResolvedValueOnce({ ...DEMO_USER, password: 'hashed-demo-password' });

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.credentials.password).toBe('updated-demo-pass');
    expect(mockUser().update).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 6. Response contains expected credentials shape
  // -------------------------------------------------------------------------
  it('response credentials object contains email and password fields', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_USER_PASSWORD', 'my-demo-pass');

    mockUser().findUnique.mockResolvedValueOnce(DEMO_USER);
    mockUser().update.mockResolvedValueOnce(DEMO_USER);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.credentials).toHaveProperty('email');
    expect(body.credentials).toHaveProperty('password');
    expect(body.credentials.email).toBe('alex@demo.com');
    expect(body.credentials.password).toBe('my-demo-pass');
  });

  // -------------------------------------------------------------------------
  // 7. Prisma throws → returns 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.user.findUnique throws an unexpected error', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_USER_PASSWORD', 'some-pass');

    mockUser().findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/failed/i);
  });

  // -------------------------------------------------------------------------
  // 8. User creation: prisma.user.create called with hashed password (not plain)
  // -------------------------------------------------------------------------
  it('calls prisma.user.create with a hashed password (not plain text)', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_USER_PASSWORD', 'plain-demo-pass');

    mockUser().findUnique.mockResolvedValueOnce(null);
    mockUser().create.mockResolvedValueOnce(DEMO_USER);

    await POST(makeReq());

    const createArg = mockUser().create.mock.calls[0][0] as {
      data: { password: string; email: string };
    };
    expect(createArg.data.password).not.toBe('plain-demo-pass');
    expect(createArg.data.password).toBe('hashed-demo-password');
  });

  // -------------------------------------------------------------------------
  // 9. DEMO_MODE='1' (not exactly 'true') → 403
  // -------------------------------------------------------------------------
  it('returns 403 when DEMO_MODE is "1" (not exactly "true")', async () => {
    vi.stubEnv('DEMO_MODE', '1');

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 10. Success response includes a human-readable message
  // -------------------------------------------------------------------------
  it('success response includes a message field', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('DEMO_USER_PASSWORD', 'pass-123');

    mockUser().findUnique.mockResolvedValueOnce(DEMO_USER);
    mockUser().update.mockResolvedValueOnce(DEMO_USER);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.message).toMatch(/demo account/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/demo
// ---------------------------------------------------------------------------
describe('GET /api/auth/demo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // 11. DEMO_MODE not enabled → 403
  // -------------------------------------------------------------------------
  it('returns 403 when DEMO_MODE is not set', async () => {
    delete process.env.DEMO_MODE;

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 12. DEMO_MODE='true' → 200 with demo account info
  // -------------------------------------------------------------------------
  it('returns 200 with demo account info when DEMO_MODE is "true"', async () => {
    vi.stubEnv('DEMO_MODE', 'true');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      email: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
    });
  });

  // -------------------------------------------------------------------------
  // 13. GET success: email matches expected demo email
  // -------------------------------------------------------------------------
  it('returns the default demo email address in the data payload', async () => {
    vi.stubEnv('DEMO_MODE', 'true');

    const res = await GET();
    const body = await res.json();

    expect(body.data.email).toBe('alex@demo.com');
    expect(body.data.name).toBe('Alex Johnson');
  });
});
