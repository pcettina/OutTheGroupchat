/**
 * Unit tests for:
 *   - GET  /api/trips/[tripId]/activities
 *   - POST /api/trips/[tripId]/activities
 *   - GET  /api/trips/[tripId]/itinerary
 *   - PUT  /api/trips/[tripId]/itinerary
 *
 * This file provides its own vi.mock('@/lib/prisma') factory (overriding
 * setup.ts) so that it can include itineraryDay, itineraryItem, and
 * activityRating.aggregate — models not present in the global setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Override the global @/lib/prisma mock with a complete factory that includes
// all models used by these two route files. This MUST come before any imports
// that transitively load the mock.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
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
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    activity: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    activityRating: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      aggregate: vi.fn(),
    },
    activityComment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    savedActivity: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    itineraryDay: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    itineraryItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    tripInvitation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pendingInvitation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    externalActivity: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
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
}));

vi.mock('@/lib/invitations', () => ({
  processInvitations: vi.fn().mockResolvedValue({ invitations: [], errors: [] }),
}));

// ---------------------------------------------------------------------------
// Import modules under test AFTER vi.mock declarations
// ---------------------------------------------------------------------------
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import {
  GET as activitiesGET,
  POST as activitiesPOST,
} from '@/app/api/trips/[tripId]/activities/route';
import {
  GET as itineraryGET,
  PUT as itineraryPUT,
} from '@/app/api/trips/[tripId]/itinerary/route';

// ---------------------------------------------------------------------------
// Typed references to mocked prisma models
// ---------------------------------------------------------------------------
type ExtendedPrisma = typeof prisma & {
  activityRating: typeof prisma.activityRating & { aggregate: ReturnType<typeof vi.fn> };
  itineraryDay: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  itineraryItem: { createMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
};

const p = prisma as ExtendedPrisma;
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaTripMember = vi.mocked(prisma.tripMember);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockActivityRatingAggregate = p.activityRating.aggregate as ReturnType<typeof vi.fn>;
const mockItineraryDay = p.itineraryDay;
const mockItineraryItem = p.itineraryItem;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-abc-123';
const MOCK_TRIP_ID = 'trip-xyz-456';
const MOCK_ACTIVITY_ID = 'act-aaa-111';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

const MOCK_TRIP_PUBLIC = {
  id: MOCK_TRIP_ID,
  isPublic: true,
  ownerId: 'other-owner',
} as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>;

const MOCK_TRIP_PRIVATE_OWNED = {
  id: MOCK_TRIP_ID,
  isPublic: false,
  ownerId: MOCK_USER_ID,
} as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>;

const MOCK_TRIP_PRIVATE_OTHER = {
  id: MOCK_TRIP_ID,
  isPublic: false,
  ownerId: 'other-owner',
} as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>;

const MOCK_ACTIVITY = {
  id: MOCK_ACTIVITY_ID,
  tripId: MOCK_TRIP_ID,
  name: 'Eiffel Tower',
  description: 'Iconic landmark',
  category: 'CULTURE',
  status: 'SUGGESTED',
  location: null,
  date: null,
  startTime: null,
  endTime: null,
  duration: null,
  cost: null,
  currency: 'USD',
  priceRange: null,
  costDetails: null,
  bookingStatus: 'NOT_NEEDED',
  bookingUrl: null,
  requirements: null,
  externalLinks: null,
  isPublic: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  _count: { comments: 0, ratings: 0, savedBy: 0 },
} as unknown as Awaited<ReturnType<typeof prisma.activity.create>>;

const MOCK_ITINERARY_DAY = {
  id: 'day-111',
  tripId: MOCK_TRIP_ID,
  dayNumber: 1,
  date: new Date('2026-06-01'),
  notes: null,
  items: [],
};

const VALID_POST_ACTIVITY_BODY = {
  name: 'Eiffel Tower',
  category: 'CULTURE',
};

const VALID_PUT_ITINERARY_BODY = {
  days: [
    {
      dayNumber: 1,
      date: '2026-06-01',
      notes: 'Day one',
      items: [
        { order: 1, startTime: '09:00', endTime: '11:00', customTitle: 'Morning walk' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(path: string, options: { method?: string; body?: unknown } = {}): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
}

async function parseJson(res: Response) {
  return res.json();
}

beforeEach(() => {
  // resetAllMocks clears call history AND the mockResolvedValueOnce queue,
  // preventing state from leaking between tests in this file.
  vi.resetAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/activities
// ===========================================================================
describe('GET /api/trips/[tripId]/activities', () => {
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest(`/api/trips/${tripId}/activities`);
    return activitiesGET(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 404 when trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
    expect(mockPrismaActivity.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when trip is private and user has no session', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when authenticated user is not owner or member of private trip', async () => {
    const otherSession = {
      user: { id: 'stranger-user', name: 'Stranger', email: 'stranger@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValueOnce(otherSession as Awaited<ReturnType<typeof getServerSession>>);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/activities`);
    const res = await activitiesGET(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns 200 with activities and average rating for the owner of a private trip', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_ACTIVITY]);
    mockActivityRatingAggregate.mockResolvedValueOnce({ _avg: { score: 4.5 } });

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(MOCK_ACTIVITY_ID);
    expect(body.data[0].averageRating).toBe(4.5);
  });

  it('returns 200 with activities for a public trip without authentication', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PUBLIC);
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_ACTIVITY]);
    mockActivityRatingAggregate.mockResolvedValueOnce({ _avg: { score: null } });

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].averageRating).toBeNull();
  });

  it('returns 200 with activities for a trip member', async () => {
    const memberSession = {
      user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValueOnce(memberSession as Awaited<ReturnType<typeof getServerSession>>);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_ACTIVITY]);
    mockActivityRatingAggregate.mockResolvedValueOnce({ _avg: { score: 3.0 } });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/activities`);
    const res = await activitiesGET(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].averageRating).toBe(3.0);
  });

  it('returns 200 with empty array when trip has no activities', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaActivity.findMany.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 500 when Prisma throws on trip findUnique', async () => {
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch activities');
  });

  it('returns 500 when Prisma throws on activity findMany', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaActivity.findMany.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch activities');
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/activities
// ===========================================================================
describe('POST /api/trips/[tripId]/activities', () => {
  async function callPost(tripId: string, body: unknown, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest(`/api/trips/${tripId}/activities`, { method: 'POST', body });
    return activitiesPOST(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPost(MOCK_TRIP_ID, VALID_POST_ACTIVITY_BODY, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaActivity.create).not.toHaveBeenCalled();
  });

  it('returns 404 when trip does not exist', async () => {
    // POST uses Promise.all([trip.findUnique, tripMember.findFirst])
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, VALID_POST_ACTIVITY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
    expect(mockPrismaActivity.create).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not the owner or a member', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, VALID_POST_ACTIVITY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
    expect(mockPrismaActivity.create).not.toHaveBeenCalled();
  });

  it('returns 400 when required name field is missing', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, { category: 'CULTURE' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockPrismaActivity.create).not.toHaveBeenCalled();
  });

  it('returns 400 when category value is invalid', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, { name: 'Test', category: 'INVALID_CAT' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when name is an empty string', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, { name: '', category: 'CULTURE' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('creates activity and returns 201 when owner posts', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaActivity.create.mockResolvedValueOnce(MOCK_ACTIVITY);

    const res = await callPost(MOCK_TRIP_ID, VALID_POST_ACTIVITY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_ACTIVITY_ID);
    expect(mockPrismaActivity.create).toHaveBeenCalledOnce();
  });

  it('creates activity and returns 201 when a trip member posts', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockPrismaActivity.create.mockResolvedValueOnce(MOCK_ACTIVITY);

    const res = await callPost(MOCK_TRIP_ID, VALID_POST_ACTIVITY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.tripId).toBe(MOCK_TRIP_ID);
  });

  it('sets status to SUGGESTED on the created activity', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaActivity.create.mockResolvedValueOnce(MOCK_ACTIVITY);

    await callPost(MOCK_TRIP_ID, VALID_POST_ACTIVITY_BODY);

    const createCall = mockPrismaActivity.create.mock.calls[0][0];
    expect((createCall as { data: { status: string } })?.data?.status).toBe('SUGGESTED');
  });

  it('returns 500 when Prisma throws on activity create', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaActivity.create.mockRejectedValueOnce(new Error('Unique constraint failed'));

    const res = await callPost(MOCK_TRIP_ID, VALID_POST_ACTIVITY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to create activity');
  });
});

// ===========================================================================
// GET /api/trips/[tripId]/itinerary
// ===========================================================================
describe('GET /api/trips/[tripId]/itinerary', () => {
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest(`/api/trips/${tripId}/itinerary`);
    return itineraryGET(req, { params: { tripId } });
  }

  it('returns 404 when trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
    expect(mockItineraryDay.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when trip is private and user has no session', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when authenticated user is not owner or member of private trip', async () => {
    const otherSession = {
      user: { id: 'stranger-user', name: 'Stranger', email: 'stranger@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValueOnce(otherSession as Awaited<ReturnType<typeof getServerSession>>);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/itinerary`);
    const res = await itineraryGET(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns 200 with itinerary days for the owner of a private trip', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('day-111');
  });

  it('returns 200 with itinerary for a public trip without authentication', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PUBLIC);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 200 with itinerary for a trip member', async () => {
    const memberSession = {
      user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValueOnce(memberSession as Awaited<ReturnType<typeof getServerSession>>);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'MEMBER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/itinerary`);
    const res = await itineraryGET(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 200 with empty array when trip has no itinerary days', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 500 when Prisma throws on trip findUnique', async () => {
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch itinerary');
  });

  it('returns 500 when Prisma throws on itineraryDay findMany', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockRejectedValueOnce(new Error('Query failed'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch itinerary');
  });
});

// ===========================================================================
// PUT /api/trips/[tripId]/itinerary
// ===========================================================================
describe('PUT /api/trips/[tripId]/itinerary', () => {
  async function callPut(tripId: string, body: unknown, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest(`/api/trips/${tripId}/itinerary`, { method: 'PUT', body });
    return itineraryPUT(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_ITINERARY_BODY, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockItineraryDay.create).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not an OWNER or ADMIN member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_ITINERARY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to edit itinerary');
    expect(mockItineraryDay.create).not.toHaveBeenCalled();
  });

  it('returns 400 when body fails validation because days field is missing', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);

    const res = await callPut(MOCK_TRIP_ID, { invalid: 'body' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockItineraryDay.create).not.toHaveBeenCalled();
  });

  it('returns 400 when a day entry is missing the required date field', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);

    const res = await callPut(MOCK_TRIP_ID, { days: [{ dayNumber: 1, items: [] }] });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 200 and rebuilds itinerary for an OWNER', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockItineraryDay.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockItineraryDay.create.mockResolvedValueOnce({ ...MOCK_ITINERARY_DAY, id: 'day-new-111' });
    mockItineraryItem.createMany.mockResolvedValueOnce({ count: 1 });
    mockItineraryDay.findMany.mockResolvedValueOnce([
      { ...MOCK_ITINERARY_DAY, id: 'day-new-111', items: [] },
    ]);

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_ITINERARY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(mockItineraryDay.deleteMany).toHaveBeenCalledOnce();
    expect(mockItineraryItem.deleteMany).toHaveBeenCalledOnce();
    expect(mockItineraryDay.create).toHaveBeenCalledOnce();
  });

  it('returns 200 and rebuilds itinerary for an ADMIN', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'ADMIN',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockItineraryDay.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockItineraryDay.create.mockResolvedValueOnce({ ...MOCK_ITINERARY_DAY, id: 'day-new-222' });
    mockItineraryItem.createMany.mockResolvedValueOnce({ count: 1 });
    mockItineraryDay.findMany.mockResolvedValueOnce([
      { ...MOCK_ITINERARY_DAY, id: 'day-new-222', items: [] },
    ]);

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_ITINERARY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].id).toBe('day-new-222');
  });

  it('clears the itinerary when PUT is called with an empty days array', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockResolvedValueOnce({ count: 3 });
    mockItineraryDay.deleteMany.mockResolvedValueOnce({ count: 2 });
    mockItineraryDay.findMany.mockResolvedValueOnce([]);

    const res = await callPut(MOCK_TRIP_ID, { days: [] });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(mockItineraryDay.create).not.toHaveBeenCalled();
  });

  it('returns 500 when Prisma throws during itineraryItem deleteMany', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockRejectedValueOnce(new Error('DB locked'));

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_ITINERARY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update itinerary');
  });

  it('returns 500 when Prisma throws during itineraryDay create', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockItineraryDay.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockItineraryDay.create.mockRejectedValueOnce(new Error('Write failed'));

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_ITINERARY_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update itinerary');
  });
});
