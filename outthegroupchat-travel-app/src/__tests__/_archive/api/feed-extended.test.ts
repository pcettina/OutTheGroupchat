/**
 * Extended edge-case tests for the Feed API route.
 *
 * Route: /api/feed  (GET, POST)
 *
 * Covers edge cases NOT exercised by feed.test.ts:
 *  - Pagination with real data (page 2, limit boundaries, hasMore logic)
 *  - Empty feed when user follows nobody (following filter)
 *  - Multiple activity types mixed in response (trip_created, trip_completed,
 *    trip_in_progress, activity_added, review_posted)
 *  - Database errors (500)
 *  - 'following' and 'trending' feedType query params
 *  - Invalid query param validation (400)
 *  - Authenticated user with saved-activity flags applied
 *  - POST error paths (DB failure, empty activityId)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { TripStatus, ActivityCategory, ActivityStatus, BookingStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Extend the global prisma mock with feed-relevant models
// ---------------------------------------------------------------------------
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
      follow: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
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
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        aggregate: vi.fn(),
      },
      savedActivity: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

// Static imports — NEVER use dynamic import() in beforeEach
import { GET as feedGET, POST as feedPOST } from '@/app/api/feed/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaFollow = vi.mocked(prisma.follow);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaActivityRating = vi.mocked(prisma.activityRating);
const mockPrismaSavedActivity = vi.mocked(prisma.savedActivity);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-ext-001';
const MOCK_TRIP_ID = 'trip-ext-001';
const MOCK_ACTIVITY_ID_1 = 'act-ext-001';
const MOCK_ACTIVITY_ID_2 = 'act-ext-002';
const MOCK_REVIEW_ID = 'review-ext-001';
const FOLLOWING_USER_ID = 'user-followed-001';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

function makeTripRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOCK_TRIP_ID,
    title: 'Paris Trip',
    description: null,
    destination: { city: 'Paris', country: 'France' },
    status: 'PLANNING' as TripStatus,
    isPublic: true,
    coverImage: null,
    budget: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-01'),
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-08-10'),
    viewCount: 0,
    ownerId: MOCK_USER_ID,
    owner: { id: MOCK_USER_ID, name: 'Test User', image: null },
    _count: { members: 1, activities: 2 },
    ...overrides,
  };
}

function makeActivityRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOCK_ACTIVITY_ID_1,
    tripId: MOCK_TRIP_ID,
    name: 'Eiffel Tower Visit',
    category: 'CULTURE' as ActivityCategory,
    description: 'Visit the iconic tower',
    status: 'SUGGESTED' as ActivityStatus,
    isPublic: true,
    createdAt: new Date('2026-02-05'),
    updatedAt: new Date('2026-02-05'),
    date: null,
    startTime: null,
    endTime: null,
    duration: null,
    location: null,
    cost: null,
    currency: 'USD',
    priceRange: null,
    costDetails: null,
    bookingStatus: 'NOT_NEEDED' as BookingStatus,
    bookingUrl: null,
    confirmationCode: null,
    requirements: null,
    originalTripId: null,
    shareCount: 0,
    externalLinks: null,
    trip: {
      id: MOCK_TRIP_ID,
      title: 'Paris Trip',
      destination: { city: 'Paris', country: 'France' },
      owner: { id: MOCK_USER_ID, name: 'Test User', image: null },
    },
    ratings: [],
    _count: { savedBy: 5, comments: 2 },
    ...overrides,
  };
}

function makeReviewRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOCK_REVIEW_ID,
    score: 5,
    review: 'Amazing experience!',
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    userId: FOLLOWING_USER_ID,
    activityId: MOCK_ACTIVITY_ID_1,
    user: { id: FOLLOWING_USER_ID, name: 'Followed User', image: null },
    activity: {
      id: MOCK_ACTIVITY_ID_1,
      name: 'Eiffel Tower Visit',
      category: 'CULTURE' as ActivityCategory,
      description: 'Visit the iconic tower',
      trip: {
        id: MOCK_TRIP_ID,
        title: 'Paris Trip',
        destination: { city: 'Paris', country: 'France' },
      },
    },
    ...overrides,
  };
}

/** Build a NextRequest for the feed route. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

async function parseJson(res: Response) {
  return res.json();
}

/**
 * Set up standard default mocks for a GET /api/feed call.
 * Uses mockResolvedValue (not Once) so tests can override with mockResolvedValueOnce.
 * Call this within each test after vi.clearAllMocks() resets everything.
 */
