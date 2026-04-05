/**
 * Unit tests for:
 *   - GET /api/trips/[tripId]/itinerary
 *   - PUT /api/trips/[tripId]/itinerary
 *
 * Covers auth failures (401/403), not-found (404), validation (400), and
 * success (200) paths. Mock hygiene: mockResolvedValueOnce only, each test
 * sets up its own mocks, vi.clearAllMocks() in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

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
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    itineraryDay: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    itineraryItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
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

import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import {
  GET as itineraryGET,
  PUT as itineraryPUT,
} from '@/app/api/trips/[tripId]/itinerary/route';

// ---------------------------------------------------------------------------
// Typed helpers for mocked models
// ---------------------------------------------------------------------------
type MockItineraryDay = {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

type MockItineraryItem = {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip) as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockPrismaTripMember = vi.mocked(prisma.tripMember) as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
};
const mockItineraryDay = (prisma.itineraryDay as unknown) as MockItineraryDay;
const mockItineraryItem = (prisma.itineraryItem as unknown) as MockItineraryItem;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-itinerary-test-001';
const MOCK_TRIP_ID = 'trip-itinerary-test-001';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Itinerary Tester', email: 'itinerary@example.com' },
  expires: '2099-01-01',
};

const MOCK_TRIP_PUBLIC = {
  id: MOCK_TRIP_ID,
  isPublic: true,
  ownerId: 'other-owner-id',
} as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>;

const MOCK_TRIP_PRIVATE_OWNED = {
  id: MOCK_TRIP_ID,
  isPublic: false,
  ownerId: MOCK_USER_ID,
} as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>;

const MOCK_TRIP_PRIVATE_OTHER = {
  id: MOCK_TRIP_ID,
  isPublic: false,
  ownerId: 'other-owner-id',
} as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>;

const MOCK_ITINERARY_DAY = {
  id: 'iday-001',
  tripId: MOCK_TRIP_ID,
  dayNumber: 1,
  date: new Date('2026-07-01'),
  notes: 'First day notes',
  items: [
    {
      id: 'iitem-001',
      itineraryDayId: 'iday-001',
      order: 1,
      startTime: '09:00',
      endTime: '11:00',
      customTitle: 'Morning activity',
      notes: null,
      activityId: null,
      activity: null,
    },
  ],
};

const MOCK_ITINERARY_DAY_2 = {
  id: 'iday-002',
  tripId: MOCK_TRIP_ID,
  dayNumber: 2,
  date: new Date('2026-07-02'),
  notes: null,
  items: [],
};

const VALID_PUT_BODY = {
  days: [
    {
      dayNumber: 1,
      date: '2026-07-01',
      notes: 'Day one plan',
      items: [
        { order: 1, startTime: '10:00', endTime: '12:00', customTitle: 'Sightseeing' },
      ],
    },
  ],
};

const VALID_PUT_BODY_EMPTY_DAYS = { days: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(path: string, options: { method?: string; body?: unknown } = {}): NextRequest {
  const url = `http://localhost:3000${path}`;
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init);
}

async function parseJson(res: Response) {
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it('returns 401 when trip is private and requester has no session', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
    expect(mockItineraryDay.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when authenticated user is not owner or member of private trip', async () => {
    const strangerSession = {
      user: { id: 'stranger-999', name: 'Stranger', email: 'stranger@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValueOnce(
      strangerSession as Awaited<ReturnType<typeof getServerSession>>
    );
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OTHER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/itinerary`);
    const res = await itineraryGET(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(mockItineraryDay.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with itinerary for the trip owner', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('iday-001');
    expect(mockItineraryDay.findMany).toHaveBeenCalledOnce();
  });

  it('returns 200 with itinerary for a public trip without authentication', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PUBLIC);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY, MOCK_ITINERARY_DAY_2]);

    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns 200 with itinerary for a trip member', async () => {
    const memberSession = {
      user: { id: MOCK_USER_ID, name: 'Member', email: 'member@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValueOnce(
      memberSession as Awaited<ReturnType<typeof getServerSession>>
    );
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
    expect(body.data).toHaveLength(1);
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
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch itinerary');
  });

  it('returns 500 when Prisma throws on itineraryDay findMany', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch itinerary');
  });

  it('returns 200 with items nested inside days', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_PRIVATE_OWNED);
    mockItineraryDay.findMany.mockResolvedValueOnce([MOCK_ITINERARY_DAY]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data[0].items).toHaveLength(1);
    expect(body.data[0].items[0].customTitle).toBe('Morning activity');
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
    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_BODY, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockItineraryDay.create).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not an OWNER or ADMIN', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to edit itinerary');
    expect(mockItineraryDay.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the days field is missing from the request body', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);

    const res = await callPut(MOCK_TRIP_ID, { invalid: 'data' });
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

    const res = await callPut(MOCK_TRIP_ID, {
      days: [{ dayNumber: 1, items: [] }],
    });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when a day entry has items missing the required order field', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);

    const res = await callPut(MOCK_TRIP_ID, {
      days: [
        {
          dayNumber: 1,
          date: '2026-07-01',
          items: [{ startTime: '09:00' }], // missing required 'order'
        },
      ],
    });
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
    mockItineraryDay.create.mockResolvedValueOnce({ ...MOCK_ITINERARY_DAY, id: 'iday-new-001' });
    mockItineraryItem.createMany.mockResolvedValueOnce({ count: 1 });
    mockItineraryDay.findMany.mockResolvedValueOnce([
      { ...MOCK_ITINERARY_DAY, id: 'iday-new-001', items: [] },
    ]);

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(mockItineraryItem.deleteMany).toHaveBeenCalledOnce();
    expect(mockItineraryDay.deleteMany).toHaveBeenCalledOnce();
    expect(mockItineraryDay.create).toHaveBeenCalledOnce();
  });

  it('returns 200 and rebuilds itinerary for an ADMIN', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'ADMIN',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockItineraryDay.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockItineraryDay.create.mockResolvedValueOnce({ ...MOCK_ITINERARY_DAY, id: 'iday-admin-001' });
    mockItineraryItem.createMany.mockResolvedValueOnce({ count: 1 });
    mockItineraryDay.findMany.mockResolvedValueOnce([
      { ...MOCK_ITINERARY_DAY, id: 'iday-admin-001', items: [] },
    ]);

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].id).toBe('iday-admin-001');
  });

  it('clears the entire itinerary when PUT is called with an empty days array', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockResolvedValueOnce({ count: 5 });
    mockItineraryDay.deleteMany.mockResolvedValueOnce({ count: 3 });
    mockItineraryDay.findMany.mockResolvedValueOnce([]);

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_BODY_EMPTY_DAYS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(mockItineraryDay.create).not.toHaveBeenCalled();
  });

  it('creates multiple days when multiple days are provided', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockItineraryDay.deleteMany.mockResolvedValueOnce({ count: 0 });
    // First day create
    mockItineraryDay.create.mockResolvedValueOnce({ ...MOCK_ITINERARY_DAY, id: 'iday-m1' });
    // Second day create (no items so no createMany)
    mockItineraryDay.create.mockResolvedValueOnce({ ...MOCK_ITINERARY_DAY_2, id: 'iday-m2' });
    mockItineraryItem.createMany.mockResolvedValueOnce({ count: 1 });
    mockItineraryDay.findMany.mockResolvedValueOnce([
      { ...MOCK_ITINERARY_DAY, id: 'iday-m1', items: [] },
      { ...MOCK_ITINERARY_DAY_2, id: 'iday-m2', items: [] },
    ]);

    const res = await callPut(MOCK_TRIP_ID, {
      days: [
        {
          dayNumber: 1,
          date: '2026-07-01',
          notes: 'Day 1',
          items: [{ order: 1, customTitle: 'Activity A' }],
        },
        {
          dayNumber: 2,
          date: '2026-07-02',
          items: [],
        },
      ],
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(mockItineraryDay.create).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when Prisma throws during itineraryItem deleteMany', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
      role: 'OWNER',
    } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>);
    mockItineraryItem.deleteMany.mockRejectedValueOnce(new Error('DB locked'));

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_BODY);
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

    const res = await callPut(MOCK_TRIP_ID, VALID_PUT_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update itinerary');
  });
});
