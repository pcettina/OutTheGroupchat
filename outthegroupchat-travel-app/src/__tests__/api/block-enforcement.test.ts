/**
 * Block-enforcement safety tests (Day 5, T1b).
 *
 * A UserBlock (mutual — either the viewer blocked X, or X blocked the viewer)
 * must remove X from EVERY surface that can reveal X's presence, interest, or
 * social edges. A partial leak on any one surface is a safety regression, so
 * each of the four surfaces gets its own enforcement assertion plus a control
 * asserting the query is unchanged when there are no blocks.
 *
 * Surfaces:
 *   1. Crew list        — GET /api/crew                (crew.findMany where.OR notIn)
 *   2. Feed             — GET /api/feed                (meetup.hostId notIn + checkIn.userId notIn)
 *   3. Heatmap aggregate — aggregateContributions()     (heatmapContribution.userId notIn via excludeUserIds)
 *   4. Check-in feed    — GET /api/checkins/feed       (checkIn.userId notIn)
 *
 * Prisma / next-auth / logger / sentry mocks come from src/__tests__/setup.ts
 * (which mocks `userBlock`). This file additionally mocks @/lib/rate-limit and
 * re-arms checkRateLimit in beforeEach (setup's resetAllMocks wipes it → 500s).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET as crewGET } from '@/app/api/crew/route';
import { GET as feedGET } from '@/app/api/feed/route';
import { GET as checkinsFeedGET } from '@/app/api/checkins/feed/route';
import { aggregateContributions } from '@/lib/heatmap/aggregate';
import { __resetFofCacheForTests } from '@/lib/heatmap/fof-graph';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

const mockUserBlock = prisma.userBlock as unknown as { findMany: MockFn };
const mockCrew = prisma.crew as unknown as { findMany: MockFn; count: MockFn };
const mockMeetup = prisma.meetup as unknown as { findMany: MockFn };
const mockCheckIn = prisma.checkIn as unknown as { findMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { findMany: MockFn };
const mockRelSetting = prisma.crewRelationshipSetting as unknown as { findMany: MockFn };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ME = 'user-me-0001';
const BLOCKED = 'user-blocked-0002';
const PARTNER = 'user-partner-0003';

const sessionFor = (id: string) => ({
  user: { id, name: 'Tester', email: `${id}@example.com` },
  expires: '2099-01-01',
});

/** A UserBlock row: the viewer blocked BLOCKED. */
const blockRow = { blockerId: ME, blockedId: BLOCKED };

beforeEach(() => {
  vi.resetAllMocks();
  __resetFofCacheForTests();

  // Re-arm the rate-limit pass-through (setup's resetAllMocks wiped it).
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  mockGetRateLimitHeaders.mockReturnValue({});

  // Safe empty defaults for every query these surfaces fire; individual tests
  // override with mockResolvedValueOnce.
  mockUserBlock.findMany.mockResolvedValue([]);
  mockCrew.findMany.mockResolvedValue([]);
  mockCrew.count.mockResolvedValue(0);
  mockMeetup.findMany.mockResolvedValue([]);
  mockCheckIn.findMany.mockResolvedValue([]);
  mockHeatmap.findMany.mockResolvedValue([]);
  mockRelSetting.findMany.mockResolvedValue([]);
});

// ===========================================================================
// Surface 1 — Crew list (GET /api/crew)
// ===========================================================================
describe('block enforcement — crew list', () => {
  const makeReq = () => new NextRequest('http://localhost/api/crew');

  it('excludes the blocked user via notIn on both sides of the crew pair', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(ME));
    mockUserBlock.findMany.mockResolvedValueOnce([blockRow]);

    const res = await crewGET(makeReq());
    expect(res.status).toBe(200);

    const where = mockCrew.findMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toEqual([
      { userAId: ME, userBId: { notIn: [BLOCKED] } },
      { userBId: ME, userAId: { notIn: [BLOCKED] } },
    ]);
  });

  it('control — no blocks means an empty notIn (behavior unchanged)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(ME));
    mockUserBlock.findMany.mockResolvedValueOnce([]);

    const res = await crewGET(makeReq());
    expect(res.status).toBe(200);

    const where = mockCrew.findMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toEqual([
      { userAId: ME, userBId: { notIn: [] } },
      { userBId: ME, userAId: { notIn: [] } },
    ]);
  });
});

// ===========================================================================
// Surface 2 — Feed (GET /api/feed)
// ===========================================================================
describe('block enforcement — feed', () => {
  const makeReq = () => new NextRequest('http://localhost/api/feed');

  it('filters blocked users out of both meetup hosts and check-in authors', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(ME));
    mockUserBlock.findMany.mockResolvedValueOnce([blockRow]);

    const res = await feedGET(makeReq());
    expect(res.status).toBe(200);

    const meetupWhere = mockMeetup.findMany.mock.calls[0]?.[0]?.where;
    expect(meetupWhere.hostId).toEqual({ notIn: [BLOCKED] });

    const checkInWhere = mockCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(checkInWhere.userId).toEqual({ notIn: [BLOCKED] });
  });

  it('control — no blocks means no host/user notIn filter is added', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(ME));
    mockUserBlock.findMany.mockResolvedValueOnce([]);

    const res = await feedGET(makeReq());
    expect(res.status).toBe(200);

    const meetupWhere = mockMeetup.findMany.mock.calls[0]?.[0]?.where;
    expect(meetupWhere).not.toHaveProperty('hostId');

    const checkInWhere = mockCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(checkInWhere).not.toHaveProperty('userId');
  });
});

// ===========================================================================
// Surface 3 — Heatmap aggregate (aggregateContributions, crew tier)
// ===========================================================================
describe('block enforcement — heatmap aggregate', () => {
  it('excludes blocked users from the contributions query via notIn', async () => {
    // Crew partners include the blocked user; it must be dropped by excludeUserIds.
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: ME, userBId: BLOCKED },
      { userAId: ME, userBId: PARTNER },
    ]);
    mockUserBlock.findMany.mockResolvedValueOnce([blockRow]);

    await aggregateContributions({ viewerId: ME, type: 'interest', tier: 'crew' });

    const where = mockHeatmap.findMany.mock.calls[0]?.[0]?.where;
    expect(where.userId).toEqual({ in: [BLOCKED, PARTNER], notIn: [BLOCKED] });
  });

  it('control — no blocks means the userId filter carries no notIn', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: ME, userBId: BLOCKED },
      { userAId: ME, userBId: PARTNER },
    ]);
    mockUserBlock.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({ viewerId: ME, type: 'interest', tier: 'crew' });

    const where = mockHeatmap.findMany.mock.calls[0]?.[0]?.where;
    expect(where.userId).toEqual({ in: [BLOCKED, PARTNER] });
  });
});

// ===========================================================================
// Surface 4 — Check-in feed (GET /api/checkins/feed)
// ===========================================================================
describe('block enforcement — check-in feed', () => {
  const makeReq = () => new NextRequest('http://localhost/api/checkins/feed');

  it('excludes blocked users from the check-in query via notIn', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(ME));
    mockUserBlock.findMany.mockResolvedValueOnce([blockRow]);

    const res = await checkinsFeedGET(makeReq());
    expect(res.status).toBe(200);

    const where = mockCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(where.userId).toEqual({ notIn: [BLOCKED] });
  });

  it('control — no blocks means an empty notIn (behavior unchanged)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(ME));
    mockUserBlock.findMany.mockResolvedValueOnce([]);

    const res = await checkinsFeedGET(makeReq());
    expect(res.status).toBe(200);

    const where = mockCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(where.userId).toEqual({ notIn: [] });
  });
});
