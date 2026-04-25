/**
 * Unit tests for V1 Phase 3 — coordinate + commit routes.
 *
 *   PATCH  /api/subcrews/[id]              — seed-only freeze of startAt/endAt/venue
 *   PATCH  /api/subcrews/[id]/members/me   — propose a time
 *   POST   /api/subcrews/[id]/commit       — INTERESTED→COMMITTED + privacy + contribution
 *
 * Privacy picker has 3-axis tests via the commit route — every axis is asserted
 * to flow through to the HeatmapContribution write.
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

import { PATCH as PATCH_SUBCREW } from '@/app/api/subcrews/[id]/route';
import { PATCH as PATCH_MEMBER_ME } from '@/app/api/subcrews/[id]/members/me/route';
import { POST as POST_COMMIT } from '@/app/api/subcrews/[id]/commit/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockSubCrew = prisma.subCrew as unknown as { update: MockFn };
const mockSubCrewMember = prisma.subCrewMember as unknown as {
  findFirst: MockFn;
  update: MockFn;
};
const mockIntent = prisma.intent as unknown as {
  findUnique: MockFn;
  update: MockFn;
};
const mockVenue = prisma.venue as unknown as { findUnique: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { create: MockFn };
const mockTransaction = prisma.$transaction as unknown as MockFn;
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const params = { params: { id: 'sc-1' } };

const makeJsonReq = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/subcrews/sc-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// PATCH /api/subcrews/[id]
// ===========================================================================
describe('PATCH /api/subcrews/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH_SUBCREW(makeJsonReq('PATCH', { startAt: '2026-04-25T20:00:00Z' }), params);
    expect(res.status).toBe(401);
  });

  it('400 on empty body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH_SUBCREW(makeJsonReq('PATCH', {}), params);
    expect(res.status).toBe(400);
  });

  it('404 when caller is not a SEED member (no leak)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await PATCH_SUBCREW(
      makeJsonReq('PATCH', { startAt: '2026-04-25T20:00:00Z' }),
      params,
    );
    expect(res.status).toBe(404);
  });

  it('400 when endAt <= startAt', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-seed' });
    const res = await PATCH_SUBCREW(
      makeJsonReq('PATCH', {
        startAt: '2026-04-25T22:00:00Z',
        endAt: '2026-04-25T20:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('200 freezes startAt + endAt for the SEED', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-seed' });
    mockSubCrew.update.mockResolvedValueOnce({
      id: 'sc-1',
      startAt: new Date('2026-04-25T20:00:00Z'),
      endAt: new Date('2026-04-25T23:00:00Z'),
      venueId: null,
      cityArea: null,
    });

    const res = await PATCH_SUBCREW(
      makeJsonReq('PATCH', {
        startAt: '2026-04-25T20:00:00Z',
        endAt: '2026-04-25T23:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(200);
    const updateCall = mockSubCrew.update.mock.calls[0][0];
    expect(updateCall.data.startAt).toBeInstanceOf(Date);
    expect(updateCall.data.endAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// PATCH /api/subcrews/[id]/members/me
// ===========================================================================
describe('PATCH /api/subcrews/[id]/members/me', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00Z' }),
      params,
    );
    expect(res.status).toBe(401);
  });

  it('404 when caller is not a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00Z' }),
      params,
    );
    expect(res.status).toBe(404);
  });

  it('200 sets proposedTime', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockSubCrewMember.update.mockResolvedValueOnce({
      id: 'm-1',
      proposedTime: new Date('2026-04-25T20:00:00Z'),
    });

    const res = await PATCH_MEMBER_ME(
      makeJsonReq('PATCH', { proposedTime: '2026-04-25T20:00:00Z' }),
      params,
    );
    expect(res.status).toBe(200);
    expect(mockSubCrewMember.update.mock.calls[0][0].data.proposedTime).toBeInstanceOf(Date);
  });

  it('200 clears proposedTime when null is sent', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1' });
    mockSubCrewMember.update.mockResolvedValueOnce({ id: 'm-1', proposedTime: null });

    const res = await PATCH_MEMBER_ME(makeJsonReq('PATCH', { proposedTime: null }), params);
    expect(res.status).toBe(200);
    expect(mockSubCrewMember.update.mock.calls[0][0].data.proposedTime).toBeNull();
  });
});

// ===========================================================================
// POST /api/subcrews/[id]/commit  (3-axis privacy picker)
// ===========================================================================
describe('POST /api/subcrews/[id]/commit', () => {
  const liveIntent = {
    id: 'intent-1',
    userId: 'user-1',
    state: 'INTERESTED',
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    topicId: 'topic-drinks',
    windowPreset: 'EVENING',
    venueId: 'venue-1',
  };

  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'intent-1' }),
      params,
    );
    expect(res.status).toBe(401);
  });

  it('404 when caller is not a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);
    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'cliab1234567890abcdefghi' }),
      params,
    );
    expect(res.status).toBe(404);
  });

  it('409 when caller already committed', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({
      id: 'm-1',
      committedAt: new Date(),
    });
    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'cliab1234567890abcdefghi' }),
      params,
    );
    expect(res.status).toBe(409);
  });

  it('404 when Intent does not belong to caller', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce({ ...liveIntent, userId: 'user-2' });
    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'cliab1234567890abcdefghi' }),
      params,
    );
    expect(res.status).toBe(404);
  });

  it('409 when Intent is not in INTERESTED state', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce({ ...liveIntent, state: 'COMMITTED' });
    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'cliab1234567890abcdefghi' }),
      params,
    );
    expect(res.status).toBe(409);
  });

  it('200 commits, stamps committedAt, and writes a HeatmapContribution with privacy axes', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce(liveIntent);
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: 40.72319, longitude: -73.98765 });
    mockTransaction.mockImplementationOnce(async (writes: unknown[]) => {
      // Return shapes matching the 3 writes — intent.update / member.update / contribution.create
      return [{}, {}, { id: 'hc-1' }];
    });

    const res = await POST_COMMIT(
      makeJsonReq('POST', {
        intentId: 'cliab1234567890abcdefghi',
        socialScope: 'SUBGROUP_ONLY',
        granularity: 'BLOCK',
        identityMode: 'KNOWN',
      }),
      params,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.heatmapContributionId).toBe('hc-1');
    expect(body.data.committedAt).toBeDefined();

    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('200 skips HeatmapContribution when granularity = HIDDEN', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce(liveIntent);
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: 40.72319, longitude: -73.98765 });
    mockTransaction.mockImplementationOnce(async (writes: unknown[]) => {
      // Only 2 writes when contribution is skipped
      return [{}, {}];
    });

    const res = await POST_COMMIT(
      makeJsonReq('POST', {
        intentId: 'cliab1234567890abcdefghi',
        granularity: 'HIDDEN',
      }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.heatmapContributionId).toBeNull();
  });

  it('200 skips HeatmapContribution when Intent has no venueId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce({ ...liveIntent, venueId: null });
    mockTransaction.mockImplementationOnce(async (writes: unknown[]) => [{}, {}]);

    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'cliab1234567890abcdefghi' }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.heatmapContributionId).toBeNull();
    // venue.findUnique should not have been called when there's no venueId
    expect(mockVenue.findUnique).not.toHaveBeenCalled();
  });

  it('default privacy is the safest (NOBODY / BLOCK / KNOWN)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-1', committedAt: null });
    mockIntent.findUnique.mockResolvedValueOnce(liveIntent);
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: 40.72319, longitude: -73.98765 });
    let capturedContribution: { socialScope: string; identityMode: string; cellPrecision: string } | null = null;
    mockTransaction.mockImplementationOnce(async (writes: unknown[]) => {
      // Inspect the contribution-create write (3rd in the array) by pulling
      // its `_call` shape — not portable, so we instead reach into the route's
      // intermediate state via the heatmapContribution.create mock that the
      // route uses at construction time.
      return [{}, {}, { id: 'hc-2' }];
    });
    // The route calls prisma.heatmapContribution.create() to *construct* the
    // PrismaPromise that goes into $transaction. We can spy on that.
    mockHeatmap.create.mockImplementationOnce((args: { data: typeof capturedContribution }) => {
      capturedContribution = args.data;
      return { id: 'hc-2' };
    });

    const res = await POST_COMMIT(
      makeJsonReq('POST', { intentId: 'cliab1234567890abcdefghi' }),
      params,
    );
    expect(res.status).toBe(200);
    expect(capturedContribution).not.toBeNull();
    expect(capturedContribution!.socialScope).toBe('NOBODY');
    expect(capturedContribution!.identityMode).toBe('KNOWN');
    expect(capturedContribution!.cellPrecision).toBe('BLOCK');
  });
});
