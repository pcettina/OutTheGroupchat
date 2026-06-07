/**
 * Integration tests for GET /api/checkins/feed.
 *
 * Phase 8 — Launch-readiness re-audit. Action #5: integration coverage
 * on V1 hot paths. Covers crew-scoped active check-in feed behavior:
 * - Auth gate (401)
 * - Rate limiting (429)
 * - Visibility / Crew membership filtering
 * - activeUntil > now filter
 * - Ordering / limit
 * - Sentry error capture on prisma failure
 *
 * Re-mocks @/lib/rate-limit so we can control checkRateLimit. setup.ts
 * provides the base prisma/sentry/logger mocks. vi.resetAllMocks() in
 * beforeEach wipes mockResolvedValue queues so we re-arm the rate-limit
 * default at the top of each test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — must be declared before any
// imports that transitively pull the module.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET as GET_FEED } from '@/app/api/checkins/feed/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegates
// ---------------------------------------------------------------------------
const mockPrismaCheckIn = prisma.checkIn as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCaptureException = vi.mocked(captureException);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FEED_URL = 'http://localhost/api/checkins/feed';

const makeFeedReq = () => new NextRequest(FEED_URL);

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

/** Minimal active check-in record returned from prisma (activeUntil 6h ahead). */
const fakeActiveCheckIn = (overrides: Record<string, unknown> = {}) => {
  const future = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const created = new Date();
  return {
    id: 'checkin-active-1',
    userId: 'user-2',
    venueId: null,
    note: 'At the rooftop',
    latitude: null,
    longitude: null,
    visibility: 'PUBLIC',
    activeUntil: future.toISOString(),
    createdAt: created.toISOString(),
    updatedAt: created.toISOString(),
    user: { id: 'user-2', name: 'Bob', image: null },
    venue: null,
    ...overrides,
  };
};

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/checkins/feed
// ===========================================================================
describe('GET /api/checkins/feed', () => {
  it('returns 200 with active check-ins from accepted crew members', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([
      fakeActiveCheckIn({ id: 'ci-1', userId: 'user-2' }),
      fakeActiveCheckIn({
        id: 'ci-2',
        userId: 'user-3',
        user: { id: 'user-3', name: 'Carol', image: null },
      }),
    ]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe('ci-1');
  });

  it('returns 200 with empty list when caller has no crew and no own check-ins', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('queries prisma.checkIn.findMany with activeUntil > now filter', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    const before = Date.now();
    await GET_FEED(makeFeedReq());
    const after = Date.now();

    const callArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg.where.activeUntil).toBeDefined();
    expect(callArg.where.activeUntil.gt).toBeInstanceOf(Date);
    const nowArg = (callArg.where.activeUntil.gt as Date).getTime();
    expect(nowArg).toBeGreaterThanOrEqual(before);
    expect(nowArg).toBeLessThanOrEqual(after);
  });

  it('scopes visibility filter to PUBLIC and CREW for crew partner IDs (plus own)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const callArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    const orBranches = callArg.where.OR as Array<Record<string, unknown>>;
    expect(orBranches).toBeDefined();
    // Own check-ins branch (any visibility)
    const ownBranch = orBranches.find((b) => b.userId === 'user-1');
    expect(ownBranch).toBeDefined();
    // Crew partner PUBLIC branch
    const publicBranch = orBranches.find((b) => b.visibility === 'PUBLIC');
    expect(publicBranch).toBeDefined();
    const publicUserId = publicBranch?.userId as { in: string[] } | undefined;
    expect(publicUserId?.in).toEqual(['user-2', 'user-3']);
    // Crew partner CREW branch
    const crewBranch = orBranches.find((b) => b.visibility === 'CREW');
    expect(crewBranch).toBeDefined();
    const crewUserId = crewBranch?.userId as { in: string[] } | undefined;
    expect(crewUserId?.in).toEqual(['user-2', 'user-3']);
    // Confirm no PRIVATE branch is scoped to crew partners
    const privateBranchForOthers = orBranches.find(
      (b) =>
        b.visibility === 'PRIVATE' &&
        typeof b.userId === 'object' &&
        b.userId !== null
    );
    expect(privateBranchForOthers).toBeUndefined();
  });

  it('restricts crew lookup to ACCEPTED status', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const callArg = mockPrismaCrew.findMany.mock.calls[0]?.[0];
    expect(callArg.where.status).toBe('ACCEPTED');
    expect(callArg.where.OR).toEqual([
      { userAId: 'user-1' },
      { userBId: 'user-1' },
    ]);
  });

  it('orders results by createdAt desc and limits to 50', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const callArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0];
    expect(callArg.orderBy).toEqual({ createdAt: 'desc' });
    expect(callArg.take).toBe(50);
  });

  it('includes user (id, name, image) and venue (id, name, city, category) selects', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const callArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0];
    expect(callArg.include).toBeDefined();
    expect(callArg.include.user.select).toEqual({
      id: true,
      name: true,
      image: true,
    });
    expect(callArg.include.venue.select).toEqual({
      id: true,
      name: true,
      city: true,
      category: true,
    });
  });

  it('includes own check-ins regardless of visibility', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    const ownPrivate = fakeActiveCheckIn({
      id: 'ci-own-private',
      userId: 'user-1',
      visibility: 'PRIVATE',
      user: { id: 'user-1', name: 'Alice', image: null },
    });
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([ownPrivate]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ci-own-private');

    // Branch for own user-id should not constrain on visibility
    const callArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0];
    const orBranches = callArg.where.OR as Array<Record<string, unknown>>;
    const ownBranch = orBranches.find((b) => b.userId === 'user-1');
    expect(ownBranch).toBeDefined();
    expect(ownBranch?.visibility).toBeUndefined();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
    expect(mockPrismaCheckIn.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no user.id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No-ID' },
      expires: '2099-01-01',
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
    expect(mockPrismaCheckIn.findMany).not.toHaveBeenCalled();
  });

  it('keys the rate limiter by caller id (checkin-feed:<userId>)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-42'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    const args = mockCheckRateLimit.mock.calls[0];
    expect(args?.[1]).toBe('checkin-feed:user-42');
  });

  it('returns 500 and captures the error in Sentry when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    const boom = new Error('DB exploded');
    mockPrismaCheckIn.findMany.mockRejectedValueOnce(boom);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to retrieve check-in feed');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(boom);
  });

  it('handles crew lookup failure by returning 500 with Sentry capture', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    const boom = new Error('Crew query failed');
    mockPrismaCrew.findMany.mockRejectedValueOnce(boom);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledWith(boom);
    // findMany on checkIn should never have been reached
    expect(mockPrismaCheckIn.findMany).not.toHaveBeenCalled();
  });
});
