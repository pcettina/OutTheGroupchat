/**
 * Unit tests for the V1 SubCrews API.
 *
 * Routes covered:
 *   GET    /api/subcrews/mine
 *   GET    /api/subcrews/emerging
 *   GET    /api/subcrews/[id]
 *   PATCH  /api/subcrews/[id]
 *   POST   /api/subcrews/[id]/join
 *   POST   /api/subcrews/[id]/commit
 *   PATCH  /api/subcrews/[id]/members/me
 *
 * Prisma / next-auth / logger / sentry mocks come from src/__tests__/setup.ts.
 * This file additionally mocks @/lib/rate-limit and the heatmap contribution
 * writer / window-adjacency helpers used by the routes.
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

vi.mock('@/lib/subcrew/window-adjacency', () => ({
  adjacentPresets: vi.fn().mockReturnValue(['TONIGHT', 'TOMORROW']),
}));

vi.mock('@/lib/heatmap/contribution-writer', () => ({
  buildInterestContributionData: vi.fn().mockReturnValue({
    userId: 'mock',
    contributionType: 'INTEREST',
  }),
}));

import { GET as mineGET } from '@/app/api/subcrews/mine/route';
import { GET as emergingGET } from '@/app/api/subcrews/emerging/route';
import {
  GET as detailGET,
  PATCH as detailPATCH,
} from '@/app/api/subcrews/[id]/route';
import { POST as joinPOST } from '@/app/api/subcrews/[id]/join/route';
import { POST as commitPOST } from '@/app/api/subcrews/[id]/commit/route';
import { PATCH as memberMePATCH } from '@/app/api/subcrews/[id]/members/me/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildInterestContributionData } from '@/lib/heatmap/contribution-writer';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockBuildInterestContribution = vi.mocked(buildInterestContributionData);
const mockGetServerSession = vi.mocked(getServerSession);

const mockSubCrew = prisma.subCrew as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockSubCrewMember = prisma.subCrewMember as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockCrew = prisma.crew as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};
const mockIntent = prisma.intent as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
};
const mockVenue = prisma.venue as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockHeatmapContribution = prisma.heatmapContribution as unknown as {
  create: ReturnType<typeof vi.fn>;
};
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const USER_A = 'user-aaa';
const USER_B = 'user-bbb';
const USER_C = 'user-ccc';
const SUBCREW_ID = 'sc-1';
const INTENT_ID = 'cln1abcd0000abcdefghijkl'; // valid CUID-ish

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate limit pass-through after reset.
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  mockBuildInterestContribution.mockReturnValue({
    userId: 'mock',
    contributionType: 'INTEREST',
  } as unknown as ReturnType<typeof buildInterestContributionData>);
  // Default $transaction implementation: pass-through array of writes.
  mockTransaction.mockImplementation(async (writes: unknown) => {
    if (Array.isArray(writes)) {
      return Promise.all(writes.map((w) => Promise.resolve(w)));
    }
    return writes;
  });
});

// ---------------------------------------------------------------------------
// GET /api/subcrews/mine
// ---------------------------------------------------------------------------
describe('GET /api/subcrews/mine', () => {
  const makeReq = (search = '') =>
    new NextRequest(`http://localhost/api/subcrews/mine${search}`);

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await mineGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 400 when limit exceeds max', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await mineGET(makeReq('?limit=999'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty list when caller has no subcrews', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrew.findMany.mockResolvedValueOnce([]);
    const res = await mineGET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.subCrews).toEqual([]);
  });

  it('returns 200 with subcrews list (default excludes expired)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const stub = [{ id: SUBCREW_ID, members: [], topic: { id: 't', slug: 's', displayName: 'D' } }];
    mockSubCrew.findMany.mockResolvedValueOnce(stub);
    const res = await mineGET(makeReq());
    expect(res.status).toBe(200);
    const callArgs = mockSubCrew.findMany.mock.calls[0][0];
    // includeExpired=false should add endAt filter.
    expect(callArgs.where.endAt).toBeDefined();
    const json = await res.json();
    expect(json.data.subCrews).toEqual(stub);
  });

  it('skips endAt filter when includeExpired=true', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrew.findMany.mockResolvedValueOnce([]);
    await mineGET(makeReq('?includeExpired=true'));
    const callArgs = mockSubCrew.findMany.mock.calls[0][0];
    expect(callArgs.where.endAt).toBeUndefined();
  });

  it('returns 429 on rate limit', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await mineGET(makeReq());
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subcrews/emerging
// ---------------------------------------------------------------------------
describe('GET /api/subcrews/emerging', () => {
  const makeReq = (search = '') =>
    new NextRequest(`http://localhost/api/subcrews/emerging${search}`);

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await emergingGET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 400 when limit invalid', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await emergingGET(makeReq('?limit=0'));
    expect(res.status).toBe(400);
  });

  it('returns empty list when caller has no Crew', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockCrew.findMany.mockResolvedValueOnce([]);
    const res = await emergingGET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.subCrews).toEqual([]);
  });

  it('returns subcrews where Crew partner is a member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: USER_A, userBId: USER_B },
    ]);
    const stub = [{ id: SUBCREW_ID, members: [{ userId: USER_B }] }];
    mockSubCrew.findMany.mockResolvedValueOnce(stub);
    const res = await emergingGET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.subCrews).toEqual(stub);
  });

  it('resolves crew partner id correctly when caller is userBId', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: USER_A, userBId: USER_B },
    ]);
    mockSubCrew.findMany.mockResolvedValueOnce([]);
    await emergingGET(makeReq());
    const where = mockSubCrew.findMany.mock.calls[0][0].where;
    expect(where.members.some.userId.in).toEqual([USER_A]);
    expect(where.NOT.members.some.userId).toBe(USER_B);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subcrews/[id]
// ---------------------------------------------------------------------------
describe('GET /api/subcrews/[id]', () => {
  const makeReq = () => new NextRequest(`http://localhost/api/subcrews/${SUBCREW_ID}`);

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await detailGET(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when not found', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrew.findUnique.mockResolvedValueOnce(null);
    const res = await detailGET(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(404);
  });

  it('returns 200 + viewerIsMember=true when caller is member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: SUBCREW_ID,
      members: [{ userId: USER_A }, { userId: USER_B }],
    });
    const res = await detailGET(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.viewerIsMember).toBe(true);
  });

  it('returns 200 + viewerIsMember=false when caller is Crew of a member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: SUBCREW_ID,
      members: [{ userId: USER_A }, { userId: USER_B }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    const res = await detailGET(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.viewerIsMember).toBe(false);
  });

  it('returns 404 when caller is neither member nor Crew', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: SUBCREW_ID,
      members: [{ userId: USER_A }],
    });
    mockCrew.findFirst.mockResolvedValueOnce(null);
    const res = await detailGET(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/subcrews/[id]
// ---------------------------------------------------------------------------
describe('PATCH /api/subcrews/[id]', () => {
  const makeReq = (body: unknown) =>
    new NextRequest(`http://localhost/api/subcrews/${SUBCREW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await detailPATCH(makeReq({ cityArea: 'SoHo' }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 on empty body (no fields)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await detailPATCH(makeReq({}), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON body', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const req = new NextRequest(`http://localhost/api/subcrews/${SUBCREW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await detailPATCH(req, { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when caller is not SEED member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await detailPATCH(makeReq({ cityArea: 'SoHo' }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when endAt <= startAt', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm1' });
    const res = await detailPATCH(
      makeReq({
        startAt: '2026-05-01T20:00:00+00:00',
        endAt: '2026-05-01T19:00:00+00:00',
      }),
      { params: { id: SUBCREW_ID } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 and updates when SEED member sets cityArea', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm1' });
    mockSubCrew.update.mockResolvedValueOnce({
      id: SUBCREW_ID,
      cityArea: 'SoHo',
      startAt: null,
      endAt: null,
      venueId: null,
    });
    const res = await detailPATCH(makeReq({ cityArea: 'SoHo' }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.cityArea).toBe('SoHo');
  });
});

// ---------------------------------------------------------------------------
// POST /api/subcrews/[id]/join
// ---------------------------------------------------------------------------
describe('POST /api/subcrews/[id]/join', () => {
  const makeReq = () =>
    new NextRequest(`http://localhost/api/subcrews/${SUBCREW_ID}/join`, {
      method: 'POST',
    });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await joinPOST(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when subcrew not found', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C));
    mockSubCrew.findUnique.mockResolvedValueOnce(null);
    const res = await joinPOST(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(404);
  });

  it('returns 409 when caller is already a member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: SUBCREW_ID,
      topicId: 't1',
      windowPreset: 'TONIGHT',
      members: [{ userId: USER_A }],
    });
    const res = await joinPOST(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(409);
  });

  it('returns 404 when caller has no Crew link to any member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: SUBCREW_ID,
      topicId: 't1',
      windowPreset: 'TONIGHT',
      members: [{ userId: USER_A }],
    });
    mockCrew.findFirst.mockResolvedValueOnce(null);
    const res = await joinPOST(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(404);
  });

  it('returns 201 with attached intent on happy path', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C, 'Carol'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: SUBCREW_ID,
      topicId: 't1',
      windowPreset: 'TONIGHT',
      members: [{ userId: USER_A }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce({ id: INTENT_ID });
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'mem-new',
      joinedAt: new Date('2026-05-01T00:00:00Z'),
    });
    mockNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await joinPOST(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.memberId).toBe('mem-new');
    // SubCrewMember.create called with intentId attached.
    const createArgs = mockSubCrewMember.create.mock.calls[0][0];
    expect(createArgs.data.intentId).toBe(INTENT_ID);
    expect(createArgs.data.joinMode).toBe('JOINED_VIA_IM_IN');
  });

  it('returns 201 even when no matching Intent exists (intentId=null)', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_C));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: SUBCREW_ID,
      topicId: 't1',
      windowPreset: 'TONIGHT',
      members: [{ userId: USER_A }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce(null);
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'mem-new',
      joinedAt: new Date(),
    });
    mockNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await joinPOST(makeReq(), { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(201);
    const createArgs = mockSubCrewMember.create.mock.calls[0][0];
    expect(createArgs.data.intentId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/subcrews/[id]/commit
// ---------------------------------------------------------------------------
describe('POST /api/subcrews/[id]/commit', () => {
  const makeReq = (body: unknown) =>
    new NextRequest(`http://localhost/api/subcrews/${SUBCREW_ID}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing intentId', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await commitPOST(makeReq({}), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const req = new NextRequest(
      `http://localhost/api/subcrews/${SUBCREW_ID}/commit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      },
    );
    const res = await commitPOST(req, { params: { id: SUBCREW_ID } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when caller is not a member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when member already committed', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'mem-1',
      committedAt: new Date(),
    });
    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(409);
  });

  it('returns 404 when intent not found', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'mem-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(null);
    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when intent belongs to a different user', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'mem-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce({
      id: INTENT_ID,
      userId: USER_B,
      state: 'INTERESTED',
    });
    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when intent is not in INTERESTED state', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'mem-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce({
      id: INTENT_ID,
      userId: USER_A,
      state: 'COMMITTED',
    });
    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(409);
  });

  it('returns 200 with contributionId on happy path with venue', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'mem-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce({
      id: INTENT_ID,
      userId: USER_A,
      state: 'INTERESTED',
      expiresAt: new Date(Date.now() + 86400000),
      topicId: 't1',
      windowPreset: 'TONIGHT',
      cityArea: 'SoHo',
      venueId: 'venue-1',
    });
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: 40.7, longitude: -74.0 });
    // $transaction: returns array of three resolved writes.
    mockTransaction.mockResolvedValueOnce([
      { id: INTENT_ID, state: 'COMMITTED' },
      { id: 'mem-1', committedAt: new Date() },
      { id: 'contrib-1' },
    ]);

    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.heatmapContributionId).toBe('contrib-1');
    expect(json.data.intentId).toBe(INTENT_ID);
  });

  it('returns 200 with null contributionId when builder returns null', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'mem-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce({
      id: INTENT_ID,
      userId: USER_A,
      state: 'INTERESTED',
      expiresAt: new Date(Date.now() + 86400000),
      topicId: 't1',
      windowPreset: 'TONIGHT',
      cityArea: null,
      venueId: null,
    });
    mockBuildInterestContribution.mockReturnValueOnce(
      null as unknown as ReturnType<typeof buildInterestContributionData>,
    );
    mockTransaction.mockResolvedValueOnce([
      { id: INTENT_ID, state: 'COMMITTED' },
      { id: 'mem-1', committedAt: new Date() },
    ]);

    const res = await commitPOST(makeReq({ intentId: INTENT_ID }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.heatmapContributionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/subcrews/[id]/members/me
// ---------------------------------------------------------------------------
describe('PATCH /api/subcrews/[id]/members/me', () => {
  const makeReq = (body: unknown) =>
    new NextRequest(
      `http://localhost/api/subcrews/${SUBCREW_ID}/members/me`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await memberMePATCH(
      makeReq({ proposedTime: '2026-05-01T20:00:00+00:00' }),
      { params: { id: SUBCREW_ID } },
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid datetime', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await memberMePATCH(makeReq({ proposedTime: 'not-a-date' }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing proposedTime field', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    // proposedTime is required (nullable but not optional).
    const res = await memberMePATCH(makeReq({}), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when caller is not a member', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await memberMePATCH(
      makeReq({ proposedTime: '2026-05-01T20:00:00+00:00' }),
      { params: { id: SUBCREW_ID } },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and updates proposedTime', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'mem-1' });
    const proposed = new Date('2026-05-01T20:00:00Z');
    mockSubCrewMember.update.mockResolvedValueOnce({
      id: 'mem-1',
      proposedTime: proposed,
    });
    const res = await memberMePATCH(
      makeReq({ proposedTime: '2026-05-01T20:00:00+00:00' }),
      { params: { id: SUBCREW_ID } },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe('mem-1');
  });

  it('accepts null proposedTime to clear', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'mem-1' });
    mockSubCrewMember.update.mockResolvedValueOnce({
      id: 'mem-1',
      proposedTime: null,
    });
    const res = await memberMePATCH(makeReq({ proposedTime: null }), {
      params: { id: SUBCREW_ID },
    });
    expect(res.status).toBe(200);
    const updateArgs = mockSubCrewMember.update.mock.calls[0][0];
    expect(updateArgs.data.proposedTime).toBeNull();
  });
});
