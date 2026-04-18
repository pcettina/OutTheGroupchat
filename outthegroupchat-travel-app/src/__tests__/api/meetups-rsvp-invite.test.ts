/**
 * Unit tests for meetup RSVP and Invite routes (Phase 4).
 *
 * Routes covered:
 *   POST /api/meetups/[id]/rsvp   — RSVP to a meetup
 *   POST /api/meetups/[id]/invite — Invite users to a meetup (host only)
 *
 * Prisma, NextAuth, sentry mocks are defined in src/__tests__/setup.ts.
 * Rate-limit is mocked locally to ensure a clean pass-through default.
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

import { POST as rsvpPOST } from '@/app/api/meetups/[id]/rsvp/route';
import { POST as invitePOST } from '@/app/api/meetups/[id]/invite/route';
import { checkRateLimit } from '@/lib/rate-limit';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

const mockPrismaMeetup = prisma.meetup as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockPrismaMeetupAttendee = prisma.meetupAttendee as unknown as {
  count: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};
const mockPrismaMeetupInvite = prisma.meetupInvite as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn> | undefined;
};
// meetupInvite.createMany is not in setup.ts, so we stub it on the mock object directly.
const meetupInviteCreateMany = vi.fn();
(prisma.meetupInvite as unknown as Record<string, unknown>)['createMany'] = meetupInviteCreateMany;
const mockPrismaNotification = prisma.notification as unknown as {
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// CUIDs must be 25 chars and match /^c[a-z0-9]{24}$/ for Zod cuid() validation.
// ---------------------------------------------------------------------------
const HOST_ID = 'cluserhost00000000000001a';
const USER_ID = 'cluseruser00000000000002b';
const USER_C = 'cluseruser00000000000003c';
const MEETUP_ID = 'clmeetup00000000000001234';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const baseMeetup = {
  id: MEETUP_ID,
  title: 'Weekend Hike',
  hostId: HOST_ID,
  capacity: null as number | null,
  cancelled: false,
};

const makeRsvpReq = (meetupId: string, body: unknown) =>
  new NextRequest(`http://localhost/api/meetups/${meetupId}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const makeInviteReq = (meetupId: string, body: unknown) =>
  new NextRequest(`http://localhost/api/meetups/${meetupId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const rsvpParams = { params: { id: MEETUP_ID } };
const inviteParams = { params: { id: MEETUP_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  // Re-attach the createMany stub after clearAllMocks resets its call history.
  // (The function reference stays on the mock object, clearAllMocks only wipes call state.)
  meetupInviteCreateMany.mockResolvedValue({ count: 0 });
});

// ===========================================================================
// POST /api/meetups/[id]/rsvp
// ===========================================================================
describe('POST /api/meetups/[id]/rsvp', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is missing status', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, {}), rsvpParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when status is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    const res = await rsvpPOST(
      makeRsvpReq(MEETUP_ID, { status: 'INTERESTED' }),
      rsvpParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 404 when meetup not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Meetup not found');
  });

  it('returns 400 when meetup is cancelled', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce({ ...baseMeetup, cancelled: true });
    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Meetup is cancelled');
  });

  it('returns 200 and upserts attendee for GOING, sends notification to host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    // capacity is null so no count check
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: USER_ID,
      status: 'GOING',
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('RSVP updated');
    expect(body.attendee.status).toBe('GOING');

    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrismaMeetupAttendee.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create).toMatchObject({ meetupId: MEETUP_ID, userId: USER_ID, status: 'GOING' });
    expect(upsertCall?.update).toMatchObject({ status: 'GOING' });

    // Notification sent to host because caller != host
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    const notifCall = mockPrismaNotification.create.mock.calls[0]?.[0];
    expect(notifCall?.data?.userId).toBe(HOST_ID);
    expect(notifCall?.data?.type).toBe('MEETUP_RSVP');
  });

  it('returns 200 and upserts attendee for MAYBE', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: USER_ID,
      status: 'MAYBE',
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'MAYBE' }), rsvpParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attendee.status).toBe('MAYBE');
    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 200 and upserts attendee for DECLINED', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: USER_ID,
      status: 'DECLINED',
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'DECLINED' }), rsvpParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attendee.status).toBe('DECLINED');
    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when meetup is at capacity and status=GOING', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce({ ...baseMeetup, capacity: 5 });
    // goingCount >= capacity
    mockPrismaMeetupAttendee.count.mockResolvedValueOnce(5);

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Meetup is at capacity');
  });

  it('does not send notification when host RSVPs their own meetup', async () => {
    // Caller is the host
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: HOST_ID,
      status: 'GOING',
    });

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(200);
    // No notification should be created when the host is the one RSVPing
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/meetups/[id]/invite
// ===========================================================================
describe('POST /api/meetups/[id]/invite', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await invitePOST(
      makeInviteReq(MEETUP_ID, { userIds: [USER_ID] }),
      inviteParams
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when userIds is empty array', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const res = await invitePOST(
      makeInviteReq(MEETUP_ID, { userIds: [] }),
      inviteParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when userIds is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const res = await invitePOST(makeInviteReq(MEETUP_ID, {}), inviteParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 404 when meetup not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await invitePOST(
      makeInviteReq(MEETUP_ID, { userIds: [USER_ID] }),
      inviteParams
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Meetup not found');
  });

  it('returns 403 when caller is not the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    const res = await invitePOST(
      makeInviteReq(MEETUP_ID, { userIds: [USER_C] }),
      inviteParams
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Only the host can invite members');
  });

  it('returns 201 and creates invites + notifications for all new userIds', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([]); // no existing invites
    meetupInviteCreateMany.mockResolvedValueOnce({ count: 2 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await invitePOST(
      makeInviteReq(MEETUP_ID, { userIds: [USER_ID, USER_C] }),
      inviteParams
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(2);
    expect(body.skipped).toBe(0);

    expect(meetupInviteCreateMany).toHaveBeenCalledTimes(1);
    const createManyCall = meetupInviteCreateMany.mock.calls[0]?.[0];
    expect(createManyCall?.data).toHaveLength(2);
    expect(createManyCall?.data[0]).toMatchObject({
      meetupId: MEETUP_ID,
      invitedBy: HOST_ID,
      status: 'PENDING',
    });

    expect(mockPrismaNotification.createMany).toHaveBeenCalledTimes(1);
    const notifCall = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    expect(notifCall?.data).toHaveLength(2);
    expect(notifCall?.data[0]).toMatchObject({
      type: 'MEETUP_INVITED',
      data: { meetupId: MEETUP_ID, invitedBy: HOST_ID },
    });
  });

  it('returns 201 and skips already-invited userIds', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    // USER_ID is already invited
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([{ userId: USER_ID }]);
    // Only USER_C is new
    meetupInviteCreateMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await invitePOST(
      makeInviteReq(MEETUP_ID, { userIds: [USER_ID, USER_C] }),
      inviteParams
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(1);
    expect(body.skipped).toBe(1);

    const createManyCall = meetupInviteCreateMany.mock.calls[0]?.[0];
    expect(createManyCall?.data).toHaveLength(1);
    expect(createManyCall?.data[0].userId).toBe(USER_C);
  });

  it('returns 201 with invited=0 when all userIds are already invited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    // Both already invited
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([
      { userId: USER_ID },
      { userId: USER_C },
    ]);

    const res = await invitePOST(
      makeInviteReq(MEETUP_ID, { userIds: [USER_ID, USER_C] }),
      inviteParams
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(0);
    expect(body.skipped).toBe(2);

    // createMany should NOT be called when there are no new userIds
    expect(meetupInviteCreateMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });
});
