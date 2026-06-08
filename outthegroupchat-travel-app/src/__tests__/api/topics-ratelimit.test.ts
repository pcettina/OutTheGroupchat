/**
 * Edge-case unit tests for the per-user rate-limit on GET /api/topics
 * (salvaged from PR #112).
 *
 * The topics list route (src/app/api/topics/route.ts) rate-limits per
 * authenticated user via `checkRateLimit(apiRateLimiter, ` + "`topics-list:${userId}`" + `)`.
 * These tests exercise the rate-limit path more thoroughly than the base
 * topics.test.ts: the key shape (per-user), the 429 body/headers, that the
 * topic query is skipped when limited, ordering of the auth vs. rate-limit
 * checks, and the happy-path shape.
 *
 * NOTE (project lesson): @/lib/rate-limit is NOT globally mocked in setup.ts —
 * it is mocked locally here, and the factory-level mockResolvedValue is wiped by
 * vi.resetAllMocks() in beforeEach, so the pass-through is re-armed each time.
 * Per-test overrides use mockResolvedValueOnce per the project's mock-hygiene rules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Local rate-limit mock (not in setup.ts). Pass-through by default.
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from '@/app/api/topics/route';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaTopic = prisma.topic as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm the factory-level pass-through wiped by resetAllMocks().
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  mockGetRateLimitHeaders.mockReturnValue({});
});

describe('GET /api/topics — per-user rate limit', () => {
  it('under the limit: 200 and the topic query runs', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 42,
      reset: 0,
    });
    mockPrismaTopic.findMany.mockResolvedValueOnce([
      { id: 't1', slug: 'brunch', displayName: 'Brunch' },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.topics).toEqual([
      { id: 't1', slug: 'brunch', displayName: 'Brunch' },
    ]);
    expect(mockPrismaTopic.findMany).toHaveBeenCalledTimes(1);
  });

  it('over the limit: 429 with the expected body and the topic query is skipped', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 1234,
    });

    const res = await GET();

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Rate limit exceeded' });
    // The route must not hit the DB once rate-limited.
    expect(mockPrismaTopic.findMany).not.toHaveBeenCalled();
  });

  it('429 response carries the rate-limit headers from getRateLimitHeaders', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const rl = { success: false, limit: 100, remaining: 0, reset: 99999 };
    mockCheckRateLimit.mockResolvedValueOnce(rl);
    mockGetRateLimitHeaders.mockReturnValueOnce({
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '99999',
    });

    const res = await GET();

    expect(res.status).toBe(429);
    // getRateLimitHeaders is called with the result object from checkRateLimit.
    expect(mockGetRateLimitHeaders).toHaveBeenCalledWith(rl);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('X-RateLimit-Reset')).toBe('99999');
  });

  it('rate-limit key is per-user: uses the session user id', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-abc-123'));
    mockPrismaTopic.findMany.mockResolvedValueOnce([]);

    await GET();

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    const [, identifier] = mockCheckRateLimit.mock.calls[0];
    expect(identifier).toBe('topics-list:user-abc-123');
  });

  it('distinct users get distinct rate-limit keys', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('alice'));
    mockPrismaTopic.findMany.mockResolvedValueOnce([]);
    await GET();

    mockGetServerSession.mockResolvedValueOnce(sessionFor('bob'));
    mockPrismaTopic.findMany.mockResolvedValueOnce([]);
    await GET();

    expect(mockCheckRateLimit.mock.calls[0][1]).toBe('topics-list:alice');
    expect(mockCheckRateLimit.mock.calls[1][1]).toBe('topics-list:bob');
  });

  it('rate limiter is passed the apiRateLimiter instance (first arg)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce([]);

    await GET();

    // apiRateLimiter is mocked to null here; the route forwards it as arg 0.
    expect(mockCheckRateLimit.mock.calls[0][0]).toBeNull();
  });

  it('unauthenticated: 401 before the rate-limit check runs', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
    // Auth gate precedes rate limiting — no per-user key without a user.
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockPrismaTopic.findMany).not.toHaveBeenCalled();
  });

  it('session without a user id: 401, rate limit not consulted', async () => {
    // Session present but user.id missing -> route treats as unauthorized.
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'NoId', email: 'noid@example.com' },
      expires: '2099-01-01',
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockPrismaTopic.findMany).not.toHaveBeenCalled();
  });

  it('successful path returns the expected topics shape (id/slug/displayName, ordered)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce([
      { id: 't1', slug: 'brunch', displayName: 'Brunch' },
      { id: 't2', slug: 'drinks', displayName: 'Drinks' },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.topics).toHaveLength(2);
    expect(mockPrismaTopic.findMany).toHaveBeenCalledWith({
      select: { id: true, slug: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
  });
});
