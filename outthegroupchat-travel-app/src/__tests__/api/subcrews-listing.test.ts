/**
 * Unit tests for V1 SubCrew listing endpoints:
 *   GET /api/subcrews/emerging — joinable cards (Crew member, caller not member)
 *   GET /api/subcrews/mine     — caller's own SubCrews
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
import { GET as GET_MINE } from '@/app/api/subcrews/mine/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockSubCrew = prisma.subCrew as unknown as { findMany: MockFn };
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60_000 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const fakeSubCrew = (over: Record<string, unknown> = {}) => ({
  id: 'sc-1',
  topicId: 'topic-drinks',
  windowPreset: 'EVENING',
  startAt: new Date(),
  endAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
  cityArea: 'east-village',
  venueId: null,
  meetupId: null,
  createdAt: new Date(),
  topic: { id: 'topic-drinks', slug: 'drinks', displayName: 'Drinks' },
  members: [
    { id: 'm-A', userId: 'user-A', joinMode: 'AUTO', user: { id: 'user-A', name: 'A', image: null } },
    { id: 'm-B', userId: 'user-B', joinMode: 'AUTO', user: { id: 'user-B', name: 'B', image: null } },
  ],
  ...over,
});

const makeGetReq = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/subcrews/emerging
// ===========================================================================
describe('GET /api/subcrews/emerging', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(429);
  });

  it('200 returns empty list when caller has no Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.subCrews).toEqual([]);
    // Short-circuit: subCrew.findMany must NOT have run.
    expect(mockSubCrew.findMany).not.toHaveBeenCalled();
  });

  it('200 returns SubCrews where Crew is a member but caller is not', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([fakeSubCrew()]);

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subCrews).toHaveLength(1);

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    // members.some.userId.in should be Crew partner ids (not the caller).
    expect(where.members.some.userId.in.sort()).toEqual(['user-2', 'user-3']);
    // NOT caller as a member.
    expect(where.NOT.members.some.userId).toBe('user-1');
    // Active window only.
    expect(where.endAt.gt).toBeInstanceOf(Date);
  });

  it('200 only resolves Crew partners (filters caller out of pair)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.members.some.userId.in).toEqual(['user-2']);
  });

  it('200 with default limit=10 when no query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('200 honors a valid limit query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq('/api/subcrews/emerging', { limit: '25' }));
    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(25);
  });

  it('400 when limit is not a number', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging', { limit: 'abc' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
  });

  it('400 when limit exceeds max (50)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging', { limit: '51' }));
    expect(res.status).toBe(400);
  });

  it('400 when limit is below min (0)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging', { limit: '0' }));
    expect(res.status).toBe(400);
  });

  it('200 orders results by createdAt desc', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(mockSubCrew.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('500 when Prisma throws unexpectedly', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockRejectedValueOnce(new Error('DB down'));

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to list emerging subcrews');
  });
});

// ===========================================================================
// GET /api/subcrews/mine
// ===========================================================================
describe('GET /api/subcrews/mine', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(res.status).toBe(401);
  });

  it('429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(res.status).toBe(429);
  });

  it('200 returns SubCrews where caller is a member, scoped to current user', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-42'));
    mockSubCrew.findMany.mockResolvedValueOnce([fakeSubCrew()]);

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subCrews).toHaveLength(1);

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.members.some.userId).toBe('user-42');
  });

  it('200 returns empty array when caller has no SubCrews', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subCrews).toEqual([]);
  });

  it('200 filters out expired SubCrews by default (endAt > now)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/subcrews/mine'));
    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.endAt.gt).toBeInstanceOf(Date);
  });

  it('200 includes expired SubCrews when includeExpired=true', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/subcrews/mine', { includeExpired: 'true' }));
    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.endAt).toBeUndefined();
  });

  it('200 with default limit=50 when no query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('200 honors a valid limit query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/subcrews/mine', { limit: '5' }));
    expect(mockSubCrew.findMany.mock.calls[0][0].take).toBe(5);
  });

  it('400 when limit exceeds max (100)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine', { limit: '101' }));
    expect(res.status).toBe(400);
  });

  it('400 when limit is non-numeric', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine', { limit: 'foo' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
  });

  it('200 orders results by createdAt desc', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([]);

    await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(mockSubCrew.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('500 when Prisma throws unexpectedly', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockRejectedValueOnce(new Error('DB down'));

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to list subcrews');
  });
});
