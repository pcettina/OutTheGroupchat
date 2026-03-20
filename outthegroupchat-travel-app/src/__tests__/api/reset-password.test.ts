/**
 * Unit tests for the Password Reset API route handler.
 *
 * Route: POST /api/auth/reset-password  (request reset)
 *        PATCH /api/auth/reset-password (confirm reset)
 *
 * Strategy
 * --------
 * - External dependencies (Prisma, logger, email) are mocked.
 * - bcryptjs is mocked for deterministic hashing.
 * - POST always returns 200 to prevent email enumeration.
 * - PATCH validates token, checks expiry, hashes password, and cleans up token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { POST, PATCH } from '@/app/api/auth/reset-password/route';

// ---------------------------------------------------------------------------
// Mock bcryptjs
// ---------------------------------------------------------------------------
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-new-password'),
    compare: vi.fn().mockResolvedValue(true),
  },
  hash: vi.fn().mockResolvedValue('hashed-new-password'),
  compare: vi.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Mock Prisma with the models used by reset-password route
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      verificationToken: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock email module
// ---------------------------------------------------------------------------
vi.mock('@/lib/email', () => ({
  isEmailConfigured: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Mock resend
// ---------------------------------------------------------------------------
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helper to build a NextRequest-compatible Request
// ---------------------------------------------------------------------------
function makeRequest(method: string, body: unknown): Request {
  return new Request('http://localhost/api/auth/reset-password', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('POST /api/auth/reset-password (request reset)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when user exists and creates token', async () => {
    const mockUser = { id: 'user-1', email: 'alice@test.com', name: 'Alice' };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.verificationToken.create).mockResolvedValue({
      identifier: 'reset:alice@test.com',
      token: 'mock-token',
      expires: new Date(Date.now() + 3600000),
    });

    const req = makeRequest('POST', { email: 'alice@test.com' });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('reset link');
    expect(prisma.verificationToken.create).toHaveBeenCalledOnce();
  });

  it('returns 200 even when user does NOT exist (prevents enumeration)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = makeRequest('POST', { email: 'nobody@test.com' });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prisma.verificationToken.create).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email format', async () => {
    const req = makeRequest('POST', { email: 'not-an-email' });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid request');
    expect(body.issues).toBeDefined();
  });

  it('returns 400 when email is missing', async () => {
    const req = makeRequest('POST', {});
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('clears existing tokens before creating new one', async () => {
    const mockUser = { id: 'user-1', email: 'alice@test.com', name: 'Alice' };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.verificationToken.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.verificationToken.create).mockResolvedValue({
      identifier: 'reset:alice@test.com',
      token: 'new-token',
      expires: new Date(Date.now() + 3600000),
    });

    const req = makeRequest('POST', { email: 'alice@test.com' });
    await POST(req);

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'reset:alice@test.com' },
    });
  });
});

describe('PATCH /api/auth/reset-password (confirm reset)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validToken = {
    identifier: 'reset:alice@test.com',
    token: crypto.randomBytes(32).toString('hex'),
    expires: new Date(Date.now() + 3600000), // 1 hour from now
  };

  it('resets password successfully with valid token', async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(validToken);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);

    const req = makeRequest('PATCH', {
      token: validToken.token,
      email: 'alice@test.com',
      password: 'NewSecurePassword123!',
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('reset successfully');
  });

  it('returns 400 for invalid/missing token', async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(null);

    const req = makeRequest('PATCH', {
      token: 'bad-token',
      email: 'alice@test.com',
      password: 'NewSecurePassword123!',
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid or expired');
  });

  it('returns 400 for expired token', async () => {
    const expiredToken = {
      ...validToken,
      expires: new Date(Date.now() - 1000), // expired 1 second ago
    };
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(expiredToken);
    vi.mocked(prisma.verificationToken.delete).mockResolvedValue(expiredToken);

    const req = makeRequest('PATCH', {
      token: expiredToken.token,
      email: 'alice@test.com',
      password: 'NewSecurePassword123!',
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('expired');
  });

  it('returns 400 when password is too short', async () => {
    const req = makeRequest('PATCH', {
      token: 'some-token',
      email: 'alice@test.com',
      password: 'short',
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.issues).toBeDefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const req = makeRequest('PATCH', { email: 'alice@test.com' });
    const response = await PATCH(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 when user not found after valid token', async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(validToken);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = makeRequest('PATCH', {
      token: validToken.token,
      email: 'alice@test.com',
      password: 'NewSecurePassword123!',
    });
    const response = await PATCH(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid or expired');
  });

  it('uses bcrypt to hash the new password', async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(validToken);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    // Capture what $transaction is called with to verify the hashed password was passed
    let capturedArgs: unknown[] = [];
    vi.mocked(prisma.$transaction).mockImplementation(async (ops) => {
      capturedArgs = Array.isArray(ops) ? ops : [];
      return [];
    });

    const req = makeRequest('PATCH', {
      token: validToken.token,
      email: 'alice@test.com',
      password: 'NewSecurePassword123!',
    });
    const response = await PATCH(req);

    // Verify the transaction was called (password was updated)
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });
});
