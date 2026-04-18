/**
 * Unit tests for GET, PATCH, DELETE /api/meetups/[id]
 *
 * Routes covered:
 *   GET    /api/meetups/[id] — fetch full meetup detail with visibility + cancellation checks
 *   PATCH  /api/meetups/[id] — host-only meetup update
 *   DELETE /api/meetups/[id] — host-only soft-cancel (sets cancelled=true)
 *
 * Global mocks (prisma, next-auth, sentry, logger) are applied in
 * src/__tests__/setup.ts. Rate-limit is mocked locally to prevent any
 * real Upstash calls.
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

import { GET, PATCH, DELETE } from '@/app/api/meetups/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { broadcastToMeetup } from '@/lib/pusher';

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockBroadcastToMeetup = vi.mocked(broadcastToMeetup);

const mockPrismaMeetup = prisma.meetup as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockPrismaCrew = prisma.crew as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};

const mockPrismaMeetupInvite = prisma.meetupInvite as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const HOST_ID = 'user-host-001';
const OTHER_ID = 'user-other-002';
const MEETUP_ID = 'meetup-abc-123';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

/** A minimal meetup row as returned by prisma.meetup.findUnique with includes. */
const buildMeetup = (overrides: Record<string, unknown> = {}) => ({
  id: MEETUP_ID,
  hostId: HOST_ID,
  title: 'Test Meetup',
  description: 'A test meetup',
  venueName: 'Central Park',
  venueId: null,
  scheduledAt: new Date('2027-01-01T18:00:00Z'),
  endsAt: null,
  visibility: 'PUBLIC',
  capacity: 20,
  cancelled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  host: { id: HOST_ID, name: 'Host User', image: null },
  venue: null,
  attendees: [],
  invites: [],
  ...overrides,
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
// GET /api/meetups/[id]
// ===========================================================================
describe('GET /api/meetups/[id]', () => {
  const makeReq = () =>
    new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}`, { method: 'GET' });
  const params = { params: { id: MEETUP_ID } };

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when meetup not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Meetup not found');
  });

  it('returns 200 with meetup data including host, venue, attendees', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const meetup = buildMeetup({
      attendees: [
        {
          id: 'att-1',
          meetupId: MEETUP_ID,
          userId: HOST_ID,
          status: 'GOING',
          user: { id: HOST_ID, name: 'Host User', image: null },
        },
      ],
      invites: [{ id: 'inv-1' }, { id: 'inv-2' }],
    });
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(meetup);

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MEETUP_ID);
    expect(body.data.host).toMatchObject({ id: HOST_ID, name: 'Host User' });
    // invites array should be stripped; invitesCount should reflect original length
    expect(body.data.invitesCount).toBe(2);
    expect(body.data.invites).toBeUndefined();
    // myRsvpStatus should be set for the calling user
    expect(body.data.myRsvpStatus).toBe('GOING');
  });

  it('returns 404 when meetup is cancelled and requester is not the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    const meetup = buildMeetup({ cancelled: true });
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(meetup);

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Meetup not found');
  });

  it('returns 200 when meetup is cancelled but requester is the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    const meetup = buildMeetup({ cancelled: true });
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(meetup);

    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.cancelled).toBe(true);
  });
});

// ===========================================================================
// PATCH /api/meetups/[id]
// ===========================================================================
describe('PATCH /api/meetups/[id]', () => {
  const makeReq = (body: unknown) =>
    new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const params = { params: { id: MEETUP_ID } };

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq({ title: 'Updated' }), params);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when meetup not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq({ title: 'Updated' }), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Meetup not found');
  });

  it('returns 403 when caller is not the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());
    const res = await PATCH(makeReq({ title: 'Updated' }), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 success and updates the meetup, returning updated data', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());

    const updatedMeetup = {
      ...buildMeetupSimple(),
      title: 'New Title',
      host: { id: HOST_ID, name: 'Host User', image: null },
      venue: null,
    };
    mockPrismaMeetup.update.mockResolvedValueOnce(updatedMeetup);

    const res = await PATCH(makeReq({ title: 'New Title' }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('New Title');
    expect(body.data.host).toMatchObject({ id: HOST_ID });
    // Verify prisma.meetup.update was called with the right where clause
    expect(mockPrismaMeetup.update).toHaveBeenCalledTimes(1);
    const updateArg = mockPrismaMeetup.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: MEETUP_ID });
    expect(updateArg?.data).toMatchObject({ title: 'New Title' });
    // Verify the meetup channel is notified of the update
    expect(mockBroadcastToMeetup).toHaveBeenCalledWith(
      MEETUP_ID,
      'meetup:updated',
      expect.any(Object)
    );
  });

  it('returns 400 when body fails validation', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    // capacity must be a positive integer — pass a negative to trigger 400
    const res = await PATCH(makeReq({ capacity: -5 }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });
});

// ===========================================================================
// DELETE /api/meetups/[id]
// ===========================================================================
describe('DELETE /api/meetups/[id]', () => {
  const makeReq = () =>
    new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}`, { method: 'DELETE' });
  const params = { params: { id: MEETUP_ID } };

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when caller is not the host', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());
    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 success and soft-cancels the meetup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());
    mockPrismaMeetup.update.mockResolvedValueOnce({
      ...buildMeetupSimple(),
      cancelled: true,
    });

    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Verify the meetup was soft-cancelled (not hard-deleted)
    expect(mockPrismaMeetup.update).toHaveBeenCalledTimes(1);
    const updateArg = mockPrismaMeetup.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: MEETUP_ID });
    expect(updateArg?.data).toEqual({ cancelled: true });
    // Verify hard delete was NOT called
    expect(mockPrismaMeetup.delete).not.toHaveBeenCalled();
    // Verify the meetup channel is notified of the cancellation
    expect(mockBroadcastToMeetup).toHaveBeenCalledWith(
      MEETUP_ID,
      'meetup:cancelled',
      expect.objectContaining({ meetupId: MEETUP_ID })
    );
  });

  it('returns 404 when meetup not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Meetup not found');
  });
});

// ===========================================================================
// Pusher broadcast guards — should NOT broadcast on error/forbidden paths
// ===========================================================================
describe('Pusher broadcast guards', () => {
  const makePatchReq = (body: unknown) =>
    new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const makeDeleteReq = () =>
    new NextRequest(`http://localhost/api/meetups/${MEETUP_ID}`, { method: 'DELETE' });
  const params = { params: { id: MEETUP_ID } };

  it('PATCH does not broadcast if user is not host (403 path)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(OTHER_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(buildMeetupSimple());

    const res = await PATCH(makePatchReq({ title: 'Hijack' }), params);
    expect(res.status).toBe(403);
    // Critical: no real-time event should leak to subscribers when the
    // request was rejected. Update was never executed; broadcast must not fire.
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
  });

  it('DELETE does not broadcast if meetup not found (404 path)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor(HOST_ID));
    mockPrismaMeetup.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteReq(), params);
    expect(res.status).toBe(404);
    // No cancellation event should fire for a meetup that does not exist.
    expect(mockBroadcastToMeetup).not.toHaveBeenCalled();
    expect(mockPrismaMeetup.update).not.toHaveBeenCalled();
  });
});
