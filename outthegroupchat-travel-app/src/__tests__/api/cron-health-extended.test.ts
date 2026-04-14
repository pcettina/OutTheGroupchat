/**
 * Extended tests for /api/cron and /api/health routes.
 *
 * Cron coverage: CRON_SECRET auth edge cases, all job branches (expired
 * invitations, surveys, voting sessions, survey reminders, trip status
 * updates), null-trip survey path, multi-item scenarios, error propagation
 * from mid-job DB failures.
 *
 * Health coverage: connected state (200/ok/connected), degraded state
 * (503/degraded/error), timestamp ISO-8601 format, response shape, DB
 * timeout simulation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Local prisma mock — includes $queryRaw needed by /api/health.
// The global setup.ts mock does not include $queryRaw, so we override it here.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    trip: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    tripInvitation: {
      updateMany: vi.fn(),
    },
    tripSurvey: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
    },
    votingSession: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    tripMember: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  aiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  dbLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { prisma } from '@/lib/prisma';
import { GET as cronGET } from '@/app/api/cron/route';
import { GET as healthGET } from '@/app/api/health/route';

// ---------------------------------------------------------------------------
// Typed accessor helpers for the cron route
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;

const mockTripInvitation = () =>
  (prisma as unknown as { tripInvitation: { updateMany: MockFn } }).tripInvitation;

const mockTripSurvey = () =>
  (prisma as unknown as { tripSurvey: { findMany: MockFn; update: MockFn } }).tripSurvey;

const mockTrip = () =>
  (prisma as unknown as { trip: { findUnique: MockFn; updateMany: MockFn } }).trip;

const mockNotification = () =>
  (prisma as unknown as {
    notification: { create: MockFn; findFirst: MockFn; createMany: MockFn };
  }).notification;

const mockVotingSession = () =>
  (prisma as unknown as { votingSession: { findMany: MockFn; update: MockFn } }).votingSession;

const mockTripMember = () =>
  (prisma as unknown as { tripMember: { findMany: MockFn } }).tripMember;

const mockQueryRaw = () =>
  (prisma as unknown as { $queryRaw: MockFn }).$queryRaw;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeCronRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['authorization'] = authHeader;
  }
  return new NextRequest('http://localhost/api/cron', { method: 'GET', headers });
}

function makeHealthRequest(): NextRequest {
  return new NextRequest('http://localhost/api/health', { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Helper: set up a complete happy-path cron run (no items to process)
// ---------------------------------------------------------------------------
function setupHappyPathMocks() {
  mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
  mockTripSurvey().findMany.mockResolvedValueOnce([]); // expired surveys
  mockVotingSession().findMany.mockResolvedValueOnce([]); // expired voting sessions
  mockTripSurvey().findMany.mockResolvedValueOnce([]); // upcoming expiry reminders
  mockTrip().updateMany.mockResolvedValueOnce({ count: 0 }); // BOOKED → IN_PROGRESS
  mockTrip().updateMany.mockResolvedValueOnce({ count: 0 }); // IN_PROGRESS → COMPLETED
}

// ===========================================================================
// CRON extended tests
// ===========================================================================
describe('GET /api/cron — extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // Auth edge cases
  // -------------------------------------------------------------------------
  describe('authentication', () => {
    it('returns 500 when CRON_SECRET is an empty string', async () => {
      vi.stubEnv('CRON_SECRET', '');
      const res = await cronGET(makeCronRequest('Bearer '));
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.error).toMatch(/CRON_SECRET/i);
    });

    it('returns 401 when Authorization header uses wrong case prefix (bearer)', async () => {
      vi.stubEnv('CRON_SECRET', 'my-secret');
      // "bearer" (lowercase) — does not match "Bearer my-secret"
      const res = await cronGET(makeCronRequest('bearer my-secret'));
      const body = await res.json();
      expect(res.status).toBe(401);
      expect(body.error).toMatch(/unauthorized/i);
    });

    it('returns 401 when Authorization header contains extra whitespace around token', async () => {
      vi.stubEnv('CRON_SECRET', 'my-secret');
      const res = await cronGET(makeCronRequest('Bearer  my-secret'));
      const body = await res.json();
      expect(res.status).toBe(401);
    });

    it('returns 400 when Authorization header is an empty string', async () => {
      vi.stubEnv('CRON_SECRET', 'my-secret');
      const res = await cronGET(makeCronRequest(''));
      const body = await res.json();
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Expired invitations job
  // -------------------------------------------------------------------------
  describe('job: expire invitations', () => {
    it('reports count from prisma.tripInvitation.updateMany in results', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');
      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 12 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([]);
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.results.expiredInvitations).toBe(12);
    });

    it('calls updateMany with status PENDING → EXPIRED and expiresAt lt filter', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');
      setupHappyPathMocks();

      await cronGET(makeCronRequest('Bearer secret'));

      const [callArgs] = mockTripInvitation().updateMany.mock.calls as [
        { where: { status: string; expiresAt: { lt: Date } }; data: { status: string } }
      ][];
      expect(callArgs[0].where.status).toBe('PENDING');
      expect(callArgs[0].data.status).toBe('EXPIRED');
      expect(callArgs[0].where.expiresAt.lt).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // Expired surveys job
  // -------------------------------------------------------------------------
  describe('job: close expired surveys', () => {
    it('skips notification when trip.findUnique returns null', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      // One expired survey but its trip no longer exists
      mockTripSurvey().findMany.mockResolvedValueOnce([{ id: 'survey-orphan', tripId: 'trip-gone' }]);
      mockTripSurvey().update.mockResolvedValueOnce({ id: 'survey-orphan', status: 'CLOSED' });
      mockTrip().findUnique.mockResolvedValueOnce(null); // trip not found
      mockVotingSession().findMany.mockResolvedValueOnce([]);
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.results.closedSurveys).toBe(1);
      // No notification should have been created when trip is null
      expect(mockNotification().create).not.toHaveBeenCalled();
    });

    it('closes multiple expired surveys and creates a notification for each', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      const surveys = [
        { id: 'survey-a', tripId: 'trip-a' },
        { id: 'survey-b', tripId: 'trip-b' },
      ];

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce(surveys);
      // survey-a
      mockTripSurvey().update.mockResolvedValueOnce({ id: 'survey-a', status: 'CLOSED' });
      mockTrip().findUnique.mockResolvedValueOnce({ ownerId: 'owner-a', title: 'Trip A' });
      mockNotification().create.mockResolvedValueOnce({ id: 'notif-a' });
      // survey-b
      mockTripSurvey().update.mockResolvedValueOnce({ id: 'survey-b', status: 'CLOSED' });
      mockTrip().findUnique.mockResolvedValueOnce({ ownerId: 'owner-b', title: 'Trip B' });
      mockNotification().create.mockResolvedValueOnce({ id: 'notif-b' });

      mockVotingSession().findMany.mockResolvedValueOnce([]);
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.results.closedSurveys).toBe(2);
      expect(mockTripSurvey().update).toHaveBeenCalledTimes(2);
      expect(mockNotification().create).toHaveBeenCalledTimes(2);
    });

    it('returns 500 when tripSurvey.update throws during survey close loop', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([{ id: 'survey-x', tripId: 'trip-x' }]);
      mockTripSurvey().update.mockRejectedValueOnce(new Error('DB write failed'));

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/failed/i);
    });
  });

  // -------------------------------------------------------------------------
  // Expired voting sessions job
  // -------------------------------------------------------------------------
  describe('job: close expired voting sessions', () => {
    it('sends zero notifications when a voting session has no members', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([
        { id: 'vs-empty', tripId: 'trip-empty', title: 'Empty Vote' },
      ]);
      mockVotingSession().update.mockResolvedValueOnce({ id: 'vs-empty', status: 'CLOSED' });
      mockTripMember().findMany.mockResolvedValueOnce([]); // no members
      mockNotification().createMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.results.closedVotingSessions).toBe(1);
      expect(body.results.notificationsSent).toBe(0);
    });

    it('accumulates notificationsSent across multiple voting sessions', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([
        { id: 'vs-1', tripId: 'trip-1', title: 'Vote 1' },
        { id: 'vs-2', tripId: 'trip-2', title: 'Vote 2' },
      ]);
      // Session 1 — 3 members
      mockVotingSession().update.mockResolvedValueOnce({ id: 'vs-1', status: 'CLOSED' });
      mockTripMember().findMany.mockResolvedValueOnce([
        { userId: 'u1' },
        { userId: 'u2' },
        { userId: 'u3' },
      ]);
      mockNotification().createMany.mockResolvedValueOnce({ count: 3 });
      // Session 2 — 2 members
      mockVotingSession().update.mockResolvedValueOnce({ id: 'vs-2', status: 'CLOSED' });
      mockTripMember().findMany.mockResolvedValueOnce([{ userId: 'u4' }, { userId: 'u5' }]);
      mockNotification().createMany.mockResolvedValueOnce({ count: 2 });

      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.results.closedVotingSessions).toBe(2);
      expect(body.results.notificationsSent).toBe(5); // 3 + 2
    });

    it('returns 500 when votingSession.update throws during close loop', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([
        { id: 'vs-bad', tripId: 'trip-x', title: 'Bad Session' },
      ]);
      mockVotingSession().update.mockRejectedValueOnce(new Error('Voting session update error'));

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
    });

    it('includes notification data with correct tripId and votingSessionId', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      const session = { id: 'vs-data', tripId: 'trip-data', title: 'Data Vote' };

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([session]);
      mockVotingSession().update.mockResolvedValueOnce({ ...session, status: 'CLOSED' });
      mockTripMember().findMany.mockResolvedValueOnce([{ userId: 'member-x' }]);
      mockNotification().createMany.mockResolvedValueOnce({ count: 1 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      await cronGET(makeCronRequest('Bearer secret'));

      const [createManyArgs] = mockNotification().createMany.mock.calls as [
        { data: Array<{ userId: string; type: string; data: { tripId: string; votingSessionId: string } }> }
      ][];
      const notifData = createManyArgs[0].data[0];
      expect(notifData.userId).toBe('member-x');
      expect(notifData.type).toBe('VOTE_REMINDER');
      expect(notifData.data.tripId).toBe('trip-data');
      expect(notifData.data.votingSessionId).toBe('vs-data');
    });
  });

  // -------------------------------------------------------------------------
  // Survey reminders job (24h before expiry)
  // -------------------------------------------------------------------------
  describe('job: survey expiry reminders', () => {
    it('does not send reminder when member has already responded', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      const survey = {
        id: 'survey-remind',
        tripId: 'trip-remind',
        trip: {
          title: 'Reminder Trip',
          members: [{ userId: 'member-responded' }],
        },
        responses: [{ userId: 'member-responded' }], // already responded
      };

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]); // no expired surveys
      mockVotingSession().findMany.mockResolvedValueOnce([]);
      mockTripSurvey().findMany.mockResolvedValueOnce([survey]); // upcoming expiry
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      // Member already responded — no reminder notification
      expect(mockNotification().findFirst).not.toHaveBeenCalled();
      expect(mockNotification().create).not.toHaveBeenCalled();
    });

    it('does not send reminder when notification.findFirst returns an existing reminder', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      const survey = {
        id: 'survey-already-reminded',
        tripId: 'trip-ar',
        trip: {
          title: 'Already Reminded Trip',
          members: [{ userId: 'member-pending' }],
        },
        responses: [], // has not responded
      };

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([]);
      mockTripSurvey().findMany.mockResolvedValueOnce([survey]);
      // Existing reminder found for this member
      mockNotification().findFirst.mockResolvedValueOnce({ id: 'existing-reminder' });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.results.notificationsSent).toBe(0);
      expect(mockNotification().create).not.toHaveBeenCalled();
    });

    it('sends reminder when member has not responded and no prior reminder exists', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      const survey = {
        id: 'survey-needs-remind',
        tripId: 'trip-nr',
        trip: {
          title: 'Needs Reminder Trip',
          members: [{ userId: 'member-no-response' }],
        },
        responses: [], // no responses at all
      };

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([]);
      mockTripSurvey().findMany.mockResolvedValueOnce([survey]);
      mockNotification().findFirst.mockResolvedValueOnce(null); // no prior reminder
      mockNotification().create.mockResolvedValueOnce({ id: 'new-reminder' });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.results.notificationsSent).toBe(1);
      expect(mockNotification().create).toHaveBeenCalledOnce();
      const [createArgs] = mockNotification().create.mock.calls as [
        { data: { userId: string; type: string; title: string; data: { surveyId: string } } }
      ][];
      expect(createArgs[0].data.userId).toBe('member-no-response');
      expect(createArgs[0].data.type).toBe('SURVEY_REMINDER');
      expect(createArgs[0].data.data.surveyId).toBe('survey-needs-remind');
    });
  });

  // -------------------------------------------------------------------------
  // Trip status update job
  // -------------------------------------------------------------------------
  describe('job: trip status updates', () => {
    it('calls trip.updateMany twice — BOOKED→IN_PROGRESS and IN_PROGRESS→COMPLETED', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');
      setupHappyPathMocks();

      await cronGET(makeCronRequest('Bearer secret'));

      expect(mockTrip().updateMany).toHaveBeenCalledTimes(2);
      const calls = mockTrip().updateMany.mock.calls as [
        { where: { status: string }; data: { status: string } }
      ][];
      const [firstCall, secondCall] = calls;
      expect(firstCall[0].where.status).toBe('BOOKED');
      expect(firstCall[0].data.status).toBe('IN_PROGRESS');
      expect(secondCall[0].where.status).toBe('IN_PROGRESS');
      expect(secondCall[0].data.status).toBe('COMPLETED');
    });

    it('returns 500 when trip.updateMany throws for BOOKED→IN_PROGRESS step', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');

      mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockVotingSession().findMany.mockResolvedValueOnce([]);
      mockTripSurvey().findMany.mockResolvedValueOnce([]);
      mockTrip().updateMany.mockRejectedValueOnce(new Error('Trip update failed'));

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/failed/i);
    });
  });

  // -------------------------------------------------------------------------
  // Response shape
  // -------------------------------------------------------------------------
  describe('response shape', () => {
    it('returns all four result keys in a successful run', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');
      setupHappyPathMocks();

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('message');
      expect(body.results).toHaveProperty('expiredInvitations');
      expect(body.results).toHaveProperty('closedSurveys');
      expect(body.results).toHaveProperty('closedVotingSessions');
      expect(body.results).toHaveProperty('notificationsSent');
    });

    it('all result counts are non-negative integers on a clean run', async () => {
      vi.stubEnv('CRON_SECRET', 'secret');
      setupHappyPathMocks();

      const res = await cronGET(makeCronRequest('Bearer secret'));
      const body = await res.json();
      const r = body.results;

      expect(r.expiredInvitations).toBeGreaterThanOrEqual(0);
      expect(r.closedSurveys).toBeGreaterThanOrEqual(0);
      expect(r.closedVotingSessions).toBeGreaterThanOrEqual(0);
      expect(r.notificationsSent).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(r.expiredInvitations)).toBe(true);
      expect(Number.isInteger(r.closedSurveys)).toBe(true);
      expect(Number.isInteger(r.closedVotingSessions)).toBe(true);
      expect(Number.isInteger(r.notificationsSent)).toBe(true);
    });
  });
});

// ===========================================================================
// HEALTH extended tests
// ===========================================================================
describe('GET /api/health — extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // DB connected
  // -------------------------------------------------------------------------
  describe('database connected', () => {
    it('returns 200 when prisma.$queryRaw resolves', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const res = await healthGET();

      expect(res.status).toBe(200);
    });

    it('returns status "ok" when database is connected', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const res = await healthGET();
      const body = await res.json();

      expect(body.status).toBe('ok');
    });

    it('returns database "connected" when $queryRaw resolves', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const res = await healthGET();
      const body = await res.json();

      expect(body.database).toBe('connected');
    });

    it('includes a timestamp field in the response', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const res = await healthGET();
      const body = await res.json();

      expect(body).toHaveProperty('timestamp');
    });
  });

  // -------------------------------------------------------------------------
  // DB error / degraded state
  // -------------------------------------------------------------------------
  describe('database error / degraded', () => {
    it('returns 503 when prisma.$queryRaw rejects', async () => {
      mockQueryRaw().mockRejectedValueOnce(new Error('Connection timeout'));

      const res = await healthGET();

      expect(res.status).toBe(503);
    });

    it('returns status "degraded" when $queryRaw rejects', async () => {
      mockQueryRaw().mockRejectedValueOnce(new Error('DB unreachable'));

      const res = await healthGET();
      const body = await res.json();

      expect(body.status).toBe('degraded');
    });

    it('returns database "error" when $queryRaw rejects', async () => {
      mockQueryRaw().mockRejectedValueOnce(new Error('ETIMEDOUT'));

      const res = await healthGET();
      const body = await res.json();

      expect(body.database).toBe('error');
    });

    it('still returns a timestamp even in the degraded state', async () => {
      mockQueryRaw().mockRejectedValueOnce(new Error('Timeout'));

      const res = await healthGET();
      const body = await res.json();

      expect(body).toHaveProperty('timestamp');
      expect(typeof body.timestamp).toBe('string');
    });

    it('simulates DB timeout: $queryRaw rejects after delay and still returns 503', async () => {
      // Simulate a slow DB that eventually rejects
      mockQueryRaw().mockImplementationOnce(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 100ms')), 10)),
      );

      const res = await healthGET();
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.database).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // Timestamp format
  // -------------------------------------------------------------------------
  describe('timestamp format', () => {
    it('timestamp is a valid ISO 8601 date string', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const before = new Date().toISOString();
      const res = await healthGET();
      const after = new Date().toISOString();
      const body = await res.json();

      const ts = body.timestamp;
      expect(typeof ts).toBe('string');
      // Verify it parses to a valid date
      const parsed = new Date(ts);
      expect(isNaN(parsed.getTime())).toBe(false);
      // Verify it is within the test window
      expect(ts >= before).toBe(true);
      expect(ts <= after).toBe(true);
    });

    it('timestamp matches ISO 8601 pattern (YYYY-MM-DDTHH:mm:ss.sssZ)', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const res = await healthGET();
      const body = await res.json();

      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      expect(body.timestamp).toMatch(isoPattern);
    });

    it('degraded state timestamp is also a valid ISO 8601 date string', async () => {
      mockQueryRaw().mockRejectedValueOnce(new Error('DB gone'));

      const res = await healthGET();
      const body = await res.json();

      const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      expect(body.timestamp).toMatch(isoPattern);
    });
  });

  // -------------------------------------------------------------------------
  // Response shape
  // -------------------------------------------------------------------------
  describe('response shape', () => {
    it('response has exactly status, timestamp, and database keys (no extra fields)', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const res = await healthGET();
      const body = await res.json();

      const keys = Object.keys(body).sort();
      expect(keys).toEqual(['database', 'status', 'timestamp']);
    });

    it('degraded response has exactly status, timestamp, and database keys', async () => {
      mockQueryRaw().mockRejectedValueOnce(new Error('Oops'));

      const res = await healthGET();
      const body = await res.json();

      const keys = Object.keys(body).sort();
      expect(keys).toEqual(['database', 'status', 'timestamp']);
    });

    it('status is always a string', async () => {
      mockQueryRaw().mockResolvedValueOnce([{ 1: 1 }]);

      const res = await healthGET();
      const body = await res.json();

      expect(typeof body.status).toBe('string');
    });
  });
});
