/**
 * Tests for GET /api/beta/status with Redis checkRateLimit integration.
 *
 * This file covers the full beta/status route using the shared Redis
 * checkRateLimit from @/lib/rate-limit (not the legacy in-memory store).
 *
 * Coverage:
 *   - Rate limiting: 429 when checkRateLimit returns success: false
 *   - Happy path: user found, user not found
 *   - Validation: missing email, invalid email format, empty string, whitespace
 *   - Email normalization (lowercase)
 *   - Database error → 500
 *   - passwordInitialized field values
 *   - checkRateLimit called with correct identifier
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — allow by default; override per-test for 429 paths
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  apiRateLimiter: null,
}));

import { checkRateLimit } from '@/lib/rate-limit';
import { GET as betaStatusGET } from '@/app/api/beta/status/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockPrismaUser = vi.mocked(prisma.user);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatusRequest(emailParam?: string, ip?: string): NextRequest {
  const url =
    emailParam !== undefined
      ? `http://localhost:3000/api/beta/status?email=${encodeURIComponent(emailParam)}`
      : 'http://localhost:3000/api/beta/status';
  const headers: Record<string, string> = {};
  if (ip) {
    headers['x-forwarded-for'] = ip;
  }
  return new NextRequest(url, { method: 'GET', headers });
}

const TEST_EMAIL = 'beta@example.com';
const TEST_IP = '10.0.0.42';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/beta/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Preserve factory default after clearAllMocks
    mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  });

  // ---- Rate limiting -------------------------------------------------------

  it('returns 429 when checkRateLimit returns success: false', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const req = makeStatusRequest(TEST_EMAIL, TEST_IP);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/rate limit exceeded/i);
  });

  it('does not call prisma when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const req = makeStatusRequest(TEST_EMAIL, TEST_IP);
    await betaStatusGET(req);
    expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
  });

  it('calls checkRateLimit with the x-forwarded-for IP as identifier', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeStatusRequest(TEST_EMAIL, TEST_IP);
    await betaStatusGET(req);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      null, // apiRateLimiter is null in test env
      `beta-status:${TEST_IP}`
    );
  });

  it('calls checkRateLimit with "anonymous" when no IP header is present', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeStatusRequest(TEST_EMAIL);
    await betaStatusGET(req);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(null, 'beta-status:anonymous');
  });

  it('calls checkRateLimit with x-real-ip when x-forwarded-for is absent', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const url = `http://localhost:3000/api/beta/status?email=${encodeURIComponent(TEST_EMAIL)}`;
    const req = new NextRequest(url, {
      method: 'GET',
      headers: { 'x-real-ip': '172.16.0.5' },
    });
    await betaStatusGET(req);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(null, 'beta-status:172.16.0.5');
  });

  // ---- Validation ----------------------------------------------------------

  it('returns 400 when email query param is missing', async () => {
    const req = makeStatusRequest(undefined);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 when email param is an empty string', async () => {
    const req = makeStatusRequest('');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for invalid email format', async () => {
    const req = makeStatusRequest('not-an-email');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when email param is whitespace only', async () => {
    const req = makeStatusRequest('   ');
    const res = await betaStatusGET(req);
    expect(res.status).toBe(400);
  });

  // ---- Happy path: user not found ------------------------------------------

  it('returns 200 with exists: false for an unknown email', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeStatusRequest(TEST_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
    expect(body.passwordInitialized).toBe(false);
  });

  // ---- Happy path: user found ----------------------------------------------

  it('returns 200 with exists: true and passwordInitialized: true when user has set a password', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      passwordInitialized: true,
    } as never);
    const req = makeStatusRequest(TEST_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.passwordInitialized).toBe(true);
  });

  it('returns 200 with passwordInitialized: false when user exists but has not set a password', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      passwordInitialized: false,
    } as never);
    const req = makeStatusRequest(TEST_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.passwordInitialized).toBe(false);
  });

  // ---- Email normalization -------------------------------------------------

  it('normalizes email to lowercase before querying the database', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeStatusRequest('UPPER@EXAMPLE.COM');
    await betaStatusGET(req);
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'upper@example.com' } })
    );
  });

  // ---- Error handling ------------------------------------------------------

  it('returns 500 when prisma throws an unexpected error', async () => {
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));
    const req = makeStatusRequest(TEST_EMAIL);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/unable to check status/i);
  });

  it('does not expose sensitive user fields (email, betaSignupDate) in the response', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      passwordInitialized: true,
    } as never);
    const req = makeStatusRequest(TEST_EMAIL);
    const res = await betaStatusGET(req);
    const body = await res.json();
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('betaSignupDate');
    expect(body).not.toHaveProperty('newsletterSubscribed');
  });

  it('queries prisma with only the passwordInitialized select field', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      passwordInitialized: false,
    } as never);
    const req = makeStatusRequest(TEST_EMAIL);
    await betaStatusGET(req);
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { passwordInitialized: true },
      })
    );
  });
});
