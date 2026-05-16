/**
 * Unit tests for V1 SubCrew action endpoints:
 *   POST   /api/subcrews/[id]/join
 *   POST   /api/subcrews/[id]/commit
 *   PATCH  /api/subcrews/[id]/members/me
 *
 * Covers: 401 unauthenticated, 404 missing subcrew/intent, 200/201 happy
 * paths, 400 validation errors (Zod / missing body / missing id), 409
 * conflict states (already joined, already committed, intent not INTERESTED),
 * ownership / membership checks, and crew-of-member visibility gates.
 *
 * Global mocks (prisma, next-auth, sentry, logger) come from
 * src/__tests__/setup.ts. Rate-limit is mocked locally so we can re-arm
 * mockResolvedValue after vi.resetAllMocks() in beforeEach.
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

// The commit route writes a HeatmapContribution via buildInterestContributionData.
// Mock the helper so tests don't depend on the cell-anonymize / centroid pipeline.
vi.mock('@/lib/heatmap/contribution-writer', () => ({
  buildInterestContributionData: vi.fn(),
}));

import { POST as POST_JOIN } from '@/app/api/subcrews/[id]/join/route';
import { POST as POST_COMMIT } from '@/app/api/subcrews/[id]/commit/route';
import { PATCH as PATCH_MEMBER_ME } from '@/app/api/subcrews/[id]/members/me/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { buildInterestContributionData } from '@/lib/heatmap/contribution-writer';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;

const mockSubCrew = prisma.subCrew as unknown as {
  findUnique: MockFn;
};
const mockSubCrewMember = prisma.subCrewMember as unknown as {
  findFirst: MockFn;
  create: MockFn;
  update: MockFn;
};
const mockCrew = prisma.crew as unknown as { findFirst: MockFn };
const mockIntent = prisma.intent as unknown as {
  findFirst: MockFn;
  findUnique: MockFn;
  update: MockFn;
};
const mockVenue = prisma.venue as unknown as { findUnique: MockFn };
const mockNotification = prisma.notification as unknown as { createMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { create: MockFn };
const mockTransaction = (prisma as unknown as { $transaction: MockFn }).$transaction;
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockBuildInterest = vi.mocked(buildInterestContributionData);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const fakeSubCrewBasics = (over: Record<string, unknown> = {}) => ({
  id: 'sc-1',
  topicId: 'topic-drinks',
  windowPreset: 'EVENING',
  members: [{ userId: 'user-A' }, { userId: 'user-B' }],
  ...over,
});

const fakeIntent = (over: Record<string, unknown> = {}) => ({
  id: 'cli00000000000000intent1',
  userId: 'user-1',
  state: 'INTERESTED',
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  topicId: 'topic-drinks',
  windowPreset: 'EVENING',
  cityArea: 'east-village',
  venueId: null,
  ...over,
});

const makePostReq = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

const makePatchReq = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate-limit + transaction passthrough after resetAllMocks wipes
  // factory-level mockResolvedValue.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  mockTransaction.mockImplementation(async (writes: unknown) => {
    if (Array.isArray(writes)) return Promise.all(writes);
    if (typeof writes === 'function') return writes({});
    return writes;
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

  it('400 when SubCrew id missing from params', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_JOIN(makePostReq('/api/subcrews//join'), {
      params: { id: '' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/SubCrew id required/i);
  });

  it('404 when SubCrew not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrew.findUnique.mockResolvedValueOnce(null);
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(404);
  });

  it('409 when caller is already a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-A'));
    mockSubCrew.findUnique.mockResolvedValueOnce(fakeSubCrewBasics());
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Already a member/i);
  });

  it('404 when caller is not Crew of any current member (no info leak)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-D'));
    mockSubCrew.findUnique.mockResolvedValueOnce(fakeSubCrewBasics());
    mockCrew.findFirst.mockResolvedValueOnce(null);
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(404);
  });

  it('201 attaches matching INTERESTED Intent and notifies all members', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-C', 'Charlie'));
    mockSubCrew.findUnique.mockResolvedValueOnce(fakeSubCrewBasics());
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce({ id: 'intent-C' });
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'member-x',
      joinedAt: new Date(),
    });
    mockNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(201);

    const createCall = mockSubCrewMember.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      subCrewId: 'sc-1',
      userId: 'user-C',
      intentId: 'intent-C',
      joinMode: 'JOINED_VIA_IM_IN',
    });

    const notifPayload = mockNotification.createMany.mock.calls[0][0].data;
    expect(notifPayload).toHaveLength(2);
    expect(notifPayload.map((n: { userId: string }) => n.userId).sort()).toEqual([
      'user-A',
      'user-B',
    ]);
    expect(notifPayload[0].type).toBe('SUBCREW_JOINED');
  });

  it('201 with intentId=null when caller has no matching live Intent (R21 open join)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-C'));
    mockSubCrew.findUnique.mockResolvedValueOnce(fakeSubCrewBasics());
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce(null);
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'member-x',
      joinedAt: new Date(),
    });
    mockNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(201);
    expect(mockSubCrewMember.create.mock.calls[0][0].data.intentId).toBeNull();
  });

  it('500 when DB throws unexpected error', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-C'));
    mockSubCrew.findUnique.mockRejectedValueOnce(new Error('db down'));
    const res = await POST_JOIN(makePostReq('/api/subcrews/sc-1/join'), params);
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// POST /api/subcrews/[id]/commit
// ===========================================================================
describe('POST /api/subcrews/[id]/commit', () => {
  const params = { params: { id: 'sc-1' } };
  const validIntentId = 'cltestintent000000000abc';

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(401);
  });

  it('400 when JSON body is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const req = new NextRequest('http://localhost/api/subcrews/sc-1/commit', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST_COMMIT(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON body/i);
  });

  it('400 when intentId is missing (Zod validation failure)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', {}),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/i);
    expect(body.details).toBeDefined();
  });

  it('400 when intentId is not a CUID (Zod validation failure)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: 'not-a-cuid' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when socialScope is not a HeatmapSocialScope enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', {
        intentId: validIntentId,
        socialScope: 'PLANET_EARTH',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('404 when caller is not a member of the SubCrew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Not found/i);
  });

  it('409 when member has already committed', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: new Date(),
    });
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Already committed/i);
  });

  it('404 when intent does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(null);
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Intent not found/i);
  });

  it('404 when intent belongs to a different user (ownership check)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(
      fakeIntent({ userId: 'user-other' }),
    );
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(404);
  });

  it('409 when intent state is not INTERESTED', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(
      fakeIntent({ state: 'COMMITTED' }),
    );
    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not in INTERESTED state/i);
  });

  it('200 commits with venue lookup and writes heatmap contribution', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(
      fakeIntent({ venueId: 'venue-1' }),
    );
    mockVenue.findUnique.mockResolvedValueOnce({
      latitude: 40.7,
      longitude: -73.9,
    });
    mockBuildInterest.mockReturnValueOnce({
      type: 'INTEREST',
      cellGeohash: 'dr5ru',
    } as unknown as ReturnType<typeof buildInterestContributionData>);

    // $transaction returns the array of resolved write results — third entry
    // is the contribution row when buildInterestContributionData is non-null.
    mockTransaction.mockResolvedValueOnce([
      { id: validIntentId },
      { id: 'member-1' },
      { id: 'contrib-1' },
    ]);

    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.heatmapContributionId).toBe('contrib-1');
    expect(body.data.subCrewId).toBe('sc-1');
    expect(body.data.intentId).toBe(validIntentId);
    expect(body.data.memberId).toBe('member-1');

    expect(mockVenue.findUnique).toHaveBeenCalledWith({
      where: { id: 'venue-1' },
      select: { latitude: true, longitude: true },
    });
    expect(mockBuildInterest).toHaveBeenCalled();
  });

  it('200 commits without venue lookup when intent has no venueId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(
      fakeIntent({ venueId: null, cityArea: 'east-village' }),
    );
    mockBuildInterest.mockReturnValueOnce({
      type: 'INTEREST',
      cellGeohash: 'centroid',
    } as unknown as ReturnType<typeof buildInterestContributionData>);
    mockTransaction.mockResolvedValueOnce([
      { id: validIntentId },
      { id: 'member-1' },
      { id: 'contrib-2' },
    ]);

    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(200);
    expect(mockVenue.findUnique).not.toHaveBeenCalled();
  });

  it('200 with heatmapContributionId=null when builder returns null (HIDDEN)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(fakeIntent({ venueId: null }));
    mockBuildInterest.mockReturnValueOnce(null);
    mockTransaction.mockResolvedValueOnce([
      { id: validIntentId },
      { id: 'member-1' },
    ]);

    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', {
        intentId: validIntentId,
        granularity: 'HIDDEN',
      }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.heatmapContributionId).toBeNull();
  });

  it('500 when transaction throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'member-1',
      committedAt: null,
    });
    mockIntent.findUnique.mockResolvedValueOnce(fakeIntent({ venueId: null }));
    mockBuildInterest.mockReturnValueOnce(null);
    mockTransaction.mockRejectedValueOnce(new Error('tx aborted'));

    const res = await POST_COMMIT(
      makePostReq('/api/subcrews/sc-1/commit', { intentId: validIntentId }),
      params,
    );
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// PATCH /api/subcrews/[id]/members/me
// ===========================================================================
describe('PATCH /api/subcrews/[id]/members/me', () => {
  const params = { params: { id: 'sc-1' } };

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH_MEMBER_ME(
      makePatchReq('/api/subcrews/sc-1/members/me', {
        proposedTime: '2099-01-01T00:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(401);
  });

  it('400 when body is not valid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const req = new NextRequest('http://localhost/api/subcrews/sc-1/members/me', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH_MEMBER_ME(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON body/i);
  });

  it('400 when proposedTime is missing entirely (Zod requires the key)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(
      makePatchReq('/api/subcrews/sc-1/members/me', {}),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/i);
  });

  it('400 when proposedTime is not a datetime string', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(
      makePatchReq('/api/subcrews/sc-1/members/me', {
        proposedTime: 'tomorrow at 7',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('404 when caller is not a member of the SubCrew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-D'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await PATCH_MEMBER_ME(
      makePatchReq('/api/subcrews/sc-1/members/me', {
        proposedTime: '2099-01-01T00:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Not found/i);
  });

  it('200 sets proposedTime when caller is a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-A'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'member-A' });
    const futureIso = '2099-01-01T19:30:00Z';
    const future = new Date(futureIso);
    mockSubCrewMember.update.mockResolvedValueOnce({
      id: 'member-A',
      proposedTime: future,
    });

    const res = await PATCH_MEMBER_ME(
      makePatchReq('/api/subcrews/sc-1/members/me', { proposedTime: futureIso }),
      params,
    );
    expect(res.status).toBe(200);

    const updateArg = mockSubCrewMember.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'member-A' });
    expect(updateArg.data.proposedTime).toBeInstanceOf(Date);
    expect((updateArg.data.proposedTime as Date).toISOString()).toBe(
      future.toISOString(),
    );
  });

  it('200 clears proposedTime when null is sent', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-A'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'member-A' });
    mockSubCrewMember.update.mockResolvedValueOnce({
      id: 'member-A',
      proposedTime: null,
    });

    const res = await PATCH_MEMBER_ME(
      makePatchReq('/api/subcrews/sc-1/members/me', { proposedTime: null }),
      params,
    );
    expect(res.status).toBe(200);
    const updateArg = mockSubCrewMember.update.mock.calls[0][0];
    expect(updateArg.data.proposedTime).toBeNull();
  });

  it('500 when DB update throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-A'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'member-A' });
    mockSubCrewMember.update.mockRejectedValueOnce(new Error('db down'));

    const res = await PATCH_MEMBER_ME(
      makePatchReq('/api/subcrews/sc-1/members/me', {
        proposedTime: '2099-01-01T00:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(500);
  });
});
