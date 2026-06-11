/**
 * Authorization / abuse-prevention edge-case tests for the Meetups domain.
 *
 * Phase 8 launch-readiness action #3: "Crew-request abuse prevention, meetup spam."
 *
 * Routes covered:
 *   PATCH  /api/meetups/[id]         — host-only mutation
 *   DELETE /api/meetups/[id]         — host-only soft-cancel
 *   POST   /api/meetups/[id]/rsvp    — RSVP (duplicate, cancelled, capacity, auth)
 *   POST   /api/meetups/[id]/invite  — host-only invite (self-invite, duplicate, spam cap)
 *
 * This suite intentionally complements meetups-id.test.ts and
 * meetups-rsvp-invite.test.ts — it asserts the abuse/authorization edges
 * (non-host mutation, capacity ceiling, duplicate-RSVP idempotency, invite
 * fan-out cap, host-as-self-inviter, no side-effects on rejection) rather than
 * re-testing the happy paths those suites already own.
 *
 * Global prisma / next-auth / sentry / logger mocks live in
 * src/__tests__/setup.ts. Rate-limit, pusher, and email are mocked locally to
 * keep the suite isolated from real infrastructure.
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

vi.mock('@/lib/pusher', () => ({
  channels: {
    trip: (id: string) => `trip-${id}`,
    user: (id: string) => `user-${id}`,
    voting: (id: string) => `voting-${id}`,
    meetup: (id: string) => `meetup-${id}`,
  },
  events: {
    TRIP_UPDATED: 'trip:updated',
    MEMBER_JOINED: 'member:joined',
    MEMBER_LEFT: 'member:left',
    ACTIVITY_ADDED: 'activity:added',
    ACTIVITY_UPDATED: 'activity:updated',
    ITINERARY_UPDATED: 'itinerary:updated',
    SURVEY_CREATED: 'survey:created',
    SURVEY_RESPONSE: 'survey:response',
    SURVEY_CLOSED: 'survey:closed',
    VOTE_CAST: 'vote:cast',
    VOTING_CLOSED: 'voting:closed',
    VOTING_RESULTS: 'voting:results',
    NOTIFICATION: 'notification',
    INVITATION: 'invitation',
    MEETUP_UPDATED: 'meetup:updated',
    MEETUP_CANCELLED: 'meetup:cancelled',
    ATTENDEE_JOINED: 'attendee:joined',
    ATTENDEE_LEFT: 'attendee:left',
  },
  getPusherServer: vi.fn(() => null),
  getPusherClient: vi.fn(() => null),
  broadcastToTrip: vi.fn().mockResolvedValue(undefined),
  broadcastToUser: vi.fn().mockResolvedValue(undefined),
  broadcastToMeetup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email', () => ({
  sendMeetupInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendMeetupRSVPConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH, DELETE } from '@/app/api/meetups/[id]/route';
import { POST as rsvpPOST } from '@/app/api/meetups/[id]/rsvp/route';
import { POST as invitePOST } from '@/app/api/meetups/[id]/invite/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { broadcastToMeetup, broadcastToUser } from '@/lib/pusher';
import { sendMeetupInviteEmail, sendMeetupRSVPConfirmationEmail } from '@/lib/email';

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockBroadcastToMeetup = vi.mocked(broadcastToMeetup);
const mockBroadcastToUser = vi.mocked(broadcastToUser);
const mockSendInviteEmail = vi.mocked(sendMeetupInviteEmail);
const mockSendRSVPEmail = vi.mocked(sendMeetupRSVPConfirmationEmail);

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaMeetup = prisma.meetup as unknown as {
  findUnique: MockFn;
  update: MockFn;
  delete: MockFn;
};
const mockPrismaMeetupAttendee = prisma.meetupAttendee as unknown as {
  count: MockFn;
  upsert: MockFn;
};
const mockPrismaMeetupInvite = prisma.meetupInvite as unknown as {
  findMany: MockFn;
  createMany: MockFn;
};
const mockPrismaNotification = prisma.notification as unknown as {
  create: MockFn;
  createMany: MockFn;
};
const mockPrismaUser = prisma.user as unknown as { findMany: MockFn };

// ---------------------------------------------------------------------------
// Fixtures
// CUIDs must match Zod cuid() (/^c[a-z0-9]{24}$/) for the invite route's
// userIds schema. The [id] param itself is never cuid-validated, so any string
// works for meetup ids, but we keep them cuid-shaped for consistency.
// ---------------------------------------------------------------------------
const HOST_ID = 'cluserhost00000000000001a';
const OTHER_ID = 'cluserother0000000000002b';
const USER_C = 'cluseruser00000000000003c';
const MEETUP_ID = 'clmeetup00000000000001234';

const sessionFor = (id: string, name = 'Tester', email: string | null = null) => ({
  user: { id, name, email: email ?? `${id}@example.com` },
  expires: '2099-01-01',
});

/** Simple meetup row (no includes) — shape used by PATCH/DELETE findUnique. */
const buildMeetupSimple = (overrides: Record<string, unknown> = {}) => ({
  id: MEETUP_ID,
  hostId: HOST_ID,
  title: 'Test Meetup',
  description: null,
  venueName: null,
  venueId: null,
  scheduledAt: new Date('2099-01-01T18:00:00Z'),
  endsAt: null,
  visibility: 'PUBLIC',
  capacity: null,
  cancelled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/** Meetup row as selected by the RSVP route. */
const buildRsvpMeetup = (overrides: Record<string, unknown> = {}) => ({
  id: MEETUP_ID,
  title: 'Weekend Hike',
  hostId: HOST_ID,
  capacity: null as number | null,
  cancelled: false,
  scheduledAt: new Date('2099-06-01T10:00:00Z'),
  venueName: 'Trailhead Park',
  ...overrides,
});

/** Meetup row as selected by the invite route. */
const buildInviteMeetup = (overrides: Record<string, unknown> = {}) => ({
  id: MEETUP_ID,
  title: 'Weekend Hike',
  hostId: HOST_ID,
  scheduledAt: new Date('2099-06-01T10:00:00Z'),
  venueName: 'Trailhead Park',
  ...overrides,
});

const makeReq = (
  path: string,
  method: string,
  body?: unknown
): NextRequest =>
  new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}${path}`, {
    method,
    ...(body !== undefined
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });

const params = { params: { id: MEETUP_ID } };

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm factory-level mockResolvedValue defaults that clearAllMocks wiped.
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  mockBroadcastToMeetup.mockResolvedValue(undefined);
  mockBroadcastToUser.mockResolvedValue(undefined);
  mockSendInviteEmail.mockResolvedValue(undefined);
  mockSendRSVPEmail.mockResolvedValue(undefined);
});

// ===========================================================================
// PATCH /api/meetups/[id] — host-only mutation guard
// ===========================================================================
describe('PATCH /api/meetups/[id] — authorization edges', () => {
  it('returns 401 for unauthenticated mutation and never reads the meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq('', 'PATCH', { title: 'Hijack' }), params);
    expect(res.status).toBe(401);
    // Auth gate is first — DB must not be touched.
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
  });

  it('returns 403 when a non-host attempts to mutate and does not write or broadcast', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());

    const res = await PATCH(makeReq('', 'PATCH', { title: 'Stolen' }), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
    // No mutation and no real-time leak on the rejected path.
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
  });

  it('returns 404 when mutating a nonexistent meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);

    const res = await PATCH(makeReq('', 'PATCH', { title: 'Ghost' }), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Meetup not found');
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
  });

  it('returns 400 (before any auth/ownership lookup) on a malformed body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    // capacity must be a positive int — 0 is rejected by .positive().
    const res = await PATCH(makeReq('', 'PATCH', { capacity: 0 }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
    // Validation precedes the ownership lookup, so no meetup read happens.
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 when visibility is not an allowed enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const res = await PATCH(makeReq('', 'PATCH', { visibility: 'SECRET' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
  });
});

// ===========================================================================
// DELETE /api/meetups/[id] — host-only cancel guard
// ===========================================================================
describe('DELETE /api/meetups/[id] — authorization edges', () => {
  it('returns 401 for unauthenticated cancel and never reads the meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq('', 'DELETE'), params);
    expect(res.status).toBe(401);
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
  });

  it('returns 403 when a non-host attempts to cancel and performs no soft-delete', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());

    const res = await DELETE(makeReq('', 'DELETE'), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
    // The cancelled flag must not be set by a non-host.
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
  });

  it('returns 404 when cancelling a nonexistent meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeReq('', 'DELETE'), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Meetup not found');
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
  });

  it('soft-cancels (never hard-deletes) when the host cancels', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());
    mockPrismaMeetup.update.mockResolvedValueOnce(buildMeetupSimple({ cancelled: true }));

    const res = await DELETE(makeReq('', 'DELETE'), params);
    expect(res.status).toBe(200);
    const updateArg = mockPrismaMeetup.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ cancelled: true });
    // Attendance history is preserved — no destructive delete.
    expect(mockPrismaMeetup.delete).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/meetups/[id]/rsvp — RSVP abuse / idempotency edges
// ===========================================================================
describe('POST /api/meetups/[id]/rsvp — abuse-prevention edges', () => {
  it('returns 401 for an unauthenticated RSVP and never reads the meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(401);
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaMeetupAttendee.upsert).not.toHaveBeenCalled();
  });

  it('treats a duplicate RSVP as an idempotent upsert (no second attendee row)', async () => {
    // A repeated GOING RSVP must update the existing attendee, not create a new
    // one — the route relies on upsert keyed by (meetupId,userId). This guards
    // against attendee-row spam from a user hammering the RSVP button.
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildRsvpMeetup());
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: OTHER_ID,
      status: 'GOING',
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(200);
    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrismaMeetupAttendee.upsert.mock.calls[0]?.[0];
    // Idempotency key is the composite unique (meetupId, userId).
    expect(upsertCall?.where).toEqual({
      meetupId_userId: { meetupId: MEETUP_ID, userId: OTHER_ID },
    });
    expect(upsertCall?.create).toMatchObject({ status: 'GOING' });
    expect(upsertCall?.update).toMatchObject({ status: 'GOING' });
  });

  it('returns 404 when RSVPing to a nonexistent meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Meetup not found');
    expect(mockPrismaMeetupAttendee.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 and writes nothing when RSVPing to a cancelled meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildRsvpMeetup({ cancelled: true }));
    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Meetup is cancelled');
    // No attendee record and no capacity probe on the rejected path.
    expect(mockPrismaMeetupAttendee.upsert).not.toHaveBeenCalled();
    expect(mockPrismaMeetupAttendee.count).not.toHaveBeenCalled();
  });

  it('returns 409 when the meetup is exactly at capacity for a GOING RSVP', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildRsvpMeetup({ capacity: 3 }));
    mockPrismaMeetupAttendee.count.mockResolvedValueOnce(3); // goingCount === capacity
    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Meetup is at capacity');
    // Over-capacity RSVP must not create/update an attendee row.
    expect(mockPrismaMeetupAttendee.upsert).not.toHaveBeenCalled();
  });

  it('returns 409 when the going count has exceeded capacity', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildRsvpMeetup({ capacity: 3 }));
    mockPrismaMeetupAttendee.count.mockResolvedValueOnce(4); // goingCount > capacity
    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(409);
    expect(mockPrismaMeetupAttendee.upsert).not.toHaveBeenCalled();
  });

  it('does NOT enforce capacity for a MAYBE RSVP even when full', async () => {
    // Capacity only gates GOING — MAYBE/DECLINED must not be blocked or even probed.
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildRsvpMeetup({ capacity: 1 }));
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: OTHER_ID,
      status: 'MAYBE',
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'MAYBE' }), params);
    expect(res.status).toBe(200);
    // count() is only invoked on the GOING branch.
    expect(mockPrismaMeetupAttendee.count).not.toHaveBeenCalled();
    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
  });

  it('allows a GOING RSVP when capacity is set but not yet reached', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildRsvpMeetup({ capacity: 5 }));
    mockPrismaMeetupAttendee.count.mockResolvedValueOnce(4); // room for one more
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: OTHER_ID,
      status: 'GOING',
    });
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(200);
    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 400 on a malformed RSVP body without touching the database', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'YES_PLEASE' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
  });

  it('does not notify the host when the host RSVPs to their own meetup (no self-spam)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildRsvpMeetup());
    mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({
      meetupId: MEETUP_ID,
      userId: HOST_ID,
      status: 'GOING',
    });

    const res = await rsvpPOST(makeReq('/rsvp', 'POST', { status: 'GOING' }), params);
    expect(res.status).toBe(200);
    // Host RSVPing own meetup must not generate a MEETUP_RSVP notification.
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST /api/meetups/[id]/invite — invite spam / host-only edges
// ===========================================================================
describe('POST /api/meetups/[id]/invite — abuse-prevention edges', () => {
  it('returns 401 for an unauthenticated invite and never reads the meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await invitePOST(makeReq('/invite', 'POST', { userIds: [OTHER_ID] }), params);
    expect(res.status).toBe(401);
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaMeetupInvite.createMany).not.toHaveBeenCalled();
  });

  it('returns 403 when a non-host attempts to invite and creates no invites', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildInviteMeetup());

    const res = await invitePOST(makeReq('/invite', 'POST', { userIds: [USER_C] }), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Only the host can invite members');
    // A non-host must not be able to fan out invites/notifications.
    expect(mockPrismaMeetupInvite.findMany).not.toHaveBeenCalled();
    expect(mockPrismaMeetupInvite.createMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
  });

  it('returns 404 when inviting to a nonexistent meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await invitePOST(makeReq('/invite', 'POST', { userIds: [USER_C] }), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Meetup not found');
    expect(mockPrismaMeetupInvite.createMany).not.toHaveBeenCalled();
  });

  it('returns 400 when userIds exceeds the per-request fan-out cap of 20', async () => {
    // The Zod schema caps a single invite request at 20 userIds to throttle
    // mass-invite spam. 21 valid cuids must be rejected before any DB work.
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const tooMany = Array.from(
      { length: 21 },
      (_, i) => `cluser${String(i).padStart(19, '0')}`
    );
    const res = await invitePOST(makeReq('/invite', 'POST', { userIds: tooMany }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 when a userId is not a valid cuid (injection guard)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const res = await invitePOST(
      makeReq('/invite', 'POST', { userIds: ['not-a-cuid'] }),
      params
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
    expect(mockPrismaMeetup.findUnique).not.toHaveBeenCalled();
  });

  it('de-duplicates against existing invites and never re-invites the same user (no duplicate spam)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildInviteMeetup());
    // Both requested users are already invited.
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([
      { userId: OTHER_ID },
      { userId: USER_C },
    ]);

    const res = await invitePOST(
      makeReq('/invite', 'POST', { userIds: [OTHER_ID, USER_C] }),
      params
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(0);
    expect(body.skipped).toBe(2);
    // No new invite/notification/email/broadcast when everyone is a duplicate.
    expect(mockPrismaMeetupInvite.createMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
    expect(mockBroadcastToUser).not.toHaveBeenCalled();
  });

  it('host can self-invite — there is no self-exclusion, so it is treated as a normal invitee', async () => {
    // The route does not special-case the host appearing in userIds; it is a
    // plain (non-duplicate) invitee. This documents actual behavior so a future
    // change is caught.
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildInviteMeetup());
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([]); // no existing invites
    mockPrismaMeetupInvite.createMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: HOST_ID, email: 'host@example.com', name: 'Host' },
    ]);

    const res = await invitePOST(makeReq('/invite', 'POST', { userIds: [HOST_ID] }), params);
    expect(res.status).toBe(201);
    expect((await res.json()).invited).toBe(1);
    const createManyCall = mockPrismaMeetupInvite.createMany.mock.calls[0]?.[0];
    expect(createManyCall?.data[0]).toMatchObject({
      meetupId: MEETUP_ID,
      userId: HOST_ID,
      invitedBy: HOST_ID,
      status: 'PENDING',
    });
  });

  it('records invitedBy as the host on every created invite row (provenance for abuse audits)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildInviteMeetup());
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([]);
    mockPrismaMeetupInvite.createMany.mockResolvedValueOnce({ count: 2 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: OTHER_ID, email: 'other@example.com', name: 'Alice' },
      { id: USER_C, email: 'c@example.com', name: 'Charlie' },
    ]);

    const res = await invitePOST(
      makeReq('/invite', 'POST', { userIds: [OTHER_ID, USER_C] }),
      params
    );
    expect(res.status).toBe(201);
    const createManyCall = mockPrismaMeetupInvite.createMany.mock.calls[0]?.[0];
    expect(createManyCall?.data).toHaveLength(2);
    for (const row of createManyCall.data) {
      expect(row.invitedBy).toBe(HOST_ID);
      expect(row.status).toBe('PENDING');
    }
    // skipDuplicates protects the unique (meetupId,userId) index at the DB layer.
    expect(createManyCall?.skipDuplicates).toBe(true);
  });
});
