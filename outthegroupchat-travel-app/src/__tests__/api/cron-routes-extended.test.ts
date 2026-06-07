/**
 * Extended edge-case tests for the three cron routes:
 *   - GET /api/cron                          (background jobs dispatcher)
 *   - GET /api/cron/expire-intents           (V1 Intent retention hygiene)
 *   - GET /api/cron/meetup-starting-soon     (T+~60 min RSVP reminders)
 *
 * Focus: auth boundaries, empty-DB branches, bulk-update count branches,
 * Prisma error paths, query-param parsing edge cases. Prisma + sentry +
 * logger mocks come from src/__tests__/setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';

// Pusher + email mocks must be hoisted before importing the meetup-starting-soon route.
vi.mock('@/lib/pusher', () => ({
  channels: {
    trip: (id: string) => `trip-${id}`,
    user: (id: string) => `user-${id}`,
    voting: (id: string) => `voting-${id}`,
    meetup: (id: string) => `meetup-${id}`,
  },
  events: {
    NOTIFICATION: 'notification',
    MEETUP_STARTING_SOON: 'meetup:starting_soon',
  },
  getPusherServer: vi.fn(() => null),
  getPusherClient: vi.fn(() => null),
  broadcastToTrip: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToMeetup: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendMeetupStartingSoonEmail: vi.fn(),
}));

import { GET as CRON_MAIN } from '@/app/api/cron/route';
import { GET as CRON_EXPIRE_INTENTS } from '@/app/api/cron/expire-intents/route';
import { GET as CRON_MEETUP_SOON } from '@/app/api/cron/meetup-starting-soon/route';
import { broadcastToUser } from '@/lib/pusher';
import { sendMeetupStartingSoonEmail } from '@/lib/email';

// ---------------------------------------------------------------------------
// Typed accessors
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;

const mockTripInvitation = prisma.tripInvitation as unknown as { updateMany: MockFn };
const mockTripSurvey = prisma.tripSurvey as unknown as { findMany: MockFn; update: MockFn };
const mockTripMember = prisma.tripMember as unknown as { findMany: MockFn };
const mockVotingSession = prisma.votingSession as unknown as { findMany: MockFn; update: MockFn };
const mockNotification = prisma.notification as unknown as {
  create: MockFn;
  findFirst: MockFn;
  createMany: MockFn;
};
const mockIntent = prisma.intent as unknown as { count: MockFn; deleteMany: MockFn };
const mockMeetup = prisma.meetup as unknown as { findMany: MockFn };

// trip.updateMany is missing from setup.ts. Use getter proxies so tests always
// resolve against the freshly-attached vi.fn() (re-attached every beforeEach).
const tripRecord = prisma.trip as unknown as Record<string, MockFn>;
const mockTrip = {
  get findUnique(): MockFn { return tripRecord.findUnique; },
  get updateMany(): MockFn { return tripRecord.updateMany; },
};
const mockBroadcast = vi.mocked(broadcastToUser);
const mockEmail = vi.mocked(sendMeetupStartingSoonEmail);

const SECRET = 'extended-test-secret';
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = SECRET;
  // setup.ts does NOT include prisma.trip.updateMany — attach it here.
  // Cast through unknown→Record so we can add a method to the mock object
  // without modifying the shared setup.ts (Wave 3 territory).
  tripRecord.updateMany = vi.fn();
  // Default benign mocks (resetAllMocks wipes factory-level defaults).
  mockBroadcast.mockResolvedValue(undefined);
  mockEmail.mockResolvedValue(undefined);
});

afterAll(() => {
  if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
  else delete process.env.CRON_SECRET;
});

const makeReq = (
  url: string,
  opts: { secret?: string | null; rawAuth?: string } = {}
): Request => {
  const { secret = SECRET, rawAuth } = opts;
  const headers: Record<string, string> = {};
  if (rawAuth !== undefined) {
    headers['authorization'] = rawAuth;
  } else if (secret !== null) {
    headers['authorization'] = `Bearer ${secret}`;
  }
  return new Request(url, { method: 'GET', headers });
};

// =====================================================================================
// /api/cron — main background-jobs dispatcher
// =====================================================================================
describe('GET /api/cron — extended edge cases', () => {
  // Helper: load the queue with empty/zero data so the happy-path runs cleanly.
  const seedEmptyHappyPath = () => {
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockResolvedValueOnce([]); // expired surveys
    mockVotingSession.findMany.mockResolvedValueOnce([]); // expired voting sessions
    mockTripSurvey.findMany.mockResolvedValueOnce([]); // expiring (24h) surveys
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 }); // BOOKED → IN_PROGRESS
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 }); // IN_PROGRESS → COMPLETED
  };

  it('returns 500 when CRON_SECRET is unset, with the configuration error message', async () => {
    delete process.env.CRON_SECRET;
    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/CRON_SECRET/i);
    // Guard short-circuits before touching the DB
    expect(mockTripInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('returns 500 when CRON_SECRET is the empty string (treated as unset)', async () => {
    process.env.CRON_SECRET = '';
    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    expect(res.status).toBe(500);
  });

  it('returns 401 when Authorization header is absent', async () => {
    const res = await CRON_MAIN(makeReq('http://localhost/api/cron', { secret: null }));
    expect(res.status).toBe(401);
    expect(mockTripInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('returns 401 when Bearer token does not match (mismatched secret)', async () => {
    const res = await CRON_MAIN(
      makeReq('http://localhost/api/cron', { secret: 'definitely-not-the-secret' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header omits the "Bearer " prefix', async () => {
    const res = await CRON_MAIN(
      makeReq('http://localhost/api/cron', { rawAuth: SECRET })
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer prefix uses lowercase "bearer "', async () => {
    // Header comparison is exact-string against `Bearer ${secret}` — case matters.
    const res = await CRON_MAIN(
      makeReq('http://localhost/api/cron', { rawAuth: `bearer ${SECRET}` })
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token uses a different secret value of identical length', async () => {
    // Same length as SECRET but different bytes — guards against
    // accidentally-correct comparison via length-only checks.
    const sameLenWrong = 'A'.repeat(SECRET.length);
    const res = await CRON_MAIN(
      makeReq('http://localhost/api/cron', { secret: sameLenWrong })
    );
    expect(res.status).toBe(401);
    expect(mockTripInvitation.updateMany).not.toHaveBeenCalled();
  });

  it('returns 200 with all-zero results on a fully empty database', async () => {
    seedEmptyHappyPath();
    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.results).toEqual({
      expiredInvitations: 0,
      closedSurveys: 0,
      closedVotingSessions: 0,
      notificationsSent: 0,
    });
  });

  it('returns 200 and reports a large count of expired invitations (bulk-update branch, N>0)', async () => {
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 142 });
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockVotingSession.findMany.mockResolvedValueOnce([]);
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.expiredInvitations).toBe(142);
  });

  it('handles an expired voting session whose tripMember.findMany returns an empty members list (createMany count=0 branch)', async () => {
    const session = { id: 'vs-empty', tripId: 'trip-empty', title: 'Lonely Vote' };
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockVotingSession.findMany.mockResolvedValueOnce([session]);
    mockVotingSession.update.mockResolvedValueOnce({ ...session, status: 'CLOSED' });
    mockTripMember.findMany.mockResolvedValueOnce([]); // zero members — createMany payload is empty array
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.closedVotingSessions).toBe(1);
    expect(body.results.notificationsSent).toBe(0);
    expect(mockNotification.createMany).toHaveBeenCalledOnce();
  });

  it('skips owner notification when prisma.trip.findUnique returns null for an expired survey', async () => {
    const survey = { id: 's-orphan', tripId: 'trip-deleted' };
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockResolvedValueOnce([survey]);
    mockTripSurvey.update.mockResolvedValueOnce({ ...survey, status: 'CLOSED' });
    mockTrip.findUnique.mockResolvedValueOnce(null); // trip vanished — no notification
    mockVotingSession.findMany.mockResolvedValueOnce([]);
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.results.closedSurveys).toBe(1);
    // Survey was closed but no owner notification was created
    expect(mockNotification.create).not.toHaveBeenCalled();
  });

  it('skips reminder when an existing reminder notification was sent within last 24h', async () => {
    const expiringSurvey = {
      id: 'surv-expiring',
      tripId: 'trip-x',
      trip: { title: 'Almost Out Of Time', members: [{ userId: 'm-1' }] },
      responses: [],
    };
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockResolvedValueOnce([]); // no expired surveys
    mockVotingSession.findMany.mockResolvedValueOnce([]); // no expired voting
    mockTripSurvey.findMany.mockResolvedValueOnce([expiringSurvey]); // expiring within 24h
    mockNotification.findFirst.mockResolvedValueOnce({ id: 'recent-reminder' }); // already reminded
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(mockNotification.create).not.toHaveBeenCalled();
    expect(body.results.notificationsSent).toBe(0);
  });

  it('sends a reminder when no recent reminder exists for an expiring-soon survey', async () => {
    const expiringSurvey = {
      id: 'surv-fresh',
      tripId: 'trip-y',
      trip: { title: 'Cast Your Vote', members: [{ userId: 'm-1' }, { userId: 'm-2' }] },
      responses: [{ userId: 'm-1' }], // m-1 already responded; m-2 still needs reminding
    };
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockVotingSession.findMany.mockResolvedValueOnce([]);
    mockTripSurvey.findMany.mockResolvedValueOnce([expiringSurvey]);
    mockNotification.findFirst.mockResolvedValueOnce(null); // no existing reminder for m-2
    mockNotification.create.mockResolvedValueOnce({ id: 'reminder-1' });
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(mockNotification.create).toHaveBeenCalledOnce();
    const created = mockNotification.create.mock.calls[0][0] as { data: { userId: string } };
    expect(created.data.userId).toBe('m-2');
    expect(body.results.notificationsSent).toBe(1);
  });

  it('returns 500 when prisma.tripSurvey.findMany rejects (graceful 500 path)', async () => {
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockRejectedValueOnce(new Error('table locked'));
    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/failed/i);
  });

  it('returns 500 when prisma.trip.updateMany rejects on the final status update', async () => {
    mockTripInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockVotingSession.findMany.mockResolvedValueOnce([]);
    mockTripSurvey.findMany.mockResolvedValueOnce([]);
    mockTrip.updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip.updateMany.mockRejectedValueOnce(new Error('FK violation'));

    const res = await CRON_MAIN(makeReq('http://localhost/api/cron'));
    expect(res.status).toBe(500);
  });
});

// =====================================================================================
// /api/cron/expire-intents
// =====================================================================================
describe('GET /api/cron/expire-intents — extended edge cases', () => {
  beforeEach(() => {
    // Default benign Intent state (resetAllMocks just wiped these)
    mockIntent.count.mockResolvedValue(0);
    mockIntent.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('returns 500 with config error when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents', { secret: null })
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/cron configuration/i);
    expect(mockIntent.count).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token mismatches', async () => {
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents', { secret: 'nope' })
    );
    expect(res.status).toBe(401);
    expect(mockIntent.count).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing entirely', async () => {
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents', { secret: null })
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer prefix is missing (raw secret only)', async () => {
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents', { rawAuth: SECRET })
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with zero counts when no intents exist (empty-DB branch)', async () => {
    mockIntent.count.mockResolvedValueOnce(0);
    mockIntent.deleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await CRON_EXPIRE_INTENTS(makeReq('http://localhost/api/cron/expire-intents'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      expiredCount: 0,
      deletedCount: 0,
      retentionDays: 90,
    });
  });

  it('returns 200 with large counts when many intents are deleted (bulk-delete branch, N>0)', async () => {
    mockIntent.count.mockResolvedValueOnce(5000);
    mockIntent.deleteMany.mockResolvedValueOnce({ count: 1234 });

    const res = await CRON_EXPIRE_INTENTS(makeReq('http://localhost/api/cron/expire-intents'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.expiredCount).toBe(5000);
    expect(body.deletedCount).toBe(1234);
  });

  it('clamps retentionDays=0 to a minimum of 1 day', async () => {
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents?retentionDays=0')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.retentionDays).toBe(1);
    const deleteWhere = mockIntent.deleteMany.mock.calls[0][0].where;
    const cutoff = (deleteWhere.expiresAt.lt as Date).getTime();
    const expected = Date.now() - 1 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(5000);
  });

  it('clamps a negative retentionDays to a minimum of 1 day', async () => {
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents?retentionDays=-30')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.retentionDays).toBe(1);
  });

  it('falls back to default 90-day retention when retentionDays is non-numeric', async () => {
    // Number('abc') = NaN. Math.max(1, NaN) = NaN. NaN is not finite → fall back to default 90.
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents?retentionDays=abc')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.retentionDays).toBe(90);
  });

  it('honors a custom retentionDays=7 query param', async () => {
    const res = await CRON_EXPIRE_INTENTS(
      makeReq('http://localhost/api/cron/expire-intents?retentionDays=7')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.retentionDays).toBe(7);

    const deleteWhere = mockIntent.deleteMany.mock.calls[0][0].where;
    const cutoff = (deleteWhere.expiresAt.lt as Date).getTime();
    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff - expected)).toBeLessThan(5000);
  });

  it('returns 500 when prisma.intent.count rejects', async () => {
    mockIntent.count.mockRejectedValueOnce(new Error('count timeout'));
    const res = await CRON_EXPIRE_INTENTS(makeReq('http://localhost/api/cron/expire-intents'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/cron failed/i);
  });

  it('returns 500 when prisma.intent.deleteMany rejects after a successful count', async () => {
    mockIntent.count.mockResolvedValueOnce(42);
    mockIntent.deleteMany.mockRejectedValueOnce(new Error('delete blocked'));
    const res = await CRON_EXPIRE_INTENTS(makeReq('http://localhost/api/cron/expire-intents'));
    expect(res.status).toBe(500);
  });
});

// =====================================================================================
// /api/cron/meetup-starting-soon
// =====================================================================================
describe('GET /api/cron/meetup-starting-soon — extended edge cases', () => {
  beforeEach(() => {
    // Re-arm defaults wiped by resetAllMocks
    mockMeetup.findMany.mockResolvedValue([]);
    mockNotification.findFirst.mockResolvedValue(null);
    mockNotification.create.mockResolvedValue({ id: 'notif-x' });
    mockBroadcast.mockResolvedValue(undefined);
    mockEmail.mockResolvedValue(undefined);
  });

  const inWindow = () => new Date(Date.now() + 60 * 60 * 1000);

  it('returns 500 when CRON_SECRET is unset and never queries meetups', async () => {
    delete process.env.CRON_SECRET;
    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon', { secret: null })
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/cron configuration/i);
    expect(mockMeetup.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization is absent', async () => {
    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon', { secret: null })
    );
    expect(res.status).toBe(401);
    expect(mockMeetup.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token mismatches', async () => {
    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon', { secret: 'wrong' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when raw secret is sent without "Bearer " prefix', async () => {
    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon', { rawAuth: SECRET })
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with all-zero metrics when no meetups match the time window', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([]);
    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon')
    );
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
    expect(mockNotification.create).not.toHaveBeenCalled();
  });

  it('processes a meetup that has zero GOING attendees without crashing', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([
      {
        id: 'm-empty',
        title: 'Lonely Meetup',
        scheduledAt: inWindow(),
        cancelled: false,
        venueName: 'Park',
        venue: null,
        host: { id: 'host-1', name: 'Host' },
        attendees: [], // nobody RSVPed yet
      },
    ]);

    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meetupsProcessed).toBe(1);
    expect(body.notificationsSent).toBe(0);
    expect(mockNotification.create).not.toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('falls back to meetup.venueName when venue is null', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([
      {
        id: 'm-vname',
        title: 'Bring Your Own Venue',
        scheduledAt: inWindow(),
        cancelled: false,
        venueName: 'Backyard BBQ',
        venue: null,
        host: { id: 'host-1', name: 'Alice' },
        attendees: [
          {
            id: 'a-1',
            userId: 'u-1',
            meetupId: 'm-vname',
            status: 'GOING',
            user: { id: 'u-1', email: 'u1@test.com', name: 'U1' },
          },
        ],
      },
    ]);

    await CRON_MEETUP_SOON(makeReq('http://localhost/api/cron/meetup-starting-soon'));

    expect(mockNotification.create).toHaveBeenCalledOnce();
    const created = mockNotification.create.mock.calls[0][0] as {
      data: { message: string };
    };
    expect(created.data.message).toContain('Backyard BBQ');
  });

  it('uses "TBA" venue label when both venue and venueName are null', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([
      {
        id: 'm-tba',
        title: 'Surprise Spot',
        scheduledAt: inWindow(),
        cancelled: false,
        venueName: null,
        venue: null,
        host: { id: 'host-1', name: 'Alice' },
        attendees: [
          {
            id: 'a-1',
            userId: 'u-1',
            meetupId: 'm-tba',
            status: 'GOING',
            user: { id: 'u-1', email: 'u1@test.com', name: 'U1' },
          },
        ],
      },
    ]);

    await CRON_MEETUP_SOON(makeReq('http://localhost/api/cron/meetup-starting-soon'));

    const created = mockNotification.create.mock.calls[0][0] as {
      data: { message: string };
    };
    expect(created.data.message).toContain('TBA');
  });

  it('falls back to "Your host" label when host.name is null', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([
      {
        id: 'm-noname',
        title: 'Anon Meetup',
        scheduledAt: inWindow(),
        cancelled: false,
        venueName: 'Pier 7',
        venue: null,
        host: { id: 'host-1', name: null },
        attendees: [
          {
            id: 'a-1',
            userId: 'u-1',
            meetupId: 'm-noname',
            status: 'GOING',
            user: { id: 'u-1', email: 'u1@test.com', name: 'Bob' },
          },
        ],
      },
    ]);

    await CRON_MEETUP_SOON(makeReq('http://localhost/api/cron/meetup-starting-soon'));

    expect(mockEmail).toHaveBeenCalledOnce();
    const params = mockEmail.mock.calls[0][0];
    expect(params.hostName).toBe('Your host');
  });

  it('falls back to "there" attendee name when user.name is null', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([
      {
        id: 'm-anon-att',
        title: 'Mystery Hike',
        scheduledAt: inWindow(),
        cancelled: false,
        venueName: 'Trailhead',
        venue: null,
        host: { id: 'host-1', name: 'Alice' },
        attendees: [
          {
            id: 'a-1',
            userId: 'u-1',
            meetupId: 'm-anon-att',
            status: 'GOING',
            user: { id: 'u-1', email: 'u1@test.com', name: null },
          },
        ],
      },
    ]);

    await CRON_MEETUP_SOON(makeReq('http://localhost/api/cron/meetup-starting-soon'));

    const params = mockEmail.mock.calls[0][0];
    expect(params.attendeeName).toBe('there');
  });

  it('skips already-notified attendees and increments skippedAlreadyNotified', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([
      {
        id: 'm-dup',
        title: 'Already Reminded',
        scheduledAt: inWindow(),
        cancelled: false,
        venueName: 'Cafe',
        venue: null,
        host: { id: 'host-1', name: 'Alice' },
        attendees: [
          {
            id: 'a-1',
            userId: 'u-1',
            meetupId: 'm-dup',
            status: 'GOING',
            user: { id: 'u-1', email: 'u1@test.com', name: 'U1' },
          },
        ],
      },
    ]);
    mockNotification.findFirst.mockResolvedValueOnce({
      id: 'existing',
      userId: 'u-1',
      type: 'MEETUP_STARTING_SOON',
    });

    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon')
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.skippedAlreadyNotified).toBe(1);
    expect(body.notificationsSent).toBe(0);
    expect(mockNotification.create).not.toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma.meetup.findMany rejects (graceful 500 path)', async () => {
    mockMeetup.findMany.mockRejectedValueOnce(new Error('connection reset'));
    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon')
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/failed/i);
    expect(mockNotification.create).not.toHaveBeenCalled();
  });

  it('returns 500 when notification.findFirst rejects mid-loop', async () => {
    mockMeetup.findMany.mockResolvedValueOnce([
      {
        id: 'm-err',
        title: 'Boom',
        scheduledAt: inWindow(),
        cancelled: false,
        venueName: 'Anywhere',
        venue: null,
        host: { id: 'host-1', name: 'Alice' },
        attendees: [
          {
            id: 'a-1',
            userId: 'u-1',
            meetupId: 'm-err',
            status: 'GOING',
            user: { id: 'u-1', email: 'u1@test.com', name: 'U1' },
          },
        ],
      },
    ]);
    mockNotification.findFirst.mockRejectedValueOnce(new Error('idempotency lookup failed'));

    const res = await CRON_MEETUP_SOON(
      makeReq('http://localhost/api/cron/meetup-starting-soon')
    );
    expect(res.status).toBe(500);
  });
});
