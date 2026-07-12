/**
 * Unit tests for the SubCrew -> Meetup graduation feature (Day 3 [T1]).
 *
 * Two surfaces are covered:
 *   1. The helper `graduateSubCrewToMeetup(prisma, { subCrewId, hostId })`
 *      (src/lib/subcrews/graduate-to-meetup.ts) — creation, idempotency,
 *      attendee linkage, and the not-eligible gate.
 *   2. The PATCH /api/subcrews/[id] route, which invokes the helper after a
 *      seed freeze — authorization (only SEED members can trigger graduation)
 *      plus the route's swallow-on-error contract.
 *
 * The route/helper are NOT modified. Global mocks (prisma, next-auth, sentry,
 * logger) come from src/__tests__/setup.ts. @/lib/rate-limit is mocked locally
 * so its passthrough can be re-armed each test.
 *
 * NOTE: the global prisma mock in setup.ts does NOT expose
 *   - prisma.subCrew.updateMany   (used by the helper's guarded claim)
 *   - prisma.meetupAttendee.createMany (used to attach attendees)
 * so they are augmented locally below. See new_mocks_needed in the task report
 * — Wave 3 should add these to setup.ts so other suites can reuse them.
 *
 * The helper uses the INTERACTIVE `prisma.$transaction(async (tx) => …)` form.
 * setup.ts's default $transaction mock invokes the callback with `{}` (empty),
 * which would break `tx.subCrew.findUnique`; we override it per-test to invoke
 * the callback with the full prisma mock so tx === prisma.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { MeetupVisibility } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
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

import { graduateSubCrewToMeetup } from '@/lib/subcrews/graduate-to-meetup';
import { PATCH } from '@/app/api/subcrews/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Augment prisma methods that are absent from setup.ts (do NOT edit setup.ts).
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;
const anyPrisma = prisma as unknown as {
  subCrew: Record<string, MockFn>;
  meetupAttendee: Record<string, MockFn>;
};
anyPrisma.subCrew.updateMany = vi.fn();
anyPrisma.meetupAttendee.createMany = vi.fn();

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockSubCrew = prisma.subCrew as unknown as {
  findUnique: MockFn;
  update: MockFn;
  updateMany: MockFn;
};
const mockMeetup = prisma.meetup as unknown as {
  create: MockFn;
  findUnique: MockFn;
};
const mockMeetupAttendee = prisma.meetupAttendee as unknown as {
  createMany: MockFn;
};
const mockSubCrewMember = prisma.subCrewMember as unknown as {
  findFirst: MockFn;
};
const mockTransaction = prisma.$transaction as unknown as MockFn;
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const asPrisma = prisma as unknown as PrismaClient;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };

// A valid CUID (matches z.string().cuid() in the PATCH schema).
const VALID_VENUE_ID = 'cltestvenue00000000000abc';

const SUBCREW_ID = 'sc-1';
const HOST_ID = 'user-seed';
const MEMBER_B = 'user-bbb';

const START_AT = new Date('2026-08-01T20:00:00.000Z');
const END_AT = new Date('2026-08-01T23:00:00.000Z');
const CREATED_AT = new Date('2026-07-11T00:00:00.000Z');

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

/** A SubCrew row as read inside the graduation transaction. */
const eligibleSubCrew = (over: Record<string, unknown> = {}) => ({
  meetupId: null,
  startAt: START_AT,
  endAt: END_AT,
  venueId: VALID_VENUE_ID,
  topic: { displayName: 'Hiking' },
  members: [{ userId: HOST_ID }, { userId: MEMBER_B }],
  ...over,
});

/** A Meetup row as returned by meetup.create (graduatedMeetupSelect shape). */
const graduatedMeetup = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  title: 'Hiking meetup',
  hostId: HOST_ID,
  venueId: VALID_VENUE_ID,
  scheduledAt: START_AT,
  endsAt: END_AT,
  visibility: MeetupVisibility.CREW,
  createdAt: CREATED_AT,
  ...over,
});

