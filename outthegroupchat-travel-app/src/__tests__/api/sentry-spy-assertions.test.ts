/**
 * Sentry captureException spy-assertion tests.
 *
 * Purpose
 * -------
 * Verify the current Sentry instrumentation state for four route groups:
 *   - GET /api/trips + POST /api/trips
 *   - GET /api/trips/[tripId] + PATCH /api/trips/[tripId] + DELETE /api/trips/[tripId]
 *   - GET /api/feed
 *   - GET /api/notifications + PATCH /api/notifications
 *
 * Each test uses vi.mocked(captureException) to assert whether Sentry
 * captureException was (or was not) invoked during a handler call.
 *
 * Current implementation state
 * ----------------------------
 * As of this writing, none of the four route files import or call
 * captureException — they use logError/logger.error instead. The tests below
 * reflect this reality: captureException is NOT called on any path (happy or
 * error). These tests serve as a regression guard — if a future change
 * accidentally wires or un-wires Sentry on these routes, these tests will
 * catch the change.
 *
 * NOTE: setup.ts does not yet contain a global vi.mock('@/lib/sentry'), so
 * the mock is declared here. It MUST come before the route handler imports
 * so that Vitest hoists it correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Sentry stub — must be declared before route handler imports so hoisting works
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  init: vi.fn(),
}));

// Rate-limit stub — prevents live Redis calls
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Feed route needs extra Prisma models not in the global mock
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      trip: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      tripMember: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      notification: {
        findMany: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
      follow: {
        findMany: vi.fn(),
      },
      activity: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      activityRating: {
        findMany: vi.fn(),
      },
      savedActivity: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Route handler imports (static — after mock declarations)
// ---------------------------------------------------------------------------
import { GET as tripsGET, POST as tripsPOST } from '@/app/api/trips/route';
import {
  GET as tripByIdGET,
  PATCH as tripByIdPATCH,
  DELETE as tripByIdDELETE,
} from '@/app/api/trips/[tripId]/route';
import { GET as feedGET } from '@/app/api/feed/route';
import { GET as notificationsGET, PATCH as notificationsPATCH } from '@/app/api/notifications/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockCaptureException = vi.mocked(captureException);

const mockPrismaTrip = prisma.trip as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockPrismaTripMember = prisma.tripMember as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

const mockPrismaNotification = prisma.notification as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

const mockPrismaFollow = prisma.follow as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaActivity = prisma.activity as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaActivityRating = prisma.activityRating as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockPrismaSavedActivity = prisma.savedActivity as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-sentry-spy-001';
const MOCK_TRIP_ID = 'trip-sentry-spy-001';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Sentry Test User', email: 'sentry@test.com' },
  expires: '2099-01-01',
};

const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Sentry Test Trip',
  description: null,
  destination: { city: 'Tokyo', country: 'Japan' },
  startDate: new Date('2026-08-01'),
  endDate: new Date('2026-08-14'),
  status: 'PLANNING',
  isPublic: true,
  ownerId: MOCK_USER_ID,
  viewCount: 0,
  coverImage: null,
  budget: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  owner: { id: MOCK_USER_ID, name: 'Sentry Test User', image: null },
  members: [{ userId: MOCK_USER_ID, role: 'OWNER', user: { id: MOCK_USER_ID, name: 'Sentry Test User', image: null } }],
  activities: [],
  survey: null,
  itinerary: [],
  invitations: [],
  _count: { members: 1, activities: 0 },
};

const MOCK_NOTIFICATION = {
  id: 'notif-sentry-001',
  userId: MOCK_USER_ID,
  type: 'TRIP_INVITE',
  title: 'You have been invited',
  message: 'Join the trip',
  read: false,
  actionUrl: null,
  createdAt: new Date('2026-01-01'),
};

/** Build a minimal NextRequest for GET endpoints. */
function makeGetRequest(url = 'http://localhost/api/test'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

/** Build a NextRequest with a JSON body. */
function makeJsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// beforeEach — clear mocks between tests (preserves factory mock implementations)
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. trips/route.ts — GET /api/trips
// ===========================================================================
describe('GET /api/trips — Sentry captureException spy', () => {
  it('happy path: returns 200 with trips — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_TRIP]);

    const req = makeGetRequest('http://localhost/api/trips');
    const res = await tripsGET(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('happy path: returns 200 with empty trips array — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockResolvedValueOnce([]);

    const req = makeGetRequest('http://localhost/api/trips');
    const res = await tripsGET(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns 401 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeGetRequest('http://localhost/api/trips');
    const res = await tripsGET(req);

    expect(res.status).toBe(401);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.trip.findMany throws — returns 500 — captureException called (L4 added Sentry instrumentation)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeGetRequest('http://localhost/api/trips');
    const res = await tripsGET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route now calls captureException in catch block (added 2026-04-15)
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('error path: getServerSession throws — returns 500 — captureException called', async () => {
    mockGetServerSession.mockRejectedValueOnce(new Error('Auth service unavailable'));

    const req = makeGetRequest('http://localhost/api/trips');
    const res = await tripsGET(req);

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 2. trips/route.ts — POST /api/trips
// ===========================================================================
describe('POST /api/trips — Sentry captureException spy', () => {
  const VALID_TRIP_BODY = {
    title: 'Tokyo Adventure',
    destination: { city: 'Tokyo', country: 'Japan' },
    startDate: '2026-08-01',
    endDate: '2026-08-14',
  };

  it('happy path: returns 201 with created trip — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.create.mockResolvedValueOnce(MOCK_TRIP);

    const req = makeJsonRequest('http://localhost/api/trips', 'POST', VALID_TRIP_BODY);
    const res = await tripsPOST(req);

    expect(res.status).toBe(201);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns 401 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeJsonRequest('http://localhost/api/trips', 'POST', VALID_TRIP_BODY);
    const res = await tripsPOST(req);

    expect(res.status).toBe(401);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('invalid body: returns 400 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeJsonRequest('http://localhost/api/trips', 'POST', { title: '' });
    const res = await tripsPOST(req);

    expect(res.status).toBe(400);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.trip.create throws — returns 500 — captureException called (L4 added Sentry instrumentation)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.create.mockRejectedValueOnce(new Error('Unique constraint failed'));

    const req = makeJsonRequest('http://localhost/api/trips', 'POST', VALID_TRIP_BODY);
    const res = await tripsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route now calls captureException in catch block (added 2026-04-15)
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('error path: getServerSession throws — returns 500 — captureException called', async () => {
    mockGetServerSession.mockRejectedValueOnce(new Error('Auth service unavailable'));

    const req = makeJsonRequest('http://localhost/api/trips', 'POST', VALID_TRIP_BODY);
    const res = await tripsPOST(req);

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 3. trips/[tripId]/route.ts — GET /api/trips/[tripId]
// ===========================================================================
describe('GET /api/trips/[tripId] — Sentry captureException spy', () => {
  const makeParams = (tripId = MOCK_TRIP_ID) =>
    ({ params: Promise.resolve({ tripId }) } as { params: Promise<{ tripId: string }> });

  it('happy path (public trip, no auth): returns 200 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams());

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('happy path (authenticated owner): returns 200 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    // view count update for public trip when user is not owner — here user IS owner so no update

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams());

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('trip not found: returns 404 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams());

    expect(res.status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('private trip, wrong user: returns 401 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'different-user', name: 'Other', email: 'other@test.com' },
      expires: '2099-01-01',
    });
    const privateTrip = { ...MOCK_TRIP, isPublic: false, ownerId: MOCK_USER_ID, members: [] };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(privateTrip);

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams());

    expect(res.status).toBe(401);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.trip.findUnique throws — returns 500 — captureException NOT called (bare catch used)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB query failed'));

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route uses bare catch {} with no Sentry call
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. trips/[tripId]/route.ts — PATCH /api/trips/[tripId]
// ===========================================================================
describe('PATCH /api/trips/[tripId] — Sentry captureException spy', () => {
  const makeParams = (tripId = MOCK_TRIP_ID) =>
    ({ params: Promise.resolve({ tripId }) } as { params: Promise<{ tripId: string }> });

  it('happy path: returns 200 with updated trip — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    });
    mockPrismaTrip.update.mockResolvedValueOnce(MOCK_TRIP);

    const req = makeJsonRequest(
      `http://localhost/api/trips/${MOCK_TRIP_ID}`,
      'PATCH',
      { title: 'Updated Title' }
    );
    const res = await tripByIdPATCH(req, makeParams());

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns 401 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeJsonRequest(
      `http://localhost/api/trips/${MOCK_TRIP_ID}`,
      'PATCH',
      { title: 'Updated Title' }
    );
    const res = await tripByIdPATCH(req, makeParams());

    expect(res.status).toBe(401);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('not owner/admin: returns 403 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeJsonRequest(
      `http://localhost/api/trips/${MOCK_TRIP_ID}`,
      'PATCH',
      { title: 'Updated Title' }
    );
    const res = await tripByIdPATCH(req, makeParams());

    expect(res.status).toBe(403);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.trip.update throws — returns 500 — captureException NOT called (bare catch used)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    });
    mockPrismaTrip.update.mockRejectedValueOnce(new Error('Record not found'));

    const req = makeJsonRequest(
      `http://localhost/api/trips/${MOCK_TRIP_ID}`,
      'PATCH',
      { title: 'Updated Title' }
    );
    const res = await tripByIdPATCH(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route uses bare catch {} with no Sentry call
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.tripMember.findFirst throws — returns 500 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockRejectedValueOnce(new Error('Connection timeout'));

    const req = makeJsonRequest(
      `http://localhost/api/trips/${MOCK_TRIP_ID}`,
      'PATCH',
      { title: 'Updated Title' }
    );
    const res = await tripByIdPATCH(req, makeParams());

    expect(res.status).toBe(500);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. trips/[tripId]/route.ts — DELETE /api/trips/[tripId]
// ===========================================================================
describe('DELETE /api/trips/[tripId] — Sentry captureException spy', () => {
  const makeParams = (tripId = MOCK_TRIP_ID) =>
    ({ params: Promise.resolve({ tripId }) } as { params: Promise<{ tripId: string }> });

  it('happy path: returns 200 with success message — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // isTripOwner calls prisma.trip.findFirst
    mockPrismaTrip.findFirst.mockResolvedValueOnce({ id: MOCK_TRIP_ID, ownerId: MOCK_USER_ID });
    mockPrismaTrip.delete.mockResolvedValueOnce(MOCK_TRIP);

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdDELETE(req, makeParams());

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns 401 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdDELETE(req, makeParams());

    expect(res.status).toBe(401);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('non-owner: returns 403 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // isTripOwner returns null (not owner)
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdDELETE(req, makeParams());

    expect(res.status).toBe(403);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.trip.delete throws — returns 500 — captureException NOT called (bare catch used)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findFirst.mockResolvedValueOnce({ id: MOCK_TRIP_ID, ownerId: MOCK_USER_ID });
    mockPrismaTrip.delete.mockRejectedValueOnce(new Error('Foreign key constraint failed'));

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdDELETE(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route uses bare catch {} with no Sentry call
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: isTripOwner prisma.trip.findFirst throws — returns 500 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findFirst.mockRejectedValueOnce(new Error('DB timeout'));

    const req = makeGetRequest(`http://localhost/api/trips/${MOCK_TRIP_ID}`);
    const res = await tripByIdDELETE(req, makeParams());

    expect(res.status).toBe(500);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 6. feed/route.ts — GET /api/feed
// ===========================================================================
describe('GET /api/feed — Sentry captureException spy', () => {
  it('happy path (unauthenticated): returns 200 with feed items — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findMany.mockResolvedValueOnce([]);
    mockPrismaActivity.findMany.mockResolvedValueOnce([]);
    mockPrismaActivityRating.findMany.mockResolvedValueOnce([]);

    const req = makeGetRequest('http://localhost/api/feed');
    const res = await feedGET(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('happy path (authenticated): returns 200 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaFollow.findMany.mockResolvedValueOnce([]);
    mockPrismaTrip.findMany.mockResolvedValueOnce([]);
    mockPrismaActivity.findMany.mockResolvedValueOnce([]);
    mockPrismaActivityRating.findMany.mockResolvedValueOnce([]);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce([]);

    const req = makeGetRequest('http://localhost/api/feed');
    const res = await feedGET(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('invalid query param: returns 400 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeGetRequest('http://localhost/api/feed?page=abc&limit=xyz');
    const res = await feedGET(req);

    expect(res.status).toBe(400);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.trip.findMany throws — returns 500 — captureException NOT called (logError used instead)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findMany.mockRejectedValueOnce(new Error('Query execution failed'));

    const req = makeGetRequest('http://localhost/api/feed');
    const res = await feedGET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route uses logError(), not captureException — Sentry not instrumented here yet
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: authenticated user, prisma.follow.findMany throws — returns 500 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaFollow.findMany.mockRejectedValueOnce(new Error('Follow query failed'));

    const req = makeGetRequest('http://localhost/api/feed');
    const res = await feedGET(req);

    expect(res.status).toBe(500);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.activity.findMany throws — returns 500 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTrip.findMany.mockResolvedValueOnce([]);
    mockPrismaActivity.findMany.mockRejectedValueOnce(new Error('Activity query failed'));

    const req = makeGetRequest('http://localhost/api/feed');
    const res = await feedGET(req);

    expect(res.status).toBe(500);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. notifications/route.ts — GET /api/notifications
// ===========================================================================
describe('GET /api/notifications — Sentry captureException spy', () => {
  it('happy path: returns 200 with notifications — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([MOCK_NOTIFICATION]);
    mockPrismaNotification.count.mockResolvedValueOnce(1);

    const req = makeGetRequest('http://localhost/api/notifications');
    const res = await notificationsGET(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('happy path: empty notifications list — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.count.mockResolvedValueOnce(0);

    const req = makeGetRequest('http://localhost/api/notifications');
    const res = await notificationsGET(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns 401 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeGetRequest('http://localhost/api/notifications');
    const res = await notificationsGET(req);

    expect(res.status).toBe(401);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.notification.findMany throws — returns 500 — captureException NOT called (logger.error used instead)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockRejectedValueOnce(new Error('Notification query failed'));

    const req = makeGetRequest('http://localhost/api/notifications');
    const res = await notificationsGET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route uses logger.error(), not captureException — Sentry not instrumented here yet
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.notification.count throws — returns 500 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([MOCK_NOTIFICATION]);
    mockPrismaNotification.count.mockRejectedValueOnce(new Error('Count query failed'));

    const req = makeGetRequest('http://localhost/api/notifications');
    const res = await notificationsGET(req);

    expect(res.status).toBe(500);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('unread filter: returns 200 with unread-only notifications — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([MOCK_NOTIFICATION]);
    mockPrismaNotification.count.mockResolvedValueOnce(1);

    const req = makeGetRequest('http://localhost/api/notifications?unread=true');
    const res = await notificationsGET(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 8. notifications/route.ts — PATCH /api/notifications
// ===========================================================================
describe('PATCH /api/notifications — Sentry captureException spy', () => {
  it('happy path: marks all notifications as read — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.updateMany.mockResolvedValueOnce({ count: 3 });

    const req = makeJsonRequest('http://localhost/api/notifications', 'PATCH', {});
    const res = await notificationsPATCH(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('unauthenticated: returns 401 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeJsonRequest('http://localhost/api/notifications', 'PATCH', {});
    const res = await notificationsPATCH(req);

    expect(res.status).toBe(401);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: prisma.notification.updateMany throws — returns 500 — captureException NOT called (logger.error used instead)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.updateMany.mockRejectedValueOnce(new Error('Bulk update failed'));

    const req = makeJsonRequest('http://localhost/api/notifications', 'PATCH', {});
    const res = await notificationsPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // Route uses logger.error(), not captureException — Sentry not instrumented here yet
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('error path: getServerSession throws — returns 500 — captureException NOT called', async () => {
    mockGetServerSession.mockRejectedValueOnce(new Error('Session service crashed'));

    const req = makeJsonRequest('http://localhost/api/notifications', 'PATCH', {});
    const res = await notificationsPATCH(req);

    expect(res.status).toBe(500);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('happy path: no unread notifications — updateMany count 0 — captureException NOT called', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.updateMany.mockResolvedValueOnce({ count: 0 });

    const req = makeJsonRequest('http://localhost/api/notifications', 'PATCH', {});
    const res = await notificationsPATCH(req);

    expect(res.status).toBe(200);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
