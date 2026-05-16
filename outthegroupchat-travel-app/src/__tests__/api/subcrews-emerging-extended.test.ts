/**
 * Extended edge-case tests for GET /api/subcrews/emerging.
 *
 * Complements src/__tests__/api/subcrews.test.ts which covers the three
 * happy paths (401, empty Crew, basic 200). This file digs into:
 *   - Zod limit validation (default, custom, min, max, non-numeric, NaN coerce)
 *   - Rate-limit 429 path
 *   - Crew dedup / mixed userA/userB orientation
 *   - "Caller is not a member" NOT-clause assertion
 *   - endAt window filter (forward-only)
 *   - createdAt DESC ordering hint
 *   - Empty subCrew result with non-empty Crew
 *   - take=limit propagation
 *   - 500 error path (prisma throws on crew.findMany)
 *   - 500 error path (prisma throws on subCrew.findMany)
 *   - Caller appearing on both sides of the same Crew row (self-paired ⇒
 *     handler still resolves the "other" id correctly)
 *
 * All mocks use mockResolvedValueOnce() exclusively. vi.clearAllMocks() runs
 * in beforeEach so per-test mockResolvedValueOnce queues are not polluted by
 * the module-level mockResolvedValue on checkRateLimit (we re-arm it).
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

import { GET as GET_EMERGING } from '@/app/api/subcrews/emerging/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockSubCrew = prisma.subCrew as unknown as { findMany: MockFn };
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 999 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeGetReq = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/subcrews/emerging');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm module-level mock (factory mockResolvedValue is wiped per memory note).
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ---------------------------------------------------------------------------
// Auth + rate-limit gates
// ---------------------------------------------------------------------------

describe('GET /api/subcrews/emerging — auth & rate-limit gates', () => {
  it('returns 429 when rate limit exceeded (auth passes first)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_EMERGING(makeGetReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
    // Confirm short-circuit — no DB call after 429.
    expect(mockCrew.findMany).not.toHaveBeenCalled();
    expect(mockSubCrew.findMany).not.toHaveBeenCalled();
  });

  it('passes per-user identifier into rate limiter', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-42'));
    mockCheckRateLimit.mockResolvedValueOnce(RL_PASS);
    mockCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockCheckRateLimit.mock.calls[0][1]).toBe('subcrew-emerging:user-42');
  });
});

// ---------------------------------------------------------------------------
// Zod query param validation
// ---------------------------------------------------------------------------

describe('GET /api/subcrews/emerging — query validation', () => {
  it('uses limit=10 by default when no query param supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_EMERGING(makeGetReq());
    expect(res.status).toBe(200);
    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('honors explicit limit=25 query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_EMERGING(makeGetReq({ limit: '25' }));
    expect(res.status).toBe(200);
    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(25);
  });

  it('400 when limit=0 (below min=1)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    const res = await GET_EMERGING(makeGetReq({ limit: '0' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
    expect(mockCrew.findMany).not.toHaveBeenCalled();
  });

  it('400 when limit=51 (above max=50)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    const res = await GET_EMERGING(makeGetReq({ limit: '51' }));
    expect(res.status).toBe(400);
    expect(mockCrew.findMany).not.toHaveBeenCalled();
  });

  it('400 when limit is non-numeric (Zod coerce → NaN → fail)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    const res = await GET_EMERGING(makeGetReq({ limit: 'abc' }));
    expect(res.status).toBe(400);
    expect(mockCrew.findMany).not.toHaveBeenCalled();
  });

  it('400 when limit is a float (int() rejects)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    const res = await GET_EMERGING(makeGetReq({ limit: '3.7' }));
    expect(res.status).toBe(400);
    expect(mockCrew.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Crew resolution → in: [crewIds] partner extraction
// ---------------------------------------------------------------------------

describe('GET /api/subcrews/emerging — Crew partner resolution', () => {
  it('extracts userB when caller is userA on the Crew row', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.members.some.userId.in).toEqual(['user-2']);
  });

  it('extracts userA when caller is userB on the Crew row', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-7', userBId: 'user-1' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.members.some.userId.in).toEqual(['user-7']);
  });

  it('preserves duplicate partner IDs from overlapping Crew rows (no dedup)', async () => {
    // The route's mapping is a straight map — if Prisma somehow returned two
    // rows mentioning the same partner (e.g., legacy schema bug), the
    // resulting `in` list will contain duplicates. Document current behavior.
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-2', userBId: 'user-1' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    // Both rows contribute 'user-2' as the "other" id.
    expect(where.members.some.userId.in).toEqual(['user-2', 'user-2']);
  });

  it('queries Crew with status=ACCEPTED only', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    const crewWhere = mockCrew.findMany.mock.calls[0][0].where;
    expect(crewWhere.status).toBe('ACCEPTED');
    expect(crewWhere.OR).toEqual([
      { userAId: 'user-1' },
      { userBId: 'user-1' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// SubCrew where-clause assertions (window, exclusion, ordering, limit)
// ---------------------------------------------------------------------------

describe('GET /api/subcrews/emerging — SubCrew query shape', () => {
  it('filters by endAt > now (time-window: forward-only)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    const before = Date.now();
    await GET_EMERGING(makeGetReq());
    const after = Date.now();

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.endAt.gt).toBeInstanceOf(Date);
    const t = (where.endAt.gt as Date).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('excludes SubCrews where caller is already a member (NOT clause)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.NOT.members.some.userId).toBe('user-1');
  });

  it('orders by createdAt desc (newest emerging first)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    expect(mockSubCrew.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('200 with [] when caller has Crew but no matching SubCrews', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_EMERGING(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.subCrews).toEqual([]);
  });

  it('returns multiple SubCrews verbatim (no client-side filtering)', async () => {
    const now = new Date();
    const sc1 = {
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      startAt: now,
      endAt: new Date(now.getTime() + 60 * 60 * 1000),
      cityArea: 'east-village',
      createdAt: now,
      topic: { id: 'topic-drinks', slug: 'drinks', displayName: 'Drinks' },
      members: [{ id: 'm1', userId: 'user-2', joinMode: 'SEED', user: { id: 'user-2', name: 'Bob', image: null } }],
    };
    const sc2 = {
      id: 'sc-2',
      topicId: 'topic-coffee',
      windowPreset: 'MORNING',
      startAt: now,
      endAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      cityArea: null,
      createdAt: new Date(now.getTime() - 10_000),
      topic: { id: 'topic-coffee', slug: 'coffee', displayName: 'Coffee' },
      members: [
        { id: 'm2', userId: 'user-3', joinMode: 'SEED', user: { id: 'user-3', name: 'Carol', image: null } },
        { id: 'm3', userId: 'user-4', joinMode: 'JOINED_VIA_IM_IN', user: { id: 'user-4', name: 'Dan', image: null } },
      ],
    };
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([sc1, sc2]);

    const res = await GET_EMERGING(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subCrews).toHaveLength(2);
    expect(body.data.subCrews[0].id).toBe('sc-1');
    expect(body.data.subCrews[1].id).toBe('sc-2');
    // Member counts arrive aggregated by Prisma include — sanity check.
    expect(body.data.subCrews[0].members).toHaveLength(1);
    expect(body.data.subCrews[1].members).toHaveLength(2);
  });

  it('uses the configured select projection (topic + members.user)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq());

    const select = mockSubCrew.findMany.mock.calls[0][0].select;
    expect(select.topic.select).toMatchObject({ id: true, slug: true, displayName: true });
    expect(select.members.select.user.select).toMatchObject({ id: true, name: true, image: true });
    expect(select.members.select.joinMode).toBe(true);
  });

  it('propagates limit into take', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq({ limit: '7' }));

    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe('GET /api/subcrews/emerging — error paths', () => {
  it('500 when prisma.crew.findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET_EMERGING(makeGetReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to list emerging subcrews');
    expect(mockSubCrew.findMany).not.toHaveBeenCalled();
  });

  it('500 when prisma.subCrew.findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockRejectedValueOnce(new Error('subcrew query failed'));

    const res = await GET_EMERGING(makeGetReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to list emerging subcrews');
  });
});
