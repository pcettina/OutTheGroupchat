import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before imports.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tripInvitation: {
      updateMany: vi.fn(),
    },
    tripSurvey: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    trip: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
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
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/cron/route';

// ---------------------------------------------------------------------------
// Typed accessor helpers
// ---------------------------------------------------------------------------
type PrismaTripInvitationMock = { updateMany: ReturnType<typeof vi.fn> };
type PrismaTripSurveyMock = { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
type PrismaTripMock = { findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
type PrismaNotificationMock = {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
};
type PrismaVotingSessionMock = { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
type PrismaTripMemberMock = { findMany: ReturnType<typeof vi.fn> };

const mockTripInvitation = () =>
  (prisma as unknown as { tripInvitation: PrismaTripInvitationMock }).tripInvitation;
const mockTripSurvey = () =>
  (prisma as unknown as { tripSurvey: PrismaTripSurveyMock }).tripSurvey;
const mockTrip = () =>
  (prisma as unknown as { trip: PrismaTripMock }).trip;
const mockNotification = () =>
  (prisma as unknown as { notification: PrismaNotificationMock }).notification;
const mockVotingSession = () =>
  (prisma as unknown as { votingSession: PrismaVotingSessionMock }).votingSession;
const mockTripMember = () =>
  (prisma as unknown as { tripMember: PrismaTripMemberMock }).tripMember;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['authorization'] = authHeader;
  }
  return new NextRequest('http://localhost/api/cron', { method: 'GET', headers });
}

// ---------------------------------------------------------------------------
// Default happy-path mock setup: no expired items, no upcoming surveys
// ---------------------------------------------------------------------------
function setupHappyPathMocks() {
  // 1. Expire invitations — 0 expired
  mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
  // 2. Close expired surveys — none
  mockTripSurvey().findMany.mockResolvedValueOnce([]);
  // 3. Close expired voting sessions — none
  mockVotingSession().findMany.mockResolvedValueOnce([]);
  // 4. Expiring surveys (within 24h) — none
  mockTripSurvey().findMany.mockResolvedValueOnce([]);
  // 5. Update trip statuses — BOOKED → IN_PROGRESS
  mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
  // 6. Update trip statuses — IN_PROGRESS → COMPLETED
  mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // 1. CRON_SECRET not configured → 500
  // -------------------------------------------------------------------------
  it('returns 500 when CRON_SECRET env var is not set', async () => {
    delete process.env.CRON_SECRET;

    const res = await GET(makeRequest('Bearer some-secret'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/CRON_SECRET/i);
  });

  // -------------------------------------------------------------------------
  // 2. No Authorization header → 401
  // -------------------------------------------------------------------------
  it('returns 401 when Authorization header is missing', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
  });

  // -------------------------------------------------------------------------
  // 3. Wrong secret in Authorization header → 401
  // -------------------------------------------------------------------------
  it('returns 401 when Authorization header has wrong secret', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret');

    const res = await GET(makeRequest('Bearer wrong-secret'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
  });

  // -------------------------------------------------------------------------
  // 4. Missing "Bearer " prefix (bare token) → 401
  // -------------------------------------------------------------------------
  it('returns 401 when Authorization header omits the "Bearer " prefix', async () => {
    vi.stubEnv('CRON_SECRET', 'my-secret');

    const res = await GET(makeRequest('my-secret'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/unauthorized/i);
  });

  // -------------------------------------------------------------------------
  // 5. Valid secret → 200 with success and results payload
  // -------------------------------------------------------------------------
  it('returns 200 with success and results when CRON_SECRET matches', async () => {
    vi.stubEnv('CRON_SECRET', 'valid-secret');
    setupHappyPathMocks();

    const res = await GET(makeRequest('Bearer valid-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/completed/i);
    expect(body.results).toMatchObject({
      expiredInvitations: expect.any(Number),
      closedSurveys: expect.any(Number),
      closedVotingSessions: expect.any(Number),
      notificationsSent: expect.any(Number),
    });
  });

  // -------------------------------------------------------------------------
  // 6. Valid secret → prisma.tripInvitation.updateMany called
  // -------------------------------------------------------------------------
  it('calls prisma.tripInvitation.updateMany to expire pending invitations', async () => {
    vi.stubEnv('CRON_SECRET', 'valid-secret');
    setupHappyPathMocks();

    await GET(makeRequest('Bearer valid-secret'));

    expect(mockTripInvitation().updateMany).toHaveBeenCalledOnce();
    const call = mockTripInvitation().updateMany.mock.calls[0][0] as {
      where: { status: string };
      data: { status: string };
    };
    expect(call.where.status).toBe('PENDING');
    expect(call.data.status).toBe('EXPIRED');
  });

  // -------------------------------------------------------------------------
  // 7. Expired surveys → closed and notification created for trip owner
  // -------------------------------------------------------------------------
  it('closes expired surveys and creates a notification for each trip owner', async () => {
    vi.stubEnv('CRON_SECRET', 'valid-secret');

    const expiredSurvey = { id: 'survey-1', tripId: 'trip-1' };
    const tripOwner = { ownerId: 'owner-user-1', title: 'Paris Trip' };

    // Step 1: expire invitations
    mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
    // Step 2: expired surveys — one found
    mockTripSurvey().findMany.mockResolvedValueOnce([expiredSurvey]);
    // Step 2a: close the survey
    mockTripSurvey().update.mockResolvedValueOnce({ ...expiredSurvey, status: 'CLOSED' });
    // Step 2b: find the trip to notify owner
    mockTrip().findUnique.mockResolvedValueOnce(tripOwner);
    // Step 2c: create notification
    mockNotification().create.mockResolvedValueOnce({ id: 'notif-1' });
    // Step 3: expired voting sessions — none
    mockVotingSession().findMany.mockResolvedValueOnce([]);
    // Step 4: expiring surveys (within 24h) — none
    mockTripSurvey().findMany.mockResolvedValueOnce([]);
    // Step 5 & 6: trip status updates
    mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await GET(makeRequest('Bearer valid-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.closedSurveys).toBe(1);
    expect(mockTripSurvey().update).toHaveBeenCalledOnce();
    expect(mockNotification().create).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 8. Expired voting sessions → closed and notifications sent to trip members
  // -------------------------------------------------------------------------
  it('closes expired voting sessions and sends notifications to all trip members', async () => {
    vi.stubEnv('CRON_SECRET', 'valid-secret');

    const expiredSession = { id: 'vs-1', tripId: 'trip-2', title: 'Vote on Hotels' };
    const members = [{ userId: 'member-1' }, { userId: 'member-2' }];

    // Step 1: expire invitations
    mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 0 });
    // Step 2: expired surveys — none
    mockTripSurvey().findMany.mockResolvedValueOnce([]);
    // Step 3: expired voting sessions — one found
    mockVotingSession().findMany.mockResolvedValueOnce([expiredSession]);
    // Step 3a: close the voting session
    mockVotingSession().update.mockResolvedValueOnce({ ...expiredSession, status: 'CLOSED' });
    // Step 3b: get trip members
    mockTripMember().findMany.mockResolvedValueOnce(members);
    // Step 3c: createMany notifications
    mockNotification().createMany.mockResolvedValueOnce({ count: 2 });
    // Step 4: expiring surveys (within 24h) — none
    mockTripSurvey().findMany.mockResolvedValueOnce([]);
    // Step 5 & 6: trip status updates
    mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await GET(makeRequest('Bearer valid-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.closedVotingSessions).toBe(1);
    expect(body.results.notificationsSent).toBe(2);
    expect(mockNotification().createMany).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 9. DB throws on tripInvitation.updateMany → returns 500
  // -------------------------------------------------------------------------
  it('returns 500 when a database operation throws an unexpected error', async () => {
    vi.stubEnv('CRON_SECRET', 'valid-secret');

    mockTripInvitation().updateMany.mockRejectedValueOnce(new Error('DB connection reset'));

    const res = await GET(makeRequest('Bearer valid-secret'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/failed/i);
  });

  // -------------------------------------------------------------------------
  // 10. Valid run: results.expiredInvitations reflects count from DB
  // -------------------------------------------------------------------------
  it('results.expiredInvitations reflects the count returned by prisma', async () => {
    vi.stubEnv('CRON_SECRET', 'valid-secret');

    // 5 invitations expired this run
    mockTripInvitation().updateMany.mockResolvedValueOnce({ count: 5 });
    mockTripSurvey().findMany.mockResolvedValueOnce([]);
    mockVotingSession().findMany.mockResolvedValueOnce([]);
    mockTripSurvey().findMany.mockResolvedValueOnce([]);
    mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });
    mockTrip().updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await GET(makeRequest('Bearer valid-secret'));
    const body = await res.json();

    expect(body.results.expiredInvitations).toBe(5);
  });
});
