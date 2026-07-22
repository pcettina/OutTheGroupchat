/**
 * Unit tests for POST /api/checkins/ping — ping nearby active Crew.
 *
 * The route resolves accepted-Crew partners (both directions), applies a mutual
 * UserBlock filter, finds partners with an active check-in (`activeUntil > now`),
 * optionally narrows to the caller's own active check-in city/venue, then creates
 * `CREW_CHECKED_IN_NEARBY` notifications via `prisma.notification.createMany`.
 *
 * Prisma, NextAuth, logger, sentry, and rate-limit mocks are established in
 * src/__tests__/setup.ts. This file re-mocks @/lib/rate-limit to get a
 * controllable reference and re-arms the mock after vi.resetAllMocks() in
 * beforeEach (leakage guard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — must be declared before any imports
// that transitively pull the module.
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

// Static imports — NEVER use dynamic await import in beforeEach.
import { POST } from '@/app/api/checkins/ping/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegates
// ---------------------------------------------------------------------------
const mockPrismaCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaUserBlock = prisma.userBlock as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaCheckIn = prisma.checkIn as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

const mockPrismaNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/checkins/ping';

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makePostReq = (body: unknown = {}) =>
  new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate-limit pass-through after resetAllMocks wipes mockResolvedValue.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// Auth + rate limiting + validation
// ===========================================================================
describe('POST /api/checkins/ping — guards', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
    // No Crew resolution should occur on the unauthenticated path.
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 when targetUserId is not a string (Zod validation)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    // Valid JSON but wrong type — Zod string().min(1) rejects a number.
    const res = await POST(makePostReq({ targetUserId: 123 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid request body');
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 when targetUserId is an empty string (min(1))', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await POST(makePostReq({ targetUserId: '' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid request body');
  });
});

// ===========================================================================
// Ping-all happy path
// ===========================================================================
describe('POST /api/checkins/ping — ping all active Crew', () => {
  it('pings 2 active crew partners and creates CREW_CHECKED_IN_NEARBY notifications', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1', 'Alice'));

    // Two accepted crew rows — partners are user-2 and user-3.
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    // No blocks.
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);
    // Caller has no active check-in of their own → no city/venue narrowing.
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);
    // Both partners are actively checked in.
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([
      { userId: 'user-2' },
      { userId: 'user-3' },
    ]);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ name: 'Alice' });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pinged).toBe(2);

    expect(mockPrismaNotification.createMany).toHaveBeenCalledTimes(1);
    const notifCall = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    expect(notifCall?.data).toHaveLength(2);
    expect(notifCall?.data[0].type).toBe('CREW_CHECKED_IN_NEARBY');
    expect(notifCall?.data[1].type).toBe('CREW_CHECKED_IN_NEARBY');
    // data payload carries kind PING + the caller as fromUserId.
    expect(notifCall?.data[0].data).toEqual({ kind: 'PING', fromUserId: 'user-1' });
    expect(notifCall?.data[1].data).toEqual({ kind: 'PING', fromUserId: 'user-1' });
    // Recipients are the two active partners.
    const recipients = notifCall?.data.map((d: { userId: string }) => d.userId).sort();
    expect(recipients).toEqual(['user-2', 'user-3']);
  });

  it('returns pinged:0 and creates no notifications when no Crew has an active check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);
    // No active check-ins among crew partners.
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pinged).toBe(0);
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('returns pinged:0 immediately when the caller has no eligible Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    // No crew rows at all.
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pinged).toBe(0);
    // Short-circuits before ever querying check-ins.
    expect(mockPrismaCheckIn.findMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Block filtering + active-only semantics
// ===========================================================================
describe('POST /api/checkins/ping — block + active filtering', () => {
  it('excludes a blocked crew member from the ping target list', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    // Two crew partners: user-2 and user-3.
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-1', userBId: 'user-3' },
    ]);
    // user-3 is blocked (caller blocked them).
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([
      { blockerId: 'user-1', blockedId: 'user-3' },
    ]);
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);
    // Prisma would only return the surviving target (user-2).
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([{ userId: 'user-2' }]);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ name: 'Alice' });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pinged).toBe(1);

    // The blocked user must never appear in the queried target set.
    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    const queriedIds: string[] = whereArg?.userId?.in ?? [];
    expect(queriedIds).toContain('user-2');
    expect(queriedIds).not.toContain('user-3');

    // And the created notification targets only the non-blocked partner.
    const notifCall = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    expect(notifCall?.data).toHaveLength(1);
    expect(notifCall?.data[0].userId).toBe('user-2');
  });

  it('excludes a crew member who blocked the caller (reverse block)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    // user-2 blocked the caller.
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([
      { blockerId: 'user-2', blockedId: 'user-1' },
    ]);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Only crew partner was blocked → nobody eligible → short circuit.
    expect(body.data.pinged).toBe(0);
    expect(mockPrismaCheckIn.findMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('only pings partners with an active check-in (expired check-ins excluded)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    // user-2 active, user-3 expired.
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-1', userBId: 'user-3' },
    ]);
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);
    // Prisma's activeUntil>now filter only surfaces user-2.
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([{ userId: 'user-2' }]);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ name: 'Alice' });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pinged).toBe(1);

    // The route must constrain the query to active check-ins.
    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg?.activeUntil?.gt).toBeInstanceOf(Date);

    const notifCall = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    expect(notifCall?.data).toHaveLength(1);
    expect(notifCall?.data[0].userId).toBe('user-2');
  });

  it('narrows targets to the caller city/venue when the caller has an active check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);
    // Caller is actively checked in at a specific city + venue.
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce({
      cityId: 'city-1',
      venueId: 'venue-1',
    });
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([{ userId: 'user-2' }]);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ name: 'Alice' });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(200);
    // The active-checkin query should carry the caller's city + venue scope.
    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg?.cityId).toBe('city-1');
    expect(whereArg?.venueId).toBe('venue-1');
  });
});

// ===========================================================================
// Explicit targetUserId
// ===========================================================================
describe('POST /api/checkins/ping — explicit targetUserId', () => {
  it('pings a single valid, active, accepted crew member (pinged:1)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1', 'Alice'));

    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-1', userBId: 'user-3' },
    ]);
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);
    // Only the explicitly targeted, active user comes back.
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([{ userId: 'user-2' }]);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ name: 'Alice' });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST(makePostReq({ targetUserId: 'user-2' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pinged).toBe(1);

    // The query is restricted to just the target.
    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg?.userId?.in).toEqual(['user-2']);

    const notifCall = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    expect(notifCall?.data).toHaveLength(1);
    expect(notifCall?.data[0].userId).toBe('user-2');
  });

  it('returns 400 when targetUserId is not an accepted crew member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    // Caller's only crew partner is user-2.
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);

    // Target a stranger who is not in the crew.
    const res = await POST(makePostReq({ targetUserId: 'stranger-9' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('User is not an accepted Crew member');
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('returns 404 when targetUserId is crew but has no active check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);
    // No active check-in for the targeted user.
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    const res = await POST(makePostReq({ targetUserId: 'user-2' }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('User does not have an active check-in nearby');
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 when targetUserId is a blocked crew member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    // Two crew partners so eligiblePartnerIds stays non-empty after the block
    // filter removes user-2 (otherwise the route short-circuits to pinged:0).
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-1', userBId: 'user-3' },
    ]);
    // user-2 is blocked → filtered out of eligible partners.
    mockPrismaUserBlock.findMany.mockResolvedValueOnce([
      { blockerId: 'user-1', blockedId: 'user-2' },
    ]);
    mockPrismaCheckIn.findFirst.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ targetUserId: 'user-2' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('User is not an accepted Crew member');
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });
});
