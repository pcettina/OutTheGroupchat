/**
 * Unit tests for V1 Phase 2 SubCrew API:
 *   GET    /api/subcrews/mine
 *   GET    /api/subcrews/[id]      — visibility (member or Crew-of-member)
 *   POST   /api/subcrews/[id]/join — "I'm in"
 *   GET    /api/subcrews/emerging  — joinable cards for the feed
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

import { GET as GET_MINE } from '@/app/api/subcrews/mine/route';
import { GET as GET_ONE } from '@/app/api/subcrews/[id]/route';
import { POST as POST_JOIN } from '@/app/api/subcrews/[id]/join/route';
import { GET as GET_EMERGING } from '@/app/api/subcrews/emerging/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockSubCrew = prisma.subCrew as unknown as {
  findMany: MockFn;
  findUnique: MockFn;
  create: MockFn;
};
const mockSubCrewMember = prisma.subCrewMember as unknown as { create: MockFn };
const mockCrew = prisma.crew as unknown as {
  findMany: MockFn;
  findFirst: MockFn;
};
const mockIntent = prisma.intent as unknown as { findFirst: MockFn };
const mockNotification = prisma.notification as unknown as { createMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };

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
  members: [
    { userId: 'user-A' },
    { userId: 'user-B' },
  ],
  ...over,
});

const makeGetReq = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};
const makePostReq = (path: string) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST' });

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
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

  it('200 returns SubCrews where caller is a member, not yet expired', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findMany.mockResolvedValueOnce([fakeSubCrew()]);

    const res = await GET_MINE(makeGetReq('/api/subcrews/mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subCrews).toHaveLength(1);

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.members.some.userId).toBe('user-1');
    expect(where.endAt.gt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// GET /api/subcrews/[id]
// ===========================================================================
describe('GET /api/subcrews/[id]', () => {
  const params = { params: { id: 'sc-1' } };

  it('404 when SubCrew not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findUnique.mockResolvedValueOnce(null);
    const res = await GET_ONE(makeGetReq('/api/subcrews/sc-1'), params);
    expect(res.status).toBe(404);
  });

  it('200 with viewerIsMember=true when caller is in members', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-A'));
    mockSubCrew.findUnique.mockResolvedValueOnce(fakeSubCrew());

    const res = await GET_ONE(makeGetReq('/api/subcrews/sc-1'), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.viewerIsMember).toBe(true);
    // Crew lookup short-circuited
    expect(mockCrew.findFirst).not.toHaveBeenCalled();
  });

  it('200 with viewerIsMember=false when caller is Crew of a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-C'));
    mockSubCrew.findUnique.mockResolvedValueOnce(fakeSubCrew());
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });

    const res = await GET_ONE(makeGetReq('/api/subcrews/sc-1'), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.viewerIsMember).toBe(false);
  });

  it('404 when caller is neither member nor Crew of a member (no leak)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-D'));
    mockSubCrew.findUnique.mockResolvedValueOnce(fakeSubCrew());
    mockCrew.findFirst.mockResolvedValueOnce(null);

    const res = await GET_ONE(makeGetReq('/api/subcrews/sc-1'), params);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/subcrews/[id]/join
// ===========================================================================
describe('POST /api/subcrews/[id]/join', () => {
  const params = { params: { id: 'sc-1' } };

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(401);
  });

  it('404 when SubCrew not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findUnique.mockResolvedValueOnce(null);
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(404);
  });

  it('409 when caller already a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-A'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }, { userId: 'user-B' }],
    });
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(409);
  });

  it('404 when caller is not Crew of any member (no leak)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-D'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }, { userId: 'user-B' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce(null);

    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(404);
  });

  it('201 attaches matching Intent + notifies all existing members', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-C'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }, { userId: 'user-B' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce({ id: 'intent-C' });
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'member-x',
      joinedAt: new Date(),
    });

    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(201);

    const memberCall = mockSubCrewMember.create.mock.calls[0][0];
    expect(memberCall.data).toMatchObject({
      subCrewId: 'sc-1',
      userId: 'user-C',
      intentId: 'intent-C',
      joinMode: 'JOINED_VIA_IM_IN',
    });

    const notifData = mockNotification.createMany.mock.calls[0][0].data;
    expect(notifData).toHaveLength(2);
    expect(notifData.map((n: { userId: string }) => n.userId).sort()).toEqual(['user-A', 'user-B']);
    expect(notifData[0].type).toBe('SUBCREW_JOINED');
  });

  it('201 with intentId=null when caller has no matching Intent (R21 open join)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-C'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce(null);
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'member-x',
      joinedAt: new Date(),
    });

    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(201);
    expect(mockSubCrewMember.create.mock.calls[0][0].data.intentId).toBeNull();
  });
});

// ===========================================================================
// GET /api/subcrews/emerging
// ===========================================================================
describe('GET /api/subcrews/emerging', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(401);
  });

  it('200 returns empty when caller has no Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET_EMERGING(makeGetReq('/api/subcrews/emerging'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subCrews).toEqual([]);
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

    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.members.some.userId.in).toEqual(['user-2', 'user-3']);
    expect(where.NOT.members.some.userId).toBe('user-1');
    expect(where.endAt.gt).toBeInstanceOf(Date);
  });
});
