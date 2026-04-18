/**
 * Unit tests for meetup RSVP and Invite routes (Phase 4).
 *
 * Routes covered:
 *   POST /api/meetups/[id]/rsvp   — RSVP to a meetup
 *   POST /api/meetups/[id]/invite — Invite users to a meetup (host only)
 *
 * Prisma, NextAuth, sentry mocks are defined in src/__tests__/setup.ts.
 * Rate-limit, pusher, email mocks are defined locally to keep this suite isolated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null, aiRateLimiter: null, authRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
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
    TRIP_UPDATED: 'trip:updated', MEMBER_JOINED: 'member:joined', MEMBER_LEFT: 'member:left',
    ACTIVITY_ADDED: 'activity:added', ACTIVITY_UPDATED: 'activity:updated', ITINERARY_UPDATED: 'itinerary:updated',
    SURVEY_CREATED: 'survey:created', SURVEY_RESPONSE: 'survey:response', SURVEY_CLOSED: 'survey:closed',
    VOTE_CAST: 'vote:cast', VOTING_CLOSED: 'voting:closed', VOTING_RESULTS: 'voting:results',
    NOTIFICATION: 'notification', INVITATION: 'invitation',
    MEETUP_UPDATED: 'meetup:updated', MEETUP_CANCELLED: 'meetup:cancelled',
    ATTENDEE_JOINED: 'attendee:joined', ATTENDEE_LEFT: 'attendee:left',
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

import { POST as rsvpPOST } from '@/app/api/meetups/[id]/rsvp/route';
import { POST as invitePOST } from '@/app/api/meetups/[id]/invite/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { broadcastToMeetup, broadcastToUser } from '@/lib/pusher';
import { sendMeetupInviteEmail, sendMeetupRSVPConfirmationEmail } from '@/lib/email';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);
const mockBroadcastToMeetup = vi.mocked(broadcastToMeetup);
const mockBroadcastToUser = vi.mocked(broadcastToUser);
const mockSendRSVPEmail = vi.mocked(sendMeetupRSVPConfirmationEmail);
const mockSendInviteEmail = vi.mocked(sendMeetupInviteEmail);

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaMeetup = prisma.meetup as unknown as { findUnique: MockFn };
const mockPrismaMeetupAttendee = prisma.meetupAttendee as unknown as { count: MockFn; upsert: MockFn };
const mockPrismaMeetupInvite = prisma.meetupInvite as unknown as { findMany: MockFn; createMany: MockFn };
const mockPrismaNotification = prisma.notification as unknown as { create: MockFn; createMany: MockFn };
const mockPrismaUser = prisma.user as unknown as { findMany: MockFn; findUnique: MockFn };

// ---------------------------------------------------------------------------
// Fixtures
// CUIDs must be 25 chars and match /^c[a-z0-9]{24}$/ for Zod cuid() validation.
// ---------------------------------------------------------------------------
const HOST_ID = 'cluserhost00000000000001a';
const USER_ID = 'cluseruser00000000000002b';
const USER_C = 'cluseruser00000000000003c';
const MEETUP_ID = 'clmeetup00000000000001234';

const sessionFor = (id: string, name = 'Tester', email: string | null = null) => ({
  user: { id, name, email: email ?? `${id}@example.com` },
  expires: '2099-01-01',
});

const baseMeetup = {
  id: MEETUP_ID,
  title: 'Weekend Hike',
  hostId: HOST_ID,
  capacity: null as number | null,
  cancelled: false,
  scheduledAt: new Date('2099-06-01T10:00:00Z'),
  venueName: 'Trailhead Park',
};

const makeReq = (path: 'rsvp' | 'invite', meetupId: string, body: unknown) =>
  new NextRequest(`http://localhost/api/meetups/${meetupId}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const makeRsvpReq = (id: string, body: unknown) => makeReq('rsvp', id, body);
const makeInviteReq = (id: string, body: unknown) => makeReq('invite', id, body);

const rsvpParams = { params: { id: MEETUP_ID } };
const inviteParams = { params: { id: MEETUP_ID } };

// Small helper: upsert mock returns the attendee record we expect the route to echo.
const stubAttendeeUpsert = (userId: string, status: 'GOING' | 'MAYBE' | 'DECLINED') =>
  mockPrismaMeetupAttendee.upsert.mockResolvedValueOnce({ meetupId: MEETUP_ID, userId, status });

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm factory-level mockResolvedValue defaults that vi.clearAllMocks wiped.
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  mockBroadcastToMeetup.mockResolvedValue(undefined);
  mockBroadcastToUser.mockResolvedValue(undefined);
  mockSendRSVPEmail.mockResolvedValue(undefined);
  mockSendInviteEmail.mockResolvedValue(undefined);
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
    expect((await res.json()).error).toBe('Validation failed');
  });

  it('returns 400 when status is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'INTERESTED' }), rsvpParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
  });

  it('returns 404 when meetup not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Meetup not found');
  });

  it('returns 400 when meetup is cancelled', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce({ ...baseMeetup, cancelled: true });
    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Meetup is cancelled');
  });

  it('returns 200 and upserts attendee for GOING, sends notification + broadcast + email', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    stubAttendeeUpsert(USER_ID, 'GOING');
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('RSVP updated');
    expect(body.data.status).toBe('GOING');

    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockPrismaMeetupAttendee.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create).toMatchObject({ meetupId: MEETUP_ID, userId: USER_ID, status: 'GOING' });
    expect(upsertCall?.update).toMatchObject({ status: 'GOING' });

    // Notification sent to host because caller != host
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    const notifCall = mockPrismaNotification.create.mock.calls[0]?.[0];
    expect(notifCall?.data?.userId).toBe(HOST_ID);
    expect(notifCall?.data?.type).toBe('MEETUP_RSVP');

    // New: pusher broadcast on the meetup channel (attendee joined)
    expect(mockBroadcastToMeetup).toHaveBeenCalledWith(
      MEETUP_ID,
      'attendee:joined',
      expect.objectContaining({ userId: USER_ID, status: 'GOING' })
    );
    // New: pusher notification to host inbox
    expect(mockBroadcastToUser).toHaveBeenCalledWith(
      HOST_ID,
      'notification',
      expect.objectContaining({ type: 'MEETUP_RSVP', meetupId: MEETUP_ID })
    );
    // New: confirmation email sent to attendee (session has email)
    expect(mockSendRSVPEmail).toHaveBeenCalledTimes(1);
    expect(mockSendRSVPEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${USER_ID}@example.com`,
        meetupTitle: 'Weekend Hike',
        status: 'GOING',
        meetupId: MEETUP_ID,
      })
    );
  });

  it('returns 200 and upserts attendee for MAYBE', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    stubAttendeeUpsert(USER_ID, 'MAYBE');
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'MAYBE' }), rsvpParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('MAYBE');
    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
    // MAYBE does not trigger ATTENDEE_JOINED or ATTENDEE_LEFT broadcast
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
  });

  it('returns 200 and upserts attendee for DECLINED, broadcasts attendee:left', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    stubAttendeeUpsert(USER_ID, 'DECLINED');
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'DECLINED' }), rsvpParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('DECLINED');
    expect(mockPrismaMeetupAttendee.upsert).toHaveBeenCalledTimes(1);
    expect(mockBroadcastToMeetup).toHaveBeenCalledWith(
      MEETUP_ID,
      'attendee:left',
      expect.objectContaining({ userId: USER_ID })
    );
    // RSVP confirmation email is only sent for GOING
    expect(mockSendRSVPEmail).not.toHaveBeenCalled();
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
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    stubAttendeeUpsert(HOST_ID, 'GOING');

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(200);
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });

  it('does not send RSVP confirmation email when attendee has no email on session', async () => {
    // Empty-string email — route guard `if (status === 'GOING' && session.user.email)` is falsy.
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice', ''));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    stubAttendeeUpsert(USER_ID, 'GOING');
    mockPrismaNotification.create.mockResolvedValueOnce({});

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(200);
    expect(mockSendRSVPEmail).not.toHaveBeenCalled();
  });

  it('does not break the response when RSVP confirmation email throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID, 'Alice'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    stubAttendeeUpsert(USER_ID, 'GOING');
    mockPrismaNotification.create.mockResolvedValueOnce({});
    mockSendRSVPEmail.mockRejectedValueOnce(new Error('SMTP exploded'));

    const res = await rsvpPOST(makeRsvpReq(MEETUP_ID, { status: 'GOING' }), rsvpParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('GOING');
  });
});

// ===========================================================================
// POST /api/meetups/[id]/invite
// ===========================================================================
describe('POST /api/meetups/[id]/invite', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_ID] }), inviteParams);
    expect(res.status).toBe(401);
  });

  it('returns 400 when userIds is empty array', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [] }), inviteParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
  });

  it('returns 400 when userIds is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const res = await invitePOST(makeInviteReq(MEETUP_ID, {}), inviteParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
  });

  it('returns 404 when meetup not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_ID] }), inviteParams);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Meetup not found');
  });

  it('returns 403 when caller is not the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(USER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_C] }), inviteParams);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Only the host can invite members');
  });

  it('returns 201 and creates invites + notifications + emails + broadcasts for all new userIds', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([]); // no existing invites
    mockPrismaMeetupInvite.createMany.mockResolvedValueOnce({ count: 2 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: USER_ID, email: 'user@example.com', name: 'Alice' },
      { id: USER_C, email: 'userc@example.com', name: 'Charlie' },
    ]);

    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_ID, USER_C] }), inviteParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(2);
    expect(body.skipped).toBe(0);

    expect(mockPrismaMeetupInvite.createMany).toHaveBeenCalledTimes(1);
    const createManyCall = mockPrismaMeetupInvite.createMany.mock.calls[0]?.[0];
    expect(createManyCall?.data).toHaveLength(2);
    expect(createManyCall?.data[0]).toMatchObject({
      meetupId: MEETUP_ID, invitedBy: HOST_ID, status: 'PENDING',
    });

    expect(mockPrismaNotification.createMany).toHaveBeenCalledTimes(1);
    const notifCall = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    expect(notifCall?.data).toHaveLength(2);
    expect(notifCall?.data[0]).toMatchObject({
      type: 'MEETUP_INVITED', data: { meetupId: MEETUP_ID, invitedBy: HOST_ID },
    });

    // Invite emails: one per invitee with a real email.
    expect(mockSendInviteEmail).toHaveBeenCalledTimes(2);
    // Meetup-channel broadcast for the inviter.
    expect(mockBroadcastToMeetup).toHaveBeenCalledWith(
      MEETUP_ID, 'meetup:updated', expect.objectContaining({ invitesAdded: 2 })
    );
    // Per-user broadcast (one notification per invited user).
    expect(mockBroadcastToUser).toHaveBeenCalledTimes(2);
    expect(mockBroadcastToUser).toHaveBeenCalledWith(
      USER_ID, 'notification', expect.objectContaining({ type: 'MEETUP_INVITED', meetupId: MEETUP_ID })
    );
    expect(mockBroadcastToUser).toHaveBeenCalledWith(
      USER_C, 'notification', expect.objectContaining({ type: 'MEETUP_INVITED', meetupId: MEETUP_ID })
    );
  });

  it('returns 201 and skips already-invited userIds', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([{ userId: USER_ID }]); // USER_ID already invited
    mockPrismaMeetupInvite.createMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: USER_C, email: 'userc@example.com', name: 'Charlie' },
    ]);

    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_ID, USER_C] }), inviteParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(1);
    expect(body.skipped).toBe(1);

    const createManyCall = mockPrismaMeetupInvite.createMany.mock.calls[0]?.[0];
    expect(createManyCall?.data).toHaveLength(1);
    expect(createManyCall?.data[0].userId).toBe(USER_C);
    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    expect(mockBroadcastToUser).toHaveBeenCalledTimes(1);
  });

  it('returns 201 with invited=0 when all userIds are already invited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([{ userId: USER_ID }, { userId: USER_C }]);

    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_ID, USER_C] }), inviteParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(0);
    expect(body.skipped).toBe(2);

    // No-op when there are no new userIds.
    expect(mockPrismaMeetupInvite.createMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
    expect(mockBroadcastToUser).not.toHaveBeenCalled();
  });

  it('skips invite email for invitees with null email', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([]);
    mockPrismaMeetupInvite.createMany.mockResolvedValueOnce({ count: 2 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: USER_ID, email: 'user@example.com', name: 'Alice' },
      { id: USER_C, email: null, name: 'Charlie' },
    ]);

    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_ID, USER_C] }), inviteParams);
    expect(res.status).toBe(201);
    expect((await res.json()).invited).toBe(2);

    // Only the user with a real email gets an email.
    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com', inviteeName: 'Alice' })
    );
  });

  it('does not fail the response when an invite email throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID, 'Host'));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(baseMeetup);
    mockPrismaMeetupInvite.findMany.mockResolvedValueOnce([]);
    mockPrismaMeetupInvite.createMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: USER_ID, email: 'user@example.com', name: 'Alice' },
    ]);
    mockSendInviteEmail.mockRejectedValueOnce(new Error('SMTP down'));

    const res = await invitePOST(makeInviteReq(MEETUP_ID, { userIds: [USER_ID] }), inviteParams);
    // Promise.allSettled in the route swallows email rejection — route still 201s.
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.invited).toBe(1);
    expect(body.skipped).toBe(0);
  });
});
