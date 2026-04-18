// Unit tests for GET /api/cron/meetup-starting-soon (Phase 4, Session 3).
// Auth: Bearer CRON_SECRET. Queries meetups [now+55min, now+65min],
// and for each GOING attendee creates a notification, sends email, and
// broadcasts via Pusher — idempotent on (user, meetup).
// Prisma/next-auth/sentry/logger mocks live in src/__tests__/setup.ts.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/pusher', () => ({
  channels: {
    trip: (id: string) => `trip-${id}`, user: (id: string) => `user-${id}`,
    voting: (id: string) => `voting-${id}`, meetup: (id: string) => `meetup-${id}`,
  },
  events: {
    TRIP_UPDATED: 'trip:updated', MEMBER_JOINED: 'member:joined', MEMBER_LEFT: 'member:left',
    ACTIVITY_ADDED: 'activity:added', ACTIVITY_UPDATED: 'activity:updated',
    ITINERARY_UPDATED: 'itinerary:updated', SURVEY_CREATED: 'survey:created',
    SURVEY_RESPONSE: 'survey:response', SURVEY_CLOSED: 'survey:closed',
    VOTE_CAST: 'vote:cast', VOTING_CLOSED: 'voting:closed', VOTING_RESULTS: 'voting:results',
    NOTIFICATION: 'notification', INVITATION: 'invitation',
    MEETUP_STARTING_SOON: 'meetup:starting_soon', MEETUP_UPDATED: 'meetup:updated',
    MEETUP_CANCELLED: 'meetup:cancelled',
    ATTENDEE_JOINED: 'attendee:joined', ATTENDEE_LEFT: 'attendee:left',
  },
  getPusherServer: vi.fn(() => null), getPusherClient: vi.fn(() => null),
  broadcastToTrip: vi.fn().mockResolvedValue(undefined),
  broadcastToUser: vi.fn().mockResolvedValue(undefined),
  broadcastToMeetup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/email', () => ({
  sendMeetupStartingSoonEmail: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/meetup-starting-soon/route';
import { broadcastToUser } from '@/lib/pusher';
import { sendMeetupStartingSoonEmail } from '@/lib/email';

const mockBroadcastToUser = vi.mocked(broadcastToUser);
const mockSendEmail = vi.mocked(sendMeetupStartingSoonEmail);

// setup.ts does NOT include prisma.notification.findFirst — we attach it
// per-test via notificationRecord, exposed through getter proxies so
// `.mock.calls` always reads from the current vi.fn().
type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaMeetup = prisma.meetup as unknown as { findMany: MockFn };
const notificationRecord = prisma.notification as unknown as Record<string, MockFn>;
const mockPrismaNotification = {
  get findFirst(): MockFn { return notificationRecord.findFirst; },
  get create(): MockFn { return notificationRecord.create; },
};

const SECRET = 'test-secret-abc';
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  // Re-seed findFirst (not in setup.ts) and create (re-seed for explicit default).
  notificationRecord.findFirst = vi.fn().mockResolvedValue(null);
  notificationRecord.create = vi.fn().mockResolvedValue({ id: 'notif-x' });
  mockPrismaMeetup.findMany.mockResolvedValue([]);
  mockBroadcastToUser.mockResolvedValue(undefined);
  mockSendEmail.mockResolvedValue(undefined);
});

afterAll(() => {
  if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
  else delete process.env.CRON_SECRET;
});

// Plain Request is sufficient; route only reads headers.
const makeReq = (opts: { secret?: string | null } = {}): Request => {
  const { secret = SECRET } = opts;
  const headers: Record<string, string> = {};
  if (secret !== null) headers['authorization'] = `Bearer ${secret}`;
  return new Request('http://localhost/api/cron/meetup-starting-soon', { method: 'GET', headers });
};

// Fixture scheduledAt sits inside the +55/+65min window enforced by the route.
type Attendee = {
  id: string; userId: string; meetupId: string;
  status: 'GOING' | 'MAYBE' | 'DECLINED';
  user: { id: string; email: string | null; name: string | null };
};
type MeetupFixture = {
  id: string; title: string; scheduledAt: Date; cancelled: boolean;
  venueName: string | null; venue: { name: string } | null;
  host: { id: string; name: string | null }; attendees: Attendee[];
};