const makePatchReq = (body: unknown) =>
  new NextRequest(`http://localhost/api/subcrews/${SUBCREW_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const params = { params: { id: SUBCREW_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm rate-limit passthrough (mirrors the sibling suites' gotcha).
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  // Interactive $transaction: invoke the callback with the full prisma mock so
  // tx.subCrew / tx.meetup / tx.meetupAttendee resolve to the mocked methods.
  mockTransaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? (cb as (tx: unknown) => unknown)(prisma)
      : Promise.resolve(cb),
  );
});

// ===========================================================================
// Helper: graduateSubCrewToMeetup
// ===========================================================================
describe('graduateSubCrewToMeetup', () => {
  // -------------------------------------------------------------------------
  // 1. Creation — both startAt + venueId set => exactly one Meetup, mapped.
  // -------------------------------------------------------------------------
  it('creates exactly one Meetup mapping startAt/endAt/visibility (status created)', async () => {
    mockSubCrew.findUnique.mockResolvedValueOnce(eligibleSubCrew());
    mockMeetup.create.mockResolvedValueOnce(graduatedMeetup());
    mockSubCrew.updateMany.mockResolvedValueOnce({ count: 1 });
    mockMeetupAttendee.createMany.mockResolvedValueOnce({ count: 2 });

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('unreachable');
    expect(result.memberCount).toBe(2);
    expect(result.meetup.id).toBe('m1');

    // Exactly one create, with correctly mapped fields.
    expect(mockMeetup.create).toHaveBeenCalledTimes(1);
    const createArg = mockMeetup.create.mock.calls[0][0];
    expect(createArg.data.scheduledAt).toBe(START_AT);
    expect(createArg.data.endsAt).toBe(END_AT);
    expect(createArg.data.visibility).toBe(MeetupVisibility.CREW);
    expect(createArg.data.hostId).toBe(HOST_ID);
    expect(createArg.data.venueId).toBe(VALID_VENUE_ID);
    expect(createArg.data.title).toBe('Hiking meetup');

    // Guarded claim on meetupId:null.
    expect(mockSubCrew.updateMany).toHaveBeenCalledTimes(1);
    const claimArg = mockSubCrew.updateMany.mock.calls[0][0];
    expect(claimArg.where).toEqual({ id: SUBCREW_ID, meetupId: null });
    expect(claimArg.data).toEqual({ meetupId: 'm1' });
  });

  it('passes endsAt undefined when SubCrew has no endAt', async () => {
    mockSubCrew.findUnique.mockResolvedValueOnce(
      eligibleSubCrew({ endAt: null, members: [{ userId: HOST_ID }] }),
    );
    mockMeetup.create.mockResolvedValueOnce(graduatedMeetup({ endsAt: null }));
    mockSubCrew.updateMany.mockResolvedValueOnce({ count: 1 });
    mockMeetupAttendee.createMany.mockResolvedValueOnce({ count: 1 });

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('created');
    const createArg = mockMeetup.create.mock.calls[0][0];
    expect(createArg.data.endsAt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 3. Attendee linkage — every SubCrewMember becomes a MeetupAttendee.
  // -------------------------------------------------------------------------
  it('attaches every SubCrewMember as an attendee (skipDuplicates true)', async () => {
    const members = [
      { userId: HOST_ID },
      { userId: MEMBER_B },
      { userId: 'user-ccc' },
    ];
    mockSubCrew.findUnique.mockResolvedValueOnce(eligibleSubCrew({ members }));
    mockMeetup.create.mockResolvedValueOnce(graduatedMeetup());
    mockSubCrew.updateMany.mockResolvedValueOnce({ count: 1 });
    mockMeetupAttendee.createMany.mockResolvedValueOnce({ count: 3 });

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('unreachable');
    expect(result.memberCount).toBe(3);

    expect(mockMeetupAttendee.createMany).toHaveBeenCalledTimes(1);
    const createManyArg = mockMeetupAttendee.createMany.mock.calls[0][0];
    expect(createManyArg.skipDuplicates).toBe(true);
    expect(createManyArg.data).toEqual([
      { meetupId: 'm1', userId: HOST_ID },
      { meetupId: 'm1', userId: MEMBER_B },
      { meetupId: 'm1', userId: 'user-ccc' },
    ]);
  });

  it('does not call attendee.createMany when the SubCrew has no members', async () => {
    mockSubCrew.findUnique.mockResolvedValueOnce(
      eligibleSubCrew({ members: [] }),
    );
    mockMeetup.create.mockResolvedValueOnce(graduatedMeetup());
    mockSubCrew.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('unreachable');
    expect(result.memberCount).toBe(0);
    expect(mockMeetupAttendee.createMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Idempotency — meetupId already set => already_graduated, no re-create.
  // -------------------------------------------------------------------------
  it('returns already_graduated without a second create when meetupId is set', async () => {
    mockSubCrew.findUnique.mockResolvedValueOnce(
      eligibleSubCrew({ meetupId: 'm-existing' }),
    );
    mockMeetup.findUnique.mockResolvedValueOnce(
      graduatedMeetup({ id: 'm-existing' }),
    );

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('already_graduated');
    if (result.status !== 'already_graduated') throw new Error('unreachable');
    expect(result.meetup.id).toBe('m-existing');
    expect(result.memberCount).toBe(2);

    // The critical idempotency guarantee: no double-create, no re-claim.
    expect(mockMeetup.create).not.toHaveBeenCalled();
    expect(mockSubCrew.updateMany).not.toHaveBeenCalled();
    expect(mockMeetupAttendee.createMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Not eligible — missing venueId OR startAt (or missing SubCrew).
  // -------------------------------------------------------------------------
  it('returns not_eligible and does not create when venueId is missing', async () => {
    mockSubCrew.findUnique.mockResolvedValueOnce(
      eligibleSubCrew({ venueId: null }),
    );

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('not_eligible');
    expect(mockMeetup.create).not.toHaveBeenCalled();
    expect(mockSubCrew.updateMany).not.toHaveBeenCalled();
  });

  it('returns not_eligible and does not create when startAt is missing', async () => {
    mockSubCrew.findUnique.mockResolvedValueOnce(
      eligibleSubCrew({ startAt: null }),
    );

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('not_eligible');
    expect(mockMeetup.create).not.toHaveBeenCalled();
  });

  it('returns not_eligible when the SubCrew does not exist', async () => {
    mockSubCrew.findUnique.mockResolvedValueOnce(null);

    const result = await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    expect(result.status).toBe('not_eligible');
    expect(mockMeetup.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Title clamp — column is 100 chars.
  // -------------------------------------------------------------------------
  it('clamps the Meetup title to 100 characters', async () => {
    const longName = 'x'.repeat(120);
    mockSubCrew.findUnique.mockResolvedValueOnce(
      eligibleSubCrew({
        topic: { displayName: longName },
        members: [{ userId: HOST_ID }],
      }),
    );
    mockMeetup.create.mockResolvedValueOnce(graduatedMeetup());
    mockSubCrew.updateMany.mockResolvedValueOnce({ count: 1 });
    mockMeetupAttendee.createMany.mockResolvedValueOnce({ count: 1 });

    await graduateSubCrewToMeetup(asPrisma, {
      subCrewId: SUBCREW_ID,
      hostId: HOST_ID,
    });

    const createArg = mockMeetup.create.mock.calls[0][0];
    expect(createArg.data.title.length).toBe(100);
  });
});

// ===========================================================================
// Route authz + integration: PATCH /api/subcrews/[id] graduation
// ===========================================================================
describe('PATCH /api/subcrews/[id] (graduation authz + integration)', () => {
  // -------------------------------------------------------------------------
  // 5. Authz — unauthenticated caller cannot trigger graduation.
  // -------------------------------------------------------------------------
  it('401 when unauthenticated — graduation never runs', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchReq({ startAt: START_AT.toISOString(), venueId: VALID_VENUE_ID }),
      params,
    );

    expect(res.status).toBe(401);
    expect(mockMeetup.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Authz — non-SEED member cannot trigger graduation (404, no leak).
  // -------------------------------------------------------------------------
  it('404 when caller is not a SEED member — graduation never runs', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-outsider'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchReq({ startAt: START_AT.toISOString(), venueId: VALID_VENUE_ID }),
      params,
    );

    expect(res.status).toBe(404);
    expect(mockMeetup.create).not.toHaveBeenCalled();
    expect(mockSubCrew.update).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 1 + 5. Happy path — SEED freeze of both time + venue graduates.
  // -------------------------------------------------------------------------
  it('200 graduated:true with a Meetup when a SEED member freezes time + venue', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-seed' });
    mockSubCrew.update.mockResolvedValueOnce({
      id: SUBCREW_ID,
      startAt: START_AT,
      endAt: END_AT,
      venueId: VALID_VENUE_ID,
      cityArea: null,
      meetupId: null,
    });
    // Graduation transaction reads + writes.
    mockSubCrew.findUnique.mockResolvedValueOnce(eligibleSubCrew());
    mockMeetup.create.mockResolvedValueOnce(graduatedMeetup());
    mockSubCrew.updateMany.mockResolvedValueOnce({ count: 1 });
    mockMeetupAttendee.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await PATCH(
      makePatchReq({
        startAt: START_AT.toISOString(),
        endAt: END_AT.toISOString(),
        venueId: VALID_VENUE_ID,
      }),
      params,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.graduated).toBe(true);
    expect(body.meetup).not.toBeNull();
    expect(body.meetup.id).toBe('m1');

    // Host is the caller; every member is attached.
    const createArg = mockMeetup.create.mock.calls[0][0];
    expect(createArg.data.hostId).toBe(HOST_ID);
    expect(mockMeetupAttendee.createMany).toHaveBeenCalledTimes(1);
    expect(mockMeetupAttendee.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Swallow contract — graduation failure must not fail the freeze.
  // -------------------------------------------------------------------------
  it('200 graduated:false meetup:null when graduation throws (error swallowed)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'm-seed' });
    mockSubCrew.update.mockResolvedValueOnce({
      id: SUBCREW_ID,
      startAt: START_AT,
      endAt: END_AT,
      venueId: VALID_VENUE_ID,
      cityArea: null,
      meetupId: null,
    });
    // Graduation blows up inside the transaction (non-concurrent error).
    mockSubCrew.findUnique.mockRejectedValueOnce(new Error('db down'));

    const res = await PATCH(
      makePatchReq({
        startAt: START_AT.toISOString(),
        venueId: VALID_VENUE_ID,
      }),
      params,
    );

    // The freeze still succeeds; graduation is best-effort.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.graduated).toBe(false);
    expect(body.meetup).toBeNull();
    expect(mockMeetup.create).not.toHaveBeenCalled();
  });
});
