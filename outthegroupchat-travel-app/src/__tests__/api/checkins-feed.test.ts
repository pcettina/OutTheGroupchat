/**
 * Unit tests for GET /api/checkins/feed
 *
 * Phase 8 — launch-readiness re-audit.
 * Focused suite for the crew check-in feed endpoint:
 *   - Authentication & rate-limit gates
 *   - Crew membership resolution (userA/userB symmetry)
 *   - activeUntil > now filtering
 *   - Visibility-scoped OR clause (PUBLIC + CREW from partners, own check-ins)
 *   - Response shape and ordering
 *   - Error handling (500)
 *
 * Global mocks (prisma, next-auth, logger, sentry) are provided by
 * src/__tests__/setup.ts.  Rate-limit is re-mocked here for local control
 * and re-armed via mockResolvedValue in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Rate-limit mock — must be declared before route imports
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
// Typed Prisma delegates
// ---------------------------------------------------------------------------
const mockCheckIn = prisma.checkIn as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};

const mockCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FEED_URL = 'http://localhost/api/checkins/feed';

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeFeedReq = () => new NextRequest(FEED_URL, { method: 'GET' });

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60 * 1000);

const fakeCheckIn = (overrides: Record<string, unknown> = {}) => ({
  id: 'ci-default',
  userId: 'user-2',
  venueId: null,
  note: 'At the coffee shop',
  latitude: null,
  longitude: null,
  visibility: 'PUBLIC',
  activeUntil: minutesFromNow(120),
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 'user-2', name: 'Bob', image: null },
  venue: null,
  ...overrides,
});

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/checkins/feed
// ===========================================================================

describe('GET /api/checkins/feed', () => {
  // -------------------------------------------------------------------------
  // Auth gate
  // -------------------------------------------------------------------------
  it('returns 401 when no session exists', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {}, expires: '2099-01-01' } as never);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Rate limit
  // -------------------------------------------------------------------------
  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it('returns 200 with active crew check-ins', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockCheckIn.findMany.mockResolvedValueOnce([
      fakeCheckIn({ id: 'ci-1', userId: 'user-2' }),
      fakeCheckIn({ id: 'ci-2', userId: 'user-3' }),
    ]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe('ci-1');
    expect(body.data[1].id).toBe('ci-2');
  });

  it('returns 200 with empty array when user has no Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([]);
    mockCheckIn.findMany.mockResolvedValueOnce([]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with empty array when all crew check-ins are expired', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    // Route filters activeUntil > now at DB level — simulate empty result
    mockCheckIn.findMany.mockResolvedValueOnce([]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Crew membership filtering
  // -------------------------------------------------------------------------
  it('passes activeUntil: { gt: Date } filter to prisma.checkIn.findMany', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockCheckIn.findMany.mockResolvedValueOnce([]);

    const before = new Date();
    await GET_FEED(makeFeedReq());
    const after = new Date();

    const whereArg = mockCheckIn.findMany.mock.calls[0][0].where;
    expect(whereArg.activeUntil?.gt).toBeInstanceOf(Date);
    expect((whereArg.activeUntil.gt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect((whereArg.activeUntil.gt as Date).getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it('resolves crew partner correctly when caller is userAId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    // Caller is userAId → partner is userBId
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-partner' }]);
    mockCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const whereArg = mockCheckIn.findMany.mock.calls[0][0].where;
    const orClauses: Array<{ userId?: { in?: string[] } }> = whereArg?.OR ?? [];
    const crewIds = orClauses.flatMap((c) => c.userId?.in ?? []);
    expect(crewIds).toContain('user-partner');
  });

  it('resolves crew partner correctly when caller is userBId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    // Caller is userBId → partner is userAId
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-partner-a', userBId: 'user-1' }]);
    mockCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const whereArg = mockCheckIn.findMany.mock.calls[0][0].where;
    const orClauses: Array<{ userId?: { in?: string[] } }> = whereArg?.OR ?? [];
    const crewIds = orClauses.flatMap((c) => c.userId?.in ?? []);
    expect(crewIds).toContain('user-partner-a');
  });

  it('queries crew with status ACCEPTED and OR condition on caller ID', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-42'));
    mockCrew.findMany.mockResolvedValueOnce([]);
    mockCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const crewWhere = mockCrew.findMany.mock.calls[0][0].where;
    expect(crewWhere.status).toBe('ACCEPTED');
    const orClauses: Array<{ userAId?: string; userBId?: string }> = crewWhere.OR ?? [];
    const callerPresentInOR =
      orClauses.some((c) => c.userAId === 'user-42') ||
      orClauses.some((c) => c.userBId === 'user-42');
    expect(callerPresentInOR).toBe(true);
  });

  it('response data includes user and venue fields (select shape)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    const venue = { id: 'v1', name: 'The Rooftop', city: 'NYC', category: 'BAR' };
    mockCheckIn.findMany.mockResolvedValueOnce([
      fakeCheckIn({
        id: 'ci-rich',
        userId: 'user-2',
        venueId: 'v1',
        venue,
        user: { id: 'user-2', name: 'Bob', image: 'https://example.com/bob.jpg' },
      }),
    ]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    const item = body.data[0];
    expect(item.user).toBeDefined();
    expect(item.user.name).toBe('Bob');
    expect(item.venue.name).toBe('The Rooftop');
  });

  it('returns 500 when prisma.crew.findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to retrieve check-in feed');
  });

  it('returns 500 when prisma.checkIn.findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockCheckIn.findMany.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to retrieve check-in feed');
  });
});