function setupDefaultGetMocks({
  session = null as typeof MOCK_SESSION | null,
  follows = [] as Array<{ followingId: string }>,
  trips = [] as ReturnType<typeof makeTripRow>[],
  activities = [] as ReturnType<typeof makeActivityRow>[],
  ratings = [] as ReturnType<typeof makeReviewRow>[],
  saved = [] as Array<{ activityId: string }>,
} = {}) {
  mockGetServerSession.mockResolvedValue(session as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);
  mockPrismaFollow.findMany.mockResolvedValue(follows as Awaited<ReturnType<typeof prisma.follow.findMany>>);
  mockPrismaTrip.findMany.mockResolvedValue(trips as Awaited<ReturnType<typeof prisma.trip.findMany>>);
  mockPrismaActivity.findMany.mockResolvedValue(activities as Awaited<ReturnType<typeof prisma.activity.findMany>>);
  mockPrismaActivityRating.findMany.mockResolvedValue(ratings as Awaited<ReturnType<typeof prisma.activityRating.findMany>>);
  mockPrismaSavedActivity.findMany.mockResolvedValue(saved as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>);
}

// ---------------------------------------------------------------------------
// Clear all mocks before each test (but don't pre-set defaults here so that
// individual tests can use mockResolvedValue cleanly without Once-queue conflicts)
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/feed — Pagination edge cases
// ===========================================================================
describe('GET /api/feed — pagination', () => {
  it('returns page 2 data when enough items exist', async () => {
    // 3 trips → limit=2, page=2 yields 1 item
    const trips = [
      makeTripRow({ id: 'trip-1', updatedAt: new Date('2026-03-03') }),
      makeTripRow({ id: 'trip-2', updatedAt: new Date('2026-03-02') }),
      makeTripRow({ id: 'trip-3', updatedAt: new Date('2026-03-01') }),
    ];
    setupDefaultGetMocks({ trips });

    const res = await feedGET(makeRequest('/api/feed?page=2&limit=2'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(2);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.totalPages).toBe(2);
  });

  it('returns empty data array and hasMore=false when page exceeds total', async () => {
    setupDefaultGetMocks({ trips: [makeTripRow()] });

    const res = await feedGET(makeRequest('/api/feed?page=99&limit=20'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.total).toBe(1);
  });

  it('hasMore=true when more items remain beyond the current page window', async () => {
    const trips = Array.from({ length: 5 }, (_, i) =>
      makeTripRow({ id: `trip-${i}`, updatedAt: new Date(2026, 2, 5 - i) })
    );
    setupDefaultGetMocks({ trips });

    const res = await feedGET(makeRequest('/api/feed?page=1&limit=3'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.totalPages).toBe(2);
  });

  it('respects limit=1 (minimum) and returns exactly one item', async () => {
    const trips = [
      makeTripRow({ id: 'trip-a', updatedAt: new Date('2026-03-03') }),
      makeTripRow({ id: 'trip-b', updatedAt: new Date('2026-03-02') }),
    ];
    setupDefaultGetMocks({ trips });

    const res = await feedGET(makeRequest('/api/feed?page=1&limit=1'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.hasMore).toBe(true);
  });

  it('returns 400 when limit exceeds maximum of 50', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?limit=51'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when page is 0 (below minimum of 1)', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?page=0'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when page is a non-numeric string', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?page=abc'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ===========================================================================
// GET /api/feed — empty feed when user follows nobody
// ===========================================================================
describe('GET /api/feed — empty following feed', () => {
  it('returns empty data when feedType=following and user follows nobody', async () => {
    setupDefaultGetMocks({ session: MOCK_SESSION, follows: [] });

    const res = await feedGET(makeRequest('/api/feed?type=following'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('returns items only from followed users when feedType=following', async () => {
    const followedTrip = makeTripRow({
      id: 'trip-followed',
      ownerId: FOLLOWING_USER_ID,
      owner: { id: FOLLOWING_USER_ID, name: 'Followed User', image: null },
    });
    setupDefaultGetMocks({
      session: MOCK_SESSION,
      follows: [{ followingId: FOLLOWING_USER_ID }],
      trips: [followedTrip],
    });

    const res = await feedGET(makeRequest('/api/feed?type=following'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].user.id).toBe(FOLLOWING_USER_ID);
  });

  it('unauthenticated user with feedType=following skips follow query', async () => {
    setupDefaultGetMocks({ session: null });

    const res = await feedGET(makeRequest('/api/feed?type=following'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    // follow.findMany should NOT have been called (no userId)
    expect(mockPrismaFollow.findMany).not.toHaveBeenCalled();
    expect(body.data).toHaveLength(0);
  });
});

// ===========================================================================
// GET /api/feed — multiple activity types
// ===========================================================================
describe('GET /api/feed — multiple activity types', () => {
  it('maps PLANNING trip to trip_created type', async () => {
    setupDefaultGetMocks({ trips: [makeTripRow({ status: 'PLANNING' as TripStatus })] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const item = body.data.find((i: { type: string }) => i.type === 'trip_created');
    expect(item).toBeDefined();
    expect(item.trip.status).toBe('PLANNING');
  });

  it('maps COMPLETED trip to trip_completed type', async () => {
    setupDefaultGetMocks({ trips: [makeTripRow({ status: 'COMPLETED' as TripStatus })] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const item = body.data.find((i: { type: string }) => i.type === 'trip_completed');
    expect(item).toBeDefined();
    expect(item.trip.status).toBe('COMPLETED');
  });

  it('maps IN_PROGRESS trip to trip_in_progress type', async () => {
    setupDefaultGetMocks({ trips: [makeTripRow({ status: 'IN_PROGRESS' as TripStatus })] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const item = body.data.find((i: { type: string }) => i.type === 'trip_in_progress');
    expect(item).toBeDefined();
    expect(item.trip.status).toBe('IN_PROGRESS');
  });

  it('includes activity_added items from public activities', async () => {
    setupDefaultGetMocks({ activities: [makeActivityRow()] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const item = body.data.find((i: { type: string }) => i.type === 'activity_added');
    expect(item).toBeDefined();
    expect(item.activity.id).toBe(MOCK_ACTIVITY_ID_1);
    expect(item.activity.name).toBe('Eiffel Tower Visit');
    expect(item.activity.category).toBe('CULTURE');
    expect(item.trip.status).toBe('PLANNING');
  });

  it('includes review_posted items from activity ratings with reviews', async () => {
    setupDefaultGetMocks({ ratings: [makeReviewRow()] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const item = body.data.find((i: { type: string }) => i.type === 'review_posted');
    expect(item).toBeDefined();
    expect(item.user.id).toBe(FOLLOWING_USER_ID);
    expect(item.activity.description).toBe('Amazing experience!');
    expect(item.metadata.rating).toBe(5);
    expect(item.trip.status).toBe('COMPLETED');
  });

  it('mixes all item types together and sorts by timestamp descending', async () => {
    const trip = makeTripRow({ updatedAt: new Date('2026-03-01') });
    const activity = makeActivityRow({
      id: MOCK_ACTIVITY_ID_2,
      createdAt: new Date('2026-03-03'), // newest
    });
    const review = makeReviewRow({ createdAt: new Date('2026-03-02') });

    setupDefaultGetMocks({
      trips: [trip],
      activities: [activity],
      ratings: [review],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);

    // Verify descending order: activity (Mar 3) > review (Mar 2) > trip (Mar 1)
    expect(body.data[0].type).toBe('activity_added');
    expect(body.data[1].type).toBe('review_posted');
    expect(body.data[2].type).toBe('trip_created');
  });

  it('prefixes item ids correctly (trip-, activity-, review-)', async () => {
    setupDefaultGetMocks({
      trips: [makeTripRow()],
      activities: [makeActivityRow()],
      ratings: [makeReviewRow()],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const ids: string[] = body.data.map((i: { id: string }) => i.id);
    expect(ids.some((id) => id.startsWith('trip-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('activity-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('review-'))).toBe(true);
  });

  it('each item exposes metadata counts appropriate to its type', async () => {
    setupDefaultGetMocks({
      trips: [makeTripRow()],
      activities: [makeActivityRow()],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const tripItem = body.data.find((i: { type: string }) => i.type === 'trip_created');
    expect(tripItem).toBeDefined();
    expect(tripItem.metadata.memberCount).toBe(1);
    expect(tripItem.metadata.activityCount).toBe(2);

    const actItem = body.data.find((i: { type: string }) => i.type === 'activity_added');
    expect(actItem).toBeDefined();
    expect(actItem.metadata.saveCount).toBe(5);
    expect(actItem.metadata.commentCount).toBe(2);
  });
});

// ===========================================================================
// GET /api/feed — isSaved flag for authenticated users
// ===========================================================================
describe('GET /api/feed — isSaved flag', () => {
  it('sets isSaved=true for activities the authenticated user has saved', async () => {
    setupDefaultGetMocks({
      session: MOCK_SESSION,
      activities: [makeActivityRow()],
      saved: [{ activityId: MOCK_ACTIVITY_ID_1 }],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const actItem = body.data.find((i: { type: string }) => i.type === 'activity_added');
    expect(actItem).toBeDefined();
    expect(actItem.isSaved).toBe(true);
  });

  it('sets isSaved=false for activities the authenticated user has not saved', async () => {
    setupDefaultGetMocks({
      session: MOCK_SESSION,
      activities: [makeActivityRow()],
      saved: [],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const actItem = body.data.find((i: { type: string }) => i.type === 'activity_added');
    expect(actItem).toBeDefined();
    expect(actItem.isSaved).toBe(false);
  });

  it('sets isSaved=false for trip items (no activity field)', async () => {
    setupDefaultGetMocks({
      session: MOCK_SESSION,
      trips: [makeTripRow()],
      saved: [],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const tripItem = body.data.find((i: { type: string }) => i.type === 'trip_created');
    expect(tripItem).toBeDefined();
    expect(tripItem.isSaved).toBe(false);
  });

  it('does not call savedActivity.findMany when unauthenticated', async () => {
    setupDefaultGetMocks({
      session: null,
      activities: [makeActivityRow()],
    });

    await feedGET(makeRequest('/api/feed'));

    expect(mockPrismaSavedActivity.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/feed — feedType query param variations
// ===========================================================================
describe('GET /api/feed — feedType param', () => {
  it('accepts feedType=all and returns all public items', async () => {
    setupDefaultGetMocks({ trips: [makeTripRow()] });

    const res = await feedGET(makeRequest('/api/feed?type=all'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('accepts feedType=trending and returns items (same as all for now)', async () => {
    setupDefaultGetMocks({ trips: [makeTripRow()] });

    const res = await feedGET(makeRequest('/api/feed?type=trending'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('returns 400 for an invalid feedType value', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?type=invalid'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ===========================================================================
// GET /api/feed — database error handling
// ===========================================================================
describe('GET /api/feed — database errors', () => {
  it('returns 500 when prisma.trip.findMany throws', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaFollow.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.follow.findMany>>);
    mockPrismaTrip.findMany.mockRejectedValue(new Error('DB connection refused'));
    mockPrismaActivity.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.activity.findMany>>);
    mockPrismaActivityRating.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.activityRating.findMany>>);
    mockPrismaSavedActivity.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch feed');
  });

  it('returns 500 when prisma.activity.findMany throws', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaFollow.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.follow.findMany>>);
    mockPrismaTrip.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.trip.findMany>>);
    mockPrismaActivity.findMany.mockRejectedValue(new Error('Query timeout'));
    mockPrismaActivityRating.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.activityRating.findMany>>);
    mockPrismaSavedActivity.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch feed');
  });

  it('returns 500 when prisma.activityRating.findMany throws', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaFollow.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.follow.findMany>>);
    mockPrismaTrip.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.trip.findMany>>);
    mockPrismaActivity.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.activity.findMany>>);
    mockPrismaActivityRating.findMany.mockRejectedValue(new Error('Lock timeout'));
    mockPrismaSavedActivity.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('returns 500 when prisma.follow.findMany throws (authenticated)', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);
    mockPrismaFollow.findMany.mockRejectedValue(new Error('Follow query failed'));
    mockPrismaTrip.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.trip.findMany>>);
    mockPrismaActivity.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.activity.findMany>>);
    mockPrismaActivityRating.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.activityRating.findMany>>);
    mockPrismaSavedActivity.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('returns 500 when savedActivity.findMany throws (authenticated with activities)', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);
    mockPrismaFollow.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.follow.findMany>>);
    mockPrismaTrip.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.trip.findMany>>);
    mockPrismaActivity.findMany.mockResolvedValue(
      [makeActivityRow()] as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaActivityRating.findMany.mockResolvedValue([] as Awaited<ReturnType<typeof prisma.activityRating.findMany>>);
    mockPrismaSavedActivity.findMany.mockRejectedValue(new Error('savedActivity query failed'));

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// GET /api/feed — response structure invariants
// ===========================================================================
describe('GET /api/feed — response structure invariants', () => {
  it('each feed item always has id, type, timestamp, user, and isSaved fields', async () => {
    setupDefaultGetMocks({
      trips: [makeTripRow()],
      activities: [makeActivityRow()],
      ratings: [makeReviewRow()],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    for (const item of body.data) {
      expect(item.id).toBeDefined();
      expect(item.type).toBeDefined();
      expect(item.timestamp).toBeDefined();
      expect(item.user).toBeDefined();
      expect(item.user.id).toBeDefined();
      expect(typeof item.isSaved).toBe('boolean');
    }
  });

  it('pagination object has all required fields', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(body.pagination).toMatchObject({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),
      totalPages: expect.any(Number),
      hasMore: expect.any(Boolean),
    });
  });

  it('totalPages is 0 when total is 0', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(body.pagination.total).toBe(0);
    expect(body.pagination.totalPages).toBe(0);
  });

  it('default pagination values are page=1, limit=20', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(20);
  });
});

// ===========================================================================
// POST /api/feed — extended edge cases
// ===========================================================================
describe('POST /api/feed — extended edge cases', () => {
  it('returns 400 when activityId is an empty string', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);

    const res = await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: { activityId: '', action: 'save' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when action field is missing entirely', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);

    const res = await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: { activityId: MOCK_ACTIVITY_ID_1 },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when request body is an empty object', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);

    const res = await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: {},
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 401 when unauthenticated on POST', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: { activityId: MOCK_ACTIVITY_ID_1, action: 'save' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 500 when prisma.savedActivity.upsert throws on save', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);
    mockPrismaSavedActivity.upsert.mockRejectedValue(new Error('upsert failed'));

    const res = await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: { activityId: MOCK_ACTIVITY_ID_1, action: 'save' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to save activity');
  });

  it('returns 500 when prisma.savedActivity.deleteMany throws on unsave', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);
    mockPrismaSavedActivity.deleteMany.mockRejectedValue(new Error('deleteMany failed'));

    const res = await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: { activityId: MOCK_ACTIVITY_ID_1, action: 'unsave' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to save activity');
  });

  it('upsert is called with correct userId from session on save', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);
    mockPrismaSavedActivity.upsert.mockResolvedValue({
      id: 'sa-1',
      userId: MOCK_USER_ID,
      activityId: MOCK_ACTIVITY_ID_1,
      savedAt: new Date(),
    } as Awaited<ReturnType<typeof prisma.savedActivity.upsert>>);

    await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: { activityId: MOCK_ACTIVITY_ID_1, action: 'save' },
      })
    );

    expect(mockPrismaSavedActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: MOCK_USER_ID }),
      })
    );
  });

  it('deleteMany is called with correct userId from session on unsave', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]);
    mockPrismaSavedActivity.deleteMany.mockResolvedValue({ count: 1 });

    await feedPOST(
      makeRequest('/api/feed', {
        method: 'POST',
        body: { activityId: MOCK_ACTIVITY_ID_1, action: 'unsave' },
      })
    );

    expect(mockPrismaSavedActivity.deleteMany).toHaveBeenCalledWith({
      where: { userId: MOCK_USER_ID, activityId: MOCK_ACTIVITY_ID_1 },
    });
  });
});