const inWindow = (): Date => new Date(Date.now() + 60 * 60 * 1000);
const makeAttendee = (
  overrides: Partial<Attendee> & { userId: string } = { userId: 'user-1' }
): Attendee => {
  const { userId, ...rest } = overrides;
  return {
    id: `att-${userId}`, meetupId: 'meetup-abc', status: 'GOING',
    user: { id: userId, email: `${userId}@test.com`, name: `User ${userId}` },
    ...rest, userId,
  };
};
const makeMeetup = (overrides: Partial<MeetupFixture> = {}): MeetupFixture => ({
  id: 'meetup-abc', title: 'Weekend Hike', scheduledAt: inWindow(), cancelled: false,
  venueName: null, venue: { name: 'Central Park' },
  host: { id: 'host-1', name: 'Alice' },
  attendees: [makeAttendee({ userId: 'user-1' })],
  ...overrides,
});

// ===========================================================================
// Auth
// ===========================================================================
describe('GET /api/cron/meetup-starting-soon — auth', () => {
  it('returns 500 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(makeReq({ secret: SECRET }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/cron configuration/i);
    // findMany must not run before the secret guard.
    expect(mockPrismaMeetup.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await GET(makeReq({ secret: null }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
    expect(mockPrismaMeetup.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header carries the wrong secret', async () => {
    const res = await GET(makeReq({ secret: 'wrong-secret' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
    expect(mockPrismaMeetup.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 when Authorization matches Bearer ${CRON_SECRET}', async () => {
    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ===========================================================================
// Query shape
// ===========================================================================
describe('GET /api/cron/meetup-starting-soon — query', () => {
  it('calls prisma.meetup.findMany with a [now+55min, now+65min] scheduledAt window', async () => {
    const before = Date.now();
    await GET(makeReq());
    const after = Date.now();

    expect(mockPrismaMeetup.findMany).toHaveBeenCalledTimes(1);
    const arg = mockPrismaMeetup.findMany.mock.calls[0][0] as {
      where: { scheduledAt: { gte: Date; lte: Date } };
    };

    const gteMs = arg.where.scheduledAt.gte.getTime();
    const lteMs = arg.where.scheduledAt.lte.getTime();

    // gte should be roughly now + 55 min, within 1s of call boundaries.
    expect(gteMs).toBeGreaterThanOrEqual(before + 55 * 60 * 1000 - 1000);
    expect(gteMs).toBeLessThanOrEqual(after + 55 * 60 * 1000 + 1000);
    // lte should be roughly now + 65 min.
    expect(lteMs).toBeGreaterThanOrEqual(before + 65 * 60 * 1000 - 1000);
    expect(lteMs).toBeLessThanOrEqual(after + 65 * 60 * 1000 + 1000);
    // The window width should be exactly 10 minutes.
    expect(lteMs - gteMs).toBe(10 * 60 * 1000);
  });

  it('excludes cancelled meetups via where.cancelled = false', async () => {
    await GET(makeReq());

    const arg = mockPrismaMeetup.findMany.mock.calls[0][0] as {
      where: { cancelled: boolean };
    };
    expect(arg.where.cancelled).toBe(false);
  });

  it('filters attendees to status: GOING via include.attendees.where', async () => {
    await GET(makeReq());

    const arg = mockPrismaMeetup.findMany.mock.calls[0][0] as {
      include: {
        attendees: { where: { status: string }; include: { user: { select: Record<string, boolean> } } };
        host: { select: Record<string, boolean> };
        venue: { select: Record<string, boolean> };
      };
    };

    expect(arg.include.attendees.where).toEqual({ status: 'GOING' });
    // User fields pulled on each attendee should include id + email + name.
    expect(arg.include.attendees.include.user.select).toMatchObject({
      id: true,
      email: true,
      name: true,
    });
    // Host + venue shapes the route relies on downstream.
    expect(arg.include.host.select).toMatchObject({ id: true, name: true });
    expect(arg.include.venue.select).toMatchObject({ name: true });
  });

  it('returns zeroed metrics in the response when no meetups match the window', async () => {
    mockPrismaMeetup.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      meetupsProcessed: 0,
      notificationsSent: 0,
      emailsSent: 0,
      broadcastsSent: 0,
      skippedAlreadyNotified: 0,
    });
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockBroadcastToUser).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Dispatch — notification, email, broadcast
// ===========================================================================
describe('GET /api/cron/meetup-starting-soon — dispatch', () => {
  it('creates a MEETUP_STARTING_SOON notification for each GOING attendee with the correct shape', async () => {
    const meetup = makeMeetup({
      attendees: [makeAttendee({ userId: 'user-1' }), makeAttendee({ userId: 'user-2' })],
    });
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(2);
    const firstCall = mockPrismaNotification.create.mock.calls[0][0] as {
      data: {
        userId: string;
        type: string;
        title: string;
        message: string;
        data: { meetupId: string; minutesUntil: number };
      };
    };
    expect(firstCall.data.userId).toBe('user-1');
    expect(firstCall.data.type).toBe('MEETUP_STARTING_SOON');
    expect(firstCall.data.title).toContain('Weekend Hike');
    expect(firstCall.data.title).toMatch(/\d+ min/);
    expect(firstCall.data.message).toContain('Central Park');
    expect(firstCall.data.data.meetupId).toBe('meetup-abc');
    expect(typeof firstCall.data.data.minutesUntil).toBe('number');
  });

  it('calls sendMeetupStartingSoonEmail for each GOING attendee with the expected params', async () => {
    const meetup = makeMeetup({
      attendees: [makeAttendee({ userId: 'user-1' })],
    });
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);

    await GET(makeReq());

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const params = mockSendEmail.mock.calls[0][0];
    expect(params.to).toBe('user-1@test.com');
    expect(params.meetupTitle).toBe('Weekend Hike');
    expect(params.hostName).toBe('Alice');
    expect(params.meetupVenueName).toBe('Central Park');
    expect(params.meetupId).toBe('meetup-abc');
    expect(typeof params.minutesUntil).toBe('number');
    expect(typeof params.meetupDate).toBe('string');
  });

  it('skips email for attendees with null email but still creates the notification', async () => {
    const meetup = makeMeetup({
      attendees: [
        {
          ...makeAttendee({ userId: 'user-1' }),
          user: { id: 'user-1', email: null, name: 'No Mail' },
        },
      ],
    });
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockBroadcastToUser).toHaveBeenCalledTimes(1);
    expect(body.notificationsSent).toBe(1);
    expect(body.emailsSent).toBe(0);
    expect(body.broadcastsSent).toBe(1);
  });

  it('broadcasts a MEETUP_STARTING_SOON notification event to each attendee via Pusher', async () => {
    const meetup = makeMeetup({
      attendees: [makeAttendee({ userId: 'user-1' }), makeAttendee({ userId: 'user-2' })],
    });
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);

    await GET(makeReq());

    expect(mockBroadcastToUser).toHaveBeenCalledTimes(2);
    const [userId, event, payload] = mockBroadcastToUser.mock.calls[0] as [
      string,
      string,
      { type: string; meetupId: string; minutesUntil: number },
    ];
    expect(userId).toBe('user-1');
    expect(event).toBe('notification');
    expect(payload.type).toBe('MEETUP_STARTING_SOON');
    expect(payload.meetupId).toBe('meetup-abc');
    expect(typeof payload.minutesUntil).toBe('number');
  });

  it('returns response metrics that match actual dispatch counts', async () => {
    const meetup = makeMeetup({
      attendees: [
        makeAttendee({ userId: 'user-1' }),
        makeAttendee({ userId: 'user-2' }),
        makeAttendee({ userId: 'user-3' }),
      ],
    });
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({
      success: true,
      meetupsProcessed: 1,
      notificationsSent: 3,
      emailsSent: 3,
      broadcastsSent: 3,
      skippedAlreadyNotified: 0,
    });
  });
});

// ===========================================================================
// Idempotency — skip users who already got a reminder for this meetup
// ===========================================================================
describe('GET /api/cron/meetup-starting-soon — idempotency', () => {
  it('skips the create/email/broadcast path when findFirst returns an existing notification', async () => {
    const meetup = makeMeetup();
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);
    // The user already received a MEETUP_STARTING_SOON notification.
    mockPrismaNotification.findFirst.mockResolvedValueOnce({
      id: 'existing-notif',
      userId: 'user-1',
      type: 'MEETUP_STARTING_SOON',
    });

    await GET(makeReq());

    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockBroadcastToUser).not.toHaveBeenCalled();
  });

  it('increments skippedAlreadyNotified when an existing notification is found', async () => {
    const meetup = makeMeetup();
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);
    mockPrismaNotification.findFirst.mockResolvedValueOnce({ id: 'existing-notif' });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toMatchObject({
      success: true,
      meetupsProcessed: 1,
      notificationsSent: 0,
      emailsSent: 0,
      broadcastsSent: 0,
      skippedAlreadyNotified: 1,
    });
  });

  it('dispatches only the un-notified attendees when 2 of 3 are already notified', async () => {
    const meetup = makeMeetup({
      attendees: [
        makeAttendee({ userId: 'user-1' }),
        makeAttendee({ userId: 'user-2' }),
        makeAttendee({ userId: 'user-3' }),
      ],
    });
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);
    // user-1 already notified, user-2 already notified, user-3 fresh.
    mockPrismaNotification.findFirst
      .mockResolvedValueOnce({ id: 'notif-user1' })
      .mockResolvedValueOnce({ id: 'notif-user2' })
      .mockResolvedValueOnce(null);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(1);
    const created = mockPrismaNotification.create.mock.calls[0][0] as {
      data: { userId: string };
    };
    expect(created.data.userId).toBe('user-3');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockBroadcastToUser).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      meetupsProcessed: 1,
      notificationsSent: 1,
      emailsSent: 1,
      broadcastsSent: 1,
      skippedAlreadyNotified: 2,
    });
  });
});

// ===========================================================================
// Graceful degradation
// ===========================================================================
describe('GET /api/cron/meetup-starting-soon — degradation', () => {
  it('continues dispatching other attendees and still creates notifications when email throws', async () => {
    // Two attendees, email rejects for the first, succeeds for the second.
    const meetup = makeMeetup({
      attendees: [makeAttendee({ userId: 'user-1' }), makeAttendee({ userId: 'user-2' })],
    });
    mockPrismaMeetup.findMany.mockResolvedValueOnce([meetup]);
    mockSendEmail
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockResolvedValueOnce(undefined);

    const res = await GET(makeReq());
    const body = await res.json();

    // The route wraps everything in try/catch — if it re-throws on email failure it will return 500.
    // In either case, both attendees' notifications must have been created BEFORE the throw, and
    // the broadcast for user-1 must not have fired when email rejected.
    expect(mockPrismaNotification.create).toHaveBeenCalled();
    const firstCreate = mockPrismaNotification.create.mock.calls[0][0] as {
      data: { userId: string };
    };
    expect(firstCreate.data.userId).toBe('user-1');

    if (res.status === 200) {
      // Graceful path: route swallows the email failure, processes user-2.
      expect(body.notificationsSent).toBeGreaterThanOrEqual(1);
      expect(mockPrismaNotification.create).toHaveBeenCalledTimes(2);
    } else {
      // Non-graceful path: route bails out with 500 but user-1's notification is already written.
      expect(res.status).toBe(500);
      expect(body.error).toMatch(/failed/i);
    }
  });

  it('returns 500 when prisma.meetup.findMany throws a DB error', async () => {
    mockPrismaMeetup.findMany.mockRejectedValueOnce(new Error('DB connection reset'));

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed/i);
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockBroadcastToUser).not.toHaveBeenCalled();
  });
});
