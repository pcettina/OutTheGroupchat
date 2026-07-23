/**
 * Unit tests for the attendee-notification behavior added to
 * PATCH and DELETE /api/meetups/[id].
 *
 * The route emits a SYSTEM notification (with `data.kind` carrying the
 * semantic — MEETUP_UPDATED / MEETUP_CANCELLED) to every attendee EXCEPT
 * the host on a successful edit/cancel. The write is fail-soft: a failure
 * of prisma.notification.createMany must never fail the request itself.
 *
 * This is a NEW sibling to meetups-id.test.ts. It intentionally re-uses the
 * exact same mock idiom (global prisma/next-auth/logger/sentry from setup.ts;
 * local pusher + rate-limit mocks; re-armed checkRateLimit in beforeEach).
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

import { PATCH, DELETE } from '@/app/api/meetups/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { broadcastToMeetup } from '@/lib/pusher';

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockBroadcastToMeetup = vi.mocked(broadcastToMeetup);

const mockPrismaMeetup = prisma.meetup as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockPrismaMeetupAttendee = prisma.meetupAttendee as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const HOST_ID = 'user-host-001';
const OTHER_ID = 'user-other-002';
const ATTENDEE_A = 'user-attendee-a';
const ATTENDEE_B = 'user-attendee-b';
const MEETUP_ID = 'meetup-abc-123';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

/** A minimal meetup row for findUnique without includes (used in PATCH/DELETE). */
const buildMeetupSimple = (overrides: Record<string, unknown> = {}) => ({
  id: MEETUP_ID,
  hostId: HOST_ID,
  title: 'Test Meetup',
  description: null,
  venueName: null,
  venueId: null,
  scheduledAt: new Date('2027-01-01T18:00:00Z'),
  endsAt: null,
  visibility: 'PUBLIC',
  capacity: null,
  cancelled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Attendee rows returned by prisma.meetupAttendee.findMany. Deliberately
 * includes the HOST so we can prove the host is excluded from notifications.
 */
const attendeeRows = () => [
  { userId: ATTENDEE_A },
  { userId: ATTENDEE_B },
  { userId: HOST_ID },
];

beforeEach(() => {
  vi.resetAllMocks();
  // Re-establish the permanent rate-limit pass-through mock after reset.
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  // Re-arm the pusher broadcast mock so default behavior is a resolved promise.
  mockBroadcastToMeetup.mockResolvedValue(undefined);
});

// ===========================================================================
// PATCH /api/meetups/[id] — attendee notification on update
// ===========================================================================
describe('PATCH /api/meetups/[id] — attendee notifications', () => {
  const makeReq = (body: unknown) =>
    new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const params = { params: { id: MEETUP_ID } };

  const armSuccessfulUpdate = () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());
    mockPrismaMeetup.update.mockResolvedValueOnce({
      ...buildMeetupSimple(),
      title: 'New Title',
      host: { id: HOST_ID, name: 'Host User', image: null },
      venue: null,
    });
    mockPrismaMeetupAttendee.findMany.mockResolvedValueOnce(attendeeRows());
  };

  it('notifies every attendee except the host with a MEETUP_UPDATED SYSTEM notification', async () => {
    armSuccessfulUpdate();
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await PATCH(makeReq({ title: 'New Title' }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // createMany was called exactly once with rows for the non-host attendees.
    expect(mockPrismaNotification.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    const rows = arg?.data as Array<{
      userId: string;
      type: string;
      data: { kind: string; meetupId: string };
    }>;
    expect(Array.isArray(rows)).toBe(true);

    // Host must NOT be among the notified userIds.
    const notifiedUserIds = rows.map((r) => r.userId);
    expect(notifiedUserIds).not.toContain(HOST_ID);
    expect(notifiedUserIds).toEqual(
      expect.arrayContaining([ATTENDEE_A, ATTENDEE_B]),
    );
    expect(rows).toHaveLength(2);

    // Every row is a SYSTEM notification carrying the MEETUP_UPDATED semantic.
    for (const row of rows) {
      expect(row.type).toBe('SYSTEM');
      expect(row.data.kind).toBe('MEETUP_UPDATED');
      expect(row.data.meetupId).toBe(MEETUP_ID);
    }
  });

  it('still fires the pusher broadcast alongside the notification', async () => {
    armSuccessfulUpdate();
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await PATCH(makeReq({ title: 'New Title' }), params);
    expect(res.status).toBe(200);
    // The notify addition must not have removed the existing broadcast.
    expect(mockBroadcastToMeetup).toHaveBeenCalledWith(
      MEETUP_ID,
      'meetup:updated',
      expect.any(Object),
    );
  });

  it('is fail-soft: still returns 200 when createMany rejects', async () => {
    armSuccessfulUpdate();
    mockPrismaNotification.createMany.mockRejectedValueOnce(
      new Error('db down'),
    );

    const res = await PATCH(makeReq({ title: 'New Title' }), params);
    // The request must not fail because notify threw.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 403 and creates NO notification when caller is not the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());

    const res = await PATCH(makeReq({ title: 'Hijack' }), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');

    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// DELETE /api/meetups/[id] — attendee notification on cancel
// ===========================================================================
describe('DELETE /api/meetups/[id] — attendee notifications', () => {
  const makeReq = () =>
    new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}`, {
      method: 'DELETE',
    });
  const params = { params: { id: MEETUP_ID } };

  const armSuccessfulCancel = () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());
    mockPrismaMeetup.update.mockResolvedValueOnce({
      ...buildMeetupSimple(),
      cancelled: true,
    });
    mockPrismaMeetupAttendee.findMany.mockResolvedValueOnce(attendeeRows());
  };

  it('notifies every attendee except the host with a MEETUP_CANCELLED SYSTEM notification and preserves soft-cancel', async () => {
    armSuccessfulCancel();
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Existing soft-cancel behavior preserved: update sets cancelled=true, no hard delete.
    expect(mockPrismaMeetup.update).toHaveBeenCalledTimes(1);
    const updateArg = mockPrismaMeetup.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ cancelled: true });
    expect(mockPrismaMeetup.delete).not.toHaveBeenCalled();

    // createMany rows carry the MEETUP_CANCELLED semantic; host excluded.
    expect(mockPrismaNotification.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    const rows = arg?.data as Array<{
      userId: string;
      type: string;
      data: { kind: string; meetupId: string };
    }>;
    const notifiedUserIds = rows.map((r) => r.userId);
    expect(notifiedUserIds).not.toContain(HOST_ID);
    expect(notifiedUserIds).toEqual(
      expect.arrayContaining([ATTENDEE_A, ATTENDEE_B]),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.type).toBe('SYSTEM');
      expect(row.data.kind).toBe('MEETUP_CANCELLED');
      expect(row.data.meetupId).toBe(MEETUP_ID);
    }
  });

  it('still fires the pusher cancel broadcast alongside the notification', async () => {
    armSuccessfulCancel();
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(200);
    expect(mockBroadcastToMeetup).toHaveBeenCalledWith(
      MEETUP_ID,
      'meetup:cancelled',
      expect.objectContaining({ meetupId: MEETUP_ID }),
    );
  });

  it('is fail-soft: still returns 200 (cancelled) when createMany rejects', async () => {
    armSuccessfulCancel();
    mockPrismaNotification.createMany.mockRejectedValueOnce(
      new Error('db down'),
    );

    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Soft-cancel still happened despite the notify failure.
    expect(mockPrismaMeetup.update).toHaveBeenCalledTimes(1);
  });

  it('returns 403 and creates NO notification when caller is not the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());

    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');

    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
  });
});
