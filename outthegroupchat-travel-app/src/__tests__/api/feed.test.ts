/**
 * Unit tests for the Feed API route handlers.
 *
 * Route: /api/feed  (GET, POST)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts.  This file extends those mocks with the
 *   additional Prisma models the feed handlers require: follow, activity,
 *   activityRating, and savedActivity.
 * - Handlers are called directly with a minimal Request built from the
 *   web-platform APIs available in the Vitest node environment.
 * - GET is public — no session is required.  POST requires a session.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { TripStatus, ActivityStatus, ActivityCategory, BookingStatus } from '@prisma/client';

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Extend the global prisma mock (defined in setup.ts) with the additional
// models and methods that the feed route handler calls.
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
      },
      activity: {
        findMany: vi.fn(),
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

// Import handlers after the mock is registered.
import { GET as feedGET, POST as feedPOST } from '@/app/api/feed/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaFollow = vi.mocked(prisma.follow);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaActivityRating = vi.mocked(prisma.activityRating);
const mockPrismaSavedActivity = vi.mocked(prisma.savedActivity);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-feed-111';
const MOCK_ACTIVITY_ID = 'activity-feed-222';
const MOCK_TRIP_ID = 'trip-feed-333';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Feed Tester',
    email: 'feed@example.com',
  },
  expires: '2099-01-01',
};

/** A minimal public trip row returned by prisma.trip.findMany. */
const MOCK_TRIP_ROW = {
  id: MOCK_TRIP_ID,
  title: 'Tokyo Adventure',
  description: null,
  destination: { city: 'Tokyo', country: 'Japan' },
  status: 'PLANNING' as TripStatus,
  isPublic: true,
  coverImage: null,
  budget: null,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-02-01'),
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-07-10'),
  viewCount: 0,
  ownerId: MOCK_USER_ID,
  owner: { id: MOCK_USER_ID, name: 'Feed Tester', image: null },
  _count: { members: 2, activities: 5 },
};

/** A minimal public activity row returned by prisma.activity.findMany. */
const MOCK_ACTIVITY_ROW = {
  id: MOCK_ACTIVITY_ID,
  tripId: MOCK_TRIP_ID,
  name: 'Shibuya Crossing Walk',
  category: 'CULTURE' as ActivityCategory,
  description: 'Walk through the famous crossing',
  status: 'SUGGESTED' as ActivityStatus,
  isPublic: true,
  createdAt: new Date('2026-02-02'),
  updatedAt: new Date('2026-02-02'),
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
    title: 'Tokyo Adventure',
    destination: { city: 'Tokyo', country: 'Japan' },
    owner: { id: MOCK_USER_ID, name: 'Feed Tester', image: null },
  },
  ratings: [],
  _count: { savedBy: 3, comments: 1 },
};

/** Build a minimal Request accepted by the App Router handlers. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  return new Request(url, init);
}

/** Parse the JSON body from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to avoid state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default GET stubs — return empty datasets so no items are built.
  mockPrismaTrip.findMany.mockResolvedValue([]);
  mockPrismaActivity.findMany.mockResolvedValue([]);
  mockPrismaActivityRating.findMany.mockResolvedValue([]);
  mockPrismaFollow.findMany.mockResolvedValue([]);
  mockPrismaSavedActivity.findMany.mockResolvedValue([]);
});

// ===========================================================================
// GET /api/feed
// ===========================================================================
describe('GET /api/feed', () => {
  it('returns 200 with feed envelope when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it('returns 200 with correct pagination shape', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed?page=1&limit=20'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: expect.any(Number),
      totalPages: expect.any(Number),
      hasMore: expect.any(Boolean),
    });
  });

  it('returns empty data arrays when no trips, activities, or reviews exist', async () => {
    mockGetServerSession.mockResolvedValue(null);
    // All Prisma queries already default to [] in beforeEach.

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('handles page and limit query params correctly', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed?page=2&limit=5'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(5);
  });

  it('includes trip feed items when public trips are returned by Prisma', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaTrip.findMany.mockResolvedValue([MOCK_TRIP_ROW]);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);

    const tripItem = body.data.find((item: { type: string }) => item.type === 'trip_created');
    expect(tripItem).toBeDefined();
    expect(tripItem.trip.id).toBe(MOCK_TRIP_ID);
    expect(tripItem.trip.title).toBe('Tokyo Adventure');
  });

  it('includes activity feed items when public activities are returned by Prisma', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaActivity.findMany.mockResolvedValue([MOCK_ACTIVITY_ROW]);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const activityItem = body.data.find((item: { type: string }) => item.type === 'activity_added');
    expect(activityItem).toBeDefined();
    expect(activityItem.activity.id).toBe(MOCK_ACTIVITY_ID);
    expect(activityItem.activity.name).toBe('Shibuya Crossing Walk');
  });
});

// ===========================================================================
// POST /api/feed
// ===========================================================================
describe('POST /api/feed', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedPOST(
      makeRequest('/api/feed', { method: 'POST', body: { activityId: MOCK_ACTIVITY_ID, action: 'save' } })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when activityId is missing', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);

    const res = await feedPOST(
      makeRequest('/api/feed', { method: 'POST', body: { action: 'save' } })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when action is not save or unsave', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);

    const res = await feedPOST(
      makeRequest('/api/feed', { method: 'POST', body: { activityId: MOCK_ACTIVITY_ID, action: 'like' } })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('saves an activity successfully and returns action: save', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    mockPrismaSavedActivity.upsert.mockResolvedValue({
      id: 'saved-act-1',
      userId: MOCK_USER_ID,
      activityId: MOCK_ACTIVITY_ID,
      savedAt: new Date(),
    });

    const res = await feedPOST(
      makeRequest('/api/feed', { method: 'POST', body: { activityId: MOCK_ACTIVITY_ID, action: 'save' } })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('save');
    expect(mockPrismaSavedActivity.upsert).toHaveBeenCalledOnce();
    expect(mockPrismaSavedActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_activityId: { userId: MOCK_USER_ID, activityId: MOCK_ACTIVITY_ID } },
      })
    );
  });

  it('unsaves an activity successfully and returns action: unsave', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    mockPrismaSavedActivity.deleteMany.mockResolvedValue({ count: 1 });

    const res = await feedPOST(
      makeRequest('/api/feed', { method: 'POST', body: { activityId: MOCK_ACTIVITY_ID, action: 'unsave' } })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('unsave');
    expect(mockPrismaSavedActivity.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrismaSavedActivity.deleteMany).toHaveBeenCalledWith({
      where: { userId: MOCK_USER_ID, activityId: MOCK_ACTIVITY_ID },
    });
  });

  it('handles unsave for a non-existent save gracefully (deleteMany count: 0)', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    // deleteMany resolves with count 0 when no matching row exists — the
    // handler does not distinguish this case; it still returns success.
    mockPrismaSavedActivity.deleteMany.mockResolvedValue({ count: 0 });

    const res = await feedPOST(
      makeRequest('/api/feed', { method: 'POST', body: { activityId: MOCK_ACTIVITY_ID, action: 'unsave' } })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('unsave');
    expect(mockPrismaSavedActivity.deleteMany).toHaveBeenCalledOnce();
  });
});
