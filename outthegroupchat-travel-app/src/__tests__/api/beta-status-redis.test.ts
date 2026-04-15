/**
 * Redis rate-limiting tests for GET /api/beta/status.
 *
 * These tests specifically verify the integration with the shared Redis
 * checkRateLimit from @/lib/rate-limit, covering:
 *
 *   - 429 when checkRateLimit returns success: false
 *   - Response body error message on 429
 *   - Happy path still works when rate limit passes (success: true)
 *   - checkRateLimit called with the correct IP-based identifier
 *   - x-forwarded-for, x-real-ip, and missing header all produce correct identifiers
 *   - checkRateLimit is called exactly once per request
 *   - When rate limited, no downstream database calls are made
 *   - Different remaining counts are handled correctly (0, 1, 99)
 *   - Rate limit identifier uses the "beta-status:" prefix
 *   - checkRateLimit receives the apiRateLimiter (null in test env)
 *   - 200 response still has correct body shape when rate limit passes
 *   - Multiple sequential requests each trigger their own checkRateLimit call
 *   - Reset timestamp is not leaked in the 429 response body
 *   - checkRateLimit error propagation (throws → 500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit
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
// Constants
// ---------------------------------------------------------------------------
const TEST_EMAIL = 'redis-test@example.com';
const TEST_IP_A = '203.0.113.10';
const TEST_IP_B = '203.0.113.20';
const RATE_LIMIT_ALLOWED = { success: true, limit: 100, remaining: 50, reset: 0 } as const;
const RATE_LIMIT_DENIED = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60_000 } as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(email: string, ip?: string): NextRequest {
  const url = `http://localhost:3000/api/beta/status?email=${encodeURIComponent(email)}`;
  const headers: Record<string, string> = {};
  if (ip) {
    headers['x-forwarded-for'] = ip;
  }
  return new NextRequest(url, { method: 'GET', headers });
}

function makeRequestWithRealIp(email: string, realIp: string): NextRequest {
  const url = `http://localhost:3000/api/beta/status?email=${encodeURIComponent(email)}`;
  return new NextRequest(url, {
    method: 'GET',
    headers: { 'x-real-ip': realIp },
  });
}

function makeRequestNoIpHeaders(email: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/beta/status?email=${encodeURIComponent(email)}`,
    { method: 'GET' }
  );
}

// ---------------------------------------------------------------------------
// Redis rate-limiting tests
// ---------------------------------------------------------------------------

describe('GET /api/beta/status — Redis rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  });

  it('returns 429 when checkRateLimit returns success: false', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_DENIED);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(429);
  });

  it('returns { error: "Rate limit exceeded" } body on 429', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_DENIED);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    const res = await betaStatusGET(req);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('does not expose reset timestamp in 429 response body', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_DENIED);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    const res = await betaStatusGET(req);
    const body = await res.json();
    expect(body).not.toHaveProperty('reset');
    expect(body).not.toHaveProperty('remaining');
  });

  it('returns 200 (happy path) when checkRateLimit returns success: true', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_ALLOWED);
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
  });

  it('calls checkRateLimit with x-forwarded-for IP prefixed by "beta-status:"', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    await betaStatusGET(req);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(null, `beta-status:${TEST_IP_A}`);
  });

  it('calls checkRateLimit with x-real-ip when x-forwarded-for header is absent', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeRequestWithRealIp(TEST_EMAIL, '172.31.0.7');
    await betaStatusGET(req);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(null, 'beta-status:172.31.0.7');
  });

  it('calls checkRateLimit with "beta-status:anonymous" when no IP headers are present', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeRequestNoIpHeaders(TEST_EMAIL);
    await betaStatusGET(req);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(null, 'beta-status:anonymous');
  });

  it('calls checkRateLimit exactly once per request', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    await betaStatusGET(req);
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
  });

  it('makes no database calls when the request is rate limited', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_DENIED);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    await betaStatusGET(req);
    expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
  });

  it('handles remaining: 1 (last allowed request) correctly — returns 200', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 1,
      reset: Date.now() + 30_000,
    });
    mockPrismaUser.findUnique.mockResolvedValueOnce({ passwordInitialized: true } as never);
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(200);
  });

  it('handles remaining: 0 with success: false — returns 429', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(429);
  });

  it('each sequential request triggers a separate checkRateLimit call', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null);

    const req1 = makeRequest(TEST_EMAIL, TEST_IP_A);
    const req2 = makeRequest(TEST_EMAIL, TEST_IP_B);

    await betaStatusGET(req1);
    await betaStatusGET(req2);

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(1, null, `beta-status:${TEST_IP_A}`);
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(2, null, `beta-status:${TEST_IP_B}`);
  });

  it('returns 500 when checkRateLimit throws an unexpected error', async () => {
    mockCheckRateLimit.mockRejectedValueOnce(new Error('Redis connection refused'));
    const req = makeRequest(TEST_EMAIL, TEST_IP_A);
    const res = await betaStatusGET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/unable to check status/i);
  });
});
