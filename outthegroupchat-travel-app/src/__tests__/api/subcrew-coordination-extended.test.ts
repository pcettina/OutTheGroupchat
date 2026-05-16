/**
 * Extended edge-case tests for V1 Phase 3 SubCrew coordination flow.
 *
 *   POST   /api/subcrews/[id]/commit       — commit + privacy + contribution
 *   PATCH  /api/subcrews/[id]/members/me   — propose / clear time
 *   POST   /api/subcrews/[id]/join         — "I'm in"
 *
 * Focuses on areas not already covered in subcrew-coordination.test.ts and
 * subcrews.test.ts: validation rejects, auth gates, race/idempotency, and
 * Prisma transaction failures.
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

import { POST as POST_COMMIT } from '@/app/api/subcrews/[id]/commit/route';
import { PATCH as PATCH_MEMBER_ME } from '@/app/api/subcrews/[id]/members/me/route';
import { POST as POST_JOIN } from '@/app/api/subcrews/[id]/join/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockSubCrew = prisma.subCrew as unknown as { findUnique: MockFn };
const mockSubCrewMember = prisma.subCrewMember as unknown as {
  findFirst: MockFn;
  update: MockFn;
  create: MockFn;
};
const mockIntent = prisma.intent as unknown as {
  findUnique: MockFn;
  findFirst: MockFn;
};
const mockVenue = prisma.venue as unknown as { findUnique: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { create: MockFn };
const mockTransaction = prisma.$transaction as unknown as MockFn;
const mockCrew = prisma.crew as unknown as { findFirst: MockFn };
const mockNotification = prisma.notification as unknown as { createMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const params = { params: { id: 'sc-1' } };

const VALID_CUID = 'cliab1234567890abcdefghi';

const makeJsonReq = (method: string, body: unknown, path = 'http://localhost/api/subcrews/sc-1') =>
  new NextRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const makePostJoinReq = () =>
  new NextRequest('http://localhost/api/subcrews/sc-1/join', { method: 'POST' });

const liveIntent = {
  id: 'intent-1',
  userId: 'user-1',
  state: 'INTERESTED',
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  topicId: 'topic-drinks',
  windowPreset: 'EVENING',
  cityArea: 'east-village',
  venueId: 'venue-1',
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// POST /api/subcrews/[id]/commit  — extended edge cases
// ===========================================================================
describe('POST /api/subcrews/[id]/commit — extended edge cases', () => {
  it('400 when intentId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    const res = await POST_COMMIT(makeJsonReq('POST', {}), params);
    expect(res.status).toBe(400);
  });

  it('400 when intentId is not a valid CUID', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: 'not-a-cuid' }), params);
    expect(res.status).toBe(400);
  });

  it('400 when socialScope is an invalid enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    const res = await POST_COMMIT(
      makeJsonReq('POST', {
        intentId: VALID_CUID,
        socialScope: 'EVERYBODY_FOREVER',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when granularity is an invalid enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    const res = await POST_COMMIT(
      makeJsonReq('POST', {
        intentId: VALID_CUID,
        granularity: 'PINPOINT_GPS',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when identityMode is an invalid enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    const res = await POST_COMMIT(
      makeJsonReq('POST', {
        intentId: VALID_CUID,
        identityMode: 'PUBLIC_NAME',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when JSON body is malformed', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    const req = new NextRequest('http://localhost/api/subcrews/sc-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    const res = await POST_COMMIT(req, params);
    expect(res.status).toBe(400);
  });

  it('429 when rate limit fails', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res.status).toBe(429);
  });

  it('404 when intent does not exist (findUnique returns null)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce(null);
    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res.status).toBe(404);
  });

  it('409 when Intent is in EXPIRED state', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce({ ...liveIntent, state: 'EXPIRED' });
    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res.status).toBe(409);
  });

  it('409 when Intent is in CANCELLED state', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce({ ...liveIntent, state: 'CANCELLED' });
    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res.status).toBe(409);
  });

  it('500 when transaction throws (Prisma failure)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce(liveIntent);
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: 40.7, longitude: -74.0 });
    mockTransaction.mockRejectedValueOnce(new Error('DB write failed'));
    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res.status).toBe(500);
  });

  it('500 when subCrewMember.findFirst throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockRejectedValueOnce(new Error('connection lost'));
    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res.status).toBe(500);
  });

  it('idempotency — second commit after first succeeds returns 409 (already committed)', async () => {
    // First call: succeeds.
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce(liveIntent);
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: 40.7, longitude: -74.0 });
    mockTransaction.mockResolvedValueOnce([{}, {}, { id: 'hc-1' }]);

    const res1 = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res1.status).toBe(200);

    // Second call: member.committedAt is now set → 409.
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'm-1',
      committedAt: new Date(),
    });
    const res2 = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res2.status).toBe(409);
  });

  it('200 cityArea-only intent (no venueId) skips venue.findUnique and skips contribution', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce({ ...liveIntent, venueId: null });
    mockTransaction.mockResolvedValueOnce([{}, {}]);

    const res = await POST_COMMIT(makeJsonReq('POST', { intentId: VALID_CUID }), params);
    expect(res.status).toBe(200);
    expect(mockVenue.findUnique).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PATCH /api/subcrews/[id]/members/me  — extended edge cases
// ===========================================================================
describe('PATCH /api/subcrews/[id]/members/me — extended edge cases', () => {
  it('400 when proposedTime is not a valid ISO datetime', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: 'next-tuesday-ish' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when proposedTime is missing the offset', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    // Schema requires {offset: true} — naked datetime without Z/offset should fail.
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00' }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('400 when body is missing proposedTime entirely', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_MEMBER_ME(makeJsonReq('PATCH', {}), params);
    expect(res.status).toBe(400);
  });

  it('400 when JSON body is malformed', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const req = new NextRequest('http://localhost/api/subcrews/sc-1/members/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken',
    });
    const res = await PATCH_MEMBER_ME(req, params);
    expect(res.status).toBe(400);
  });

  it('429 when rate limit fails', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00Z' }),
      params,
    );
    expect(res.status).toBe(429);
  });

  it('500 when subCrewMember.update throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockSubCrewMember.update.mockRejectedValueOnce(new Error('write conflict'));
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00Z' }),
      params,
    );
    expect(res.status).toBe(500);
  });

  it('200 accepts a proposedTime with positive offset (e.g. +05:30)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockSubCrewMember.update.mockResolvedValueOnce({
      id: 'm-1',
      proposedTime: new Date('2026-04-25T20:00:00+05:30'),
    });
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00+05:30' }),
      params,
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// POST /api/subcrews/[id]/join  — extended edge cases
// ===========================================================================
describe('POST /api/subcrews/[id]/join — extended edge cases', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(401);
  });

  it('429 when rate limit fails', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-X'));
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(429);
  });

  it('404 when subcrew does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-X'));
    mockSubCrew.findUnique.mockResolvedValueOnce(null);
    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(404);
  });

  it('409 when caller is already a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-X'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-X' }, { userId: 'user-A' }],
    });
    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(409);
  });

  it('404 when caller has no Crew link to any current member (no leak)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-X'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }, { userId: 'user-B' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce(null);
    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(404);
  });

  it('201 joins and notifies existing members when caller is Crew of a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-X', 'Xavier'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }, { userId: 'user-B' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce(null);
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'm-new',
      joinedAt: new Date(),
    });
    mockNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(201);
    expect(mockNotification.createMany).toHaveBeenCalledOnce();
    const notifyArgs = mockNotification.createMany.mock.calls[0][0];
    expect(notifyArgs.data).toHaveLength(2);
  });

  it('201 attaches matching live INTERESTED Intent when present', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-X', 'Xavier'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce({ id: 'intent-X' });
    mockSubCrewMember.create.mockResolvedValueOnce({
      id: 'm-new',
      joinedAt: new Date(),
    });
    mockNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(201);
    const createCall = mockSubCrewMember.create.mock.calls[0][0];
    expect(createCall.data.intentId).toBe('intent-X');
    expect(createCall.data.joinMode).toBe('JOINED_VIA_IM_IN');
  });

  it('500 when subCrewMember.create throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-X'));
    mockSubCrew.findUnique.mockResolvedValueOnce({
      id: 'sc-1',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
      members: [{ userId: 'user-A' }],
    });
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1' });
    mockIntent.findFirst.mockResolvedValueOnce(null);
    mockSubCrewMember.create.mockRejectedValueOnce(new Error('unique constraint'));
    const res = await POST_JOIN(makePostJoinReq(), params);
    expect(res.status).toBe(500);
  });
});
