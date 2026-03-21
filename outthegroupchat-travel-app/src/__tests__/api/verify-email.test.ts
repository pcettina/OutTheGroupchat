import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module-level mocks — must be hoisted before any imports that use them.
// setup.ts does NOT include verificationToken, so we declare the full prisma
// mock here.  The vi.mock factory runs before imports are resolved.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    verificationToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      update: vi.fn(),
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
}));

import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/auth/verify-email/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(token?: string | null): NextRequest {
  const url = token === null
    ? 'http://localhost/api/auth/verify-email'
    : `http://localhost/api/auth/verify-email?token=${encodeURIComponent(token ?? '')}`;
  return new NextRequest(url);
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
const PAST   = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

const mockVerificationToken = (overrides: Partial<{ token: string; identifier: string; expires: Date }> = {}) => ({
  token:      overrides.token      ?? 'valid-token-abc',
  identifier: overrides.identifier ?? 'user@example.com',
  expires:    overrides.expires    ?? FUTURE,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/auth/verify-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Valid token → 200 + marks email verified + cleans up token
  // -------------------------------------------------------------------------
  it('returns 200 and verifies email for a valid, unexpired token', async () => {
    const tokenRecord = mockVerificationToken();

    vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    ).mockResolvedValueOnce(tokenRecord);

    vi.mocked(
      (prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }).user.update
    ).mockResolvedValueOnce({ id: 'user-1', email: tokenRecord.identifier, emailVerified: new Date() });

    vi.mocked(
      (prisma as unknown as { verificationToken: { delete: ReturnType<typeof vi.fn> } }).verificationToken.delete
    ).mockResolvedValueOnce(tokenRecord);

    const req = makeRequest('valid-token-abc');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ message: 'Email verified successfully' });

    // user.update should have been called with emailVerified
    const userUpdate = vi.mocked(
      (prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }).user.update
    );
    expect(userUpdate).toHaveBeenCalledOnce();
    expect(userUpdate.mock.calls[0][0]).toMatchObject({
      where: { email: tokenRecord.identifier },
      data: expect.objectContaining({ emailVerified: expect.any(Date) }),
    });

    // verificationToken.delete should have been called to clean up
    const tokenDelete = vi.mocked(
      (prisma as unknown as { verificationToken: { delete: ReturnType<typeof vi.fn> } }).verificationToken.delete
    );
    expect(tokenDelete).toHaveBeenCalledOnce();
    expect(tokenDelete.mock.calls[0][0]).toEqual({ where: { token: 'valid-token-abc' } });
  });

  // -------------------------------------------------------------------------
  // 2. Missing token query param → 400
  // -------------------------------------------------------------------------
  it('returns 400 when the token query param is missing', async () => {
    const req = makeRequest(null);
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: expect.stringContaining('Invalid or expired') });

    // No DB calls should occur
    const tokenLookup = vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    );
    expect(tokenLookup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Empty string token → 400 (Zod min(1) guard)
  // -------------------------------------------------------------------------
  it('returns 400 when the token query param is an empty string', async () => {
    const req = makeRequest('');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: expect.stringContaining('Invalid or expired') });
  });

  // -------------------------------------------------------------------------
  // 4. Token not found in DB → 400
  // -------------------------------------------------------------------------
  it('returns 400 when the token does not exist in the database', async () => {
    vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    ).mockResolvedValueOnce(null);

    const req = makeRequest('nonexistent-token');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: 'Invalid or expired verification token' });

    // user.update must NOT be called
    const userUpdate = vi.mocked(
      (prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }).user.update
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Expired token → 400 with "expired" message
  // -------------------------------------------------------------------------
  it('returns 400 with an expiry error for an expired token', async () => {
    const expiredRecord = mockVerificationToken({ expires: PAST });

    vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    ).mockResolvedValueOnce(expiredRecord);

    const req = makeRequest('expired-token');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ error: 'Verification token has expired' });

    // user.update must NOT be called
    const userUpdate = vi.mocked(
      (prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }).user.update
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Token expiry is exactly now — boundary: treat as expired
  // -------------------------------------------------------------------------
  it('treats a token whose expiry equals the current time as expired', async () => {
    // Use a date guaranteed to be in the past by test execution time
    const justExpired = new Date(Date.now() - 1);
    const record = mockVerificationToken({ expires: justExpired });

    vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    ).mockResolvedValueOnce(record);

    const req = makeRequest('just-expired-token');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Verification token has expired' });
  });

  // -------------------------------------------------------------------------
  // 7. Already-verified: user.update throws (P2025 record not found)
  //    The route wraps the whole handler in try/catch → 500
  // -------------------------------------------------------------------------
  it('returns 500 when user.update throws a Prisma error', async () => {
    const tokenRecord = mockVerificationToken();

    vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    ).mockResolvedValueOnce(tokenRecord);

    vi.mocked(
      (prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }).user.update
    ).mockRejectedValueOnce(new Error('Record not found'));

    const req = makeRequest('valid-token-abc');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ error: 'Internal server error' });
  });

  // -------------------------------------------------------------------------
  // 8. verificationToken.findUnique throws → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.verificationToken.findUnique throws', async () => {
    vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    ).mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('any-token');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ error: 'Internal server error' });
  });

  // -------------------------------------------------------------------------
  // 9. verificationToken.delete throws → 500
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.verificationToken.delete throws', async () => {
    const tokenRecord = mockVerificationToken();

    vi.mocked(
      (prisma as unknown as { verificationToken: { findUnique: ReturnType<typeof vi.fn> } }).verificationToken.findUnique
    ).mockResolvedValueOnce(tokenRecord);

    vi.mocked(
      (prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }).user.update
    ).mockResolvedValueOnce({ id: 'user-1', email: tokenRecord.identifier, emailVerified: new Date() });

    vi.mocked(
      (prisma as unknown as { verificationToken: { delete: ReturnType<typeof vi.fn> } }).verificationToken.delete
    ).mockRejectedValueOnce(new Error('Delete failed'));

    const req = makeRequest('valid-token-abc');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ error: 'Internal server error' });
  });
});
