/**
 * Unit tests for GET /api/crew/suggestions — "People you may know".
 *
 * Friend-of-friend (FoF) Crew suggestions for the authenticated viewer,
 * ranked by mutual-Crew count (desc). The route sources candidates from
 * {@link getFofSet} (already sorted, viewer + accepted Crew excluded), then
 * additionally strips blocked users and PENDING-request counterparts before
 * hydrating the survivors from `prisma.user`.
 *
 * The Prisma, NextAuth, logger, sentry mocks live in src/__tests__/setup.ts.
 * This file additionally:
 *   - self-mocks @/lib/rate-limit (re-armed in beforeEach, known reset-leak),
 *   - mocks @/lib/heatmap/fof-graph so getFofSet returns a deterministic,
 *     pre-ranked FofEntry[] we fully control (bypasses the 60s in-proc cache).
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  creationQuotaLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/heatmap/fof-graph', () => ({
  getFofSet: vi.fn(),
  __resetFofCacheForTests: vi.fn(),
}));

import { GET } from '@/app/api/crew/suggestions/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { getFofSet } from '@/lib/heatmap/fof-graph';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetFofSet = vi.mocked(getFofSet);
const mockGetServerSession = vi.mocked(getServerSession);

const crew = prisma.crew as unknown as { findMany: Mock };
const userBlock = prisma.userBlock as unknown as { findMany: Mock };
const user = prisma.user as unknown as { findMany: Mock };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VIEWER = 'user-viewer-0000';
const USER_A = 'user-aaa-1111';
const USER_B = 'user-bbb-2222';
const USER_C = 'user-ccc-3333';

const sessionFor = (id: string) => ({
  user: { id, name: 'Viewer', email: `${id}@example.com` },
  expires: '2099-01-01',
});

type FofEntry = { userId: string; mutualCount: number; anchorIds: string[] };
const fofEntry = (userId: string, mutualCount: number): FofEntry => ({
  userId,
  mutualCount,
  anchorIds: [],
});

const userRow = (id: string, name: string, city: string | null = 'NYC') => ({
  id,
  name,
  image: `${id}.png`,
  city,
});

const makeReq = (qs = '') =>
  new NextRequest(`http://localhost/api/crew/suggestions${qs}`, { method: 'GET' });

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm the rate-limit pass-through (wiped by resetAllMocks — known leak).
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: Date.now() + 60000,
  });
  // Sensible defaults: no blocks, no pending edges.
  userBlock.findMany.mockResolvedValue([]);
  crew.findMany.mockResolvedValue([]);
  user.findMany.mockResolvedValue([]);
  mockGetFofSet.mockResolvedValue([]);
});

// ===========================================================================
// Auth + rate limit
// ===========================================================================
describe('GET /api/crew/suggestions — gates', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    // getFofSet must not run without an authenticated viewer.
    expect(mockGetFofSet).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limiter rejects', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockGetFofSet).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Happy path + ranking
// ===========================================================================
describe('GET /api/crew/suggestions — ranking & shape', () => {
  it('returns items in mutualCount order with the full item shape', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([
      fofEntry(USER_A, 5),
      fofEntry(USER_B, 3),
      fofEntry(USER_C, 1),
    ]);
    user.findMany.mockResolvedValue([
      userRow(USER_A, 'Alice'),
      userRow(USER_B, 'Bob'),
      userRow(USER_C, 'Carol'),
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const items = body.data.items;
    expect(items).toHaveLength(3);
    expect(items.map((i: { id: string }) => i.id)).toEqual([USER_A, USER_B, USER_C]);
    expect(items.map((i: { mutualCount: number }) => i.mutualCount)).toEqual([5, 3, 1]);

    // Full item shape.
    expect(items[0]).toEqual({
      id: USER_A,
      name: 'Alice',
      image: `${USER_A}.png`,
      city: 'NYC',
      mutualCount: 5,
    });
    // getFofSet queried for the authenticated viewer.
    expect(mockGetFofSet).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: VIEWER }),
    );
  });

  it('preserves fof ranking even when prisma.user.findMany returns rows out of order', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([
      fofEntry(USER_A, 9),
      fofEntry(USER_B, 4),
      fofEntry(USER_C, 2),
    ]);
    // Deliberately shuffled relative to the fof ranking.
    user.findMany.mockResolvedValue([
      userRow(USER_C, 'Carol'),
      userRow(USER_A, 'Alice'),
      userRow(USER_B, 'Bob'),
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([
      USER_A,
      USER_B,
      USER_C,
    ]);
    expect(body.data.items.map((i: { name: string }) => i.name)).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ]);
  });

  it('drops fof entries with no hydrated user row', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([fofEntry(USER_A, 5), fofEntry(USER_B, 3)]);
    // USER_B has no matching user row (e.g. deleted) → filtered out.
    user.findMany.mockResolvedValue([userRow(USER_A, 'Alice')]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe(USER_A);
  });
});

// ===========================================================================
// Filtering: blocks + pending edges
// ===========================================================================
describe('GET /api/crew/suggestions — filtering', () => {
  it('removes a user the viewer has blocked (viewer is blocker)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([fofEntry(USER_A, 5), fofEntry(USER_B, 3)]);
    userBlock.findMany.mockResolvedValue([{ blockerId: VIEWER, blockedId: USER_B }]);
    user.findMany.mockResolvedValue([userRow(USER_A, 'Alice')]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([USER_A]);
    // The hydrate query must not include the blocked id.
    const whereIn = user.findMany.mock.calls[0]?.[0]?.where?.id?.in;
    expect(whereIn).toContain(USER_A);
    expect(whereIn).not.toContain(USER_B);
  });

  it('removes a user who blocked the viewer (viewer is blocked)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([fofEntry(USER_A, 5), fofEntry(USER_B, 3)]);
    userBlock.findMany.mockResolvedValue([{ blockerId: USER_A, blockedId: VIEWER }]);
    user.findMany.mockResolvedValue([userRow(USER_B, 'Bob')]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([USER_B]);
  });

  it('removes users with a PENDING Crew edge touching the viewer', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([fofEntry(USER_A, 5), fofEntry(USER_B, 3)]);
    // Pending edge viewer<->USER_A (viewer on userA side; other side USER_A).
    crew.findMany.mockResolvedValue([{ userAId: VIEWER, userBId: USER_A }]);
    user.findMany.mockResolvedValue([userRow(USER_B, 'Bob')]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([USER_B]);

    // The PENDING query is scoped to PENDING edges touching the viewer.
    const where = crew.findMany.mock.calls[0]?.[0]?.where;
    expect(where?.status).toBe('PENDING');
  });

  it('resolves the pending counterpart when the viewer is on the userB side', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([fofEntry(USER_A, 5), fofEntry(USER_B, 3)]);
    // Pending edge USER_B<->viewer (viewer on userB side; counterpart USER_B).
    crew.findMany.mockResolvedValue([{ userAId: USER_B, userBId: VIEWER }]);
    user.findMany.mockResolvedValue([userRow(USER_A, 'Alice')]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([USER_A]);
  });
});

// ===========================================================================
// limit handling + empty set
// ===========================================================================
describe('GET /api/crew/suggestions — limit & empty', () => {
  it('respects a valid ?limit=', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([
      fofEntry(USER_A, 5),
      fofEntry(USER_B, 3),
      fofEntry(USER_C, 1),
    ]);
    user.findMany.mockResolvedValue([
      userRow(USER_A, 'Alice'),
      userRow(USER_B, 'Bob'),
    ]);

    const res = await GET(makeReq('?limit=2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.map((i: { id: string }) => i.id)).toEqual([USER_A, USER_B]);
    // Only the top-2 ids should be hydrated.
    const whereIn = user.findMany.mock.calls[0]?.[0]?.where?.id?.in;
    expect(whereIn).toEqual([USER_A, USER_B]);
  });

  it('returns 400 for a non-numeric ?limit=', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    const res = await GET(makeReq('?limit=abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockGetFofSet).not.toHaveBeenCalled();
  });

  it('returns 400 for an out-of-range ?limit= (>50)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    const res = await GET(makeReq('?limit=999'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns an empty items array (200) when getFofSet is empty', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { items: [] } });
    // Nothing to hydrate.
    expect(user.findMany).not.toHaveBeenCalled();
  });

  it('returns empty items when every candidate is filtered out', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(VIEWER));
    mockGetFofSet.mockResolvedValue([fofEntry(USER_A, 5)]);
    userBlock.findMany.mockResolvedValue([{ blockerId: VIEWER, blockedId: USER_A }]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([]);
    expect(user.findMany).not.toHaveBeenCalled();
  });
});
