/**
 * Unit tests for the /api/discover/* route handlers.
 *
 * Routes covered:
 *   GET  /api/discover              — search activities (auth required)
 *   POST /api/discover              — search flights (auth required)
 *   GET  /api/discover/search       — search internal + external activities (rate-limited, no auth)
 *   POST /api/discover/import       — admin import from OpenTripMap (auth required)
 *   GET  /api/discover/recommendations — personalized recommendations (optional auth)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in setup.ts.
 * - EventsService and rate-limit are mocked at the top of this file.
 * - Handlers are called directly with minimal Request / NextRequest objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

import { GET, POST } from '@/app/api/discover/route';
import { GET as searchGET } from '@/app/api/discover/search/route';
import { POST as importPOST } from '@/app/api/discover/import/route';
import { GET as recoGET } from '@/app/api/discover/recommendations/route';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@/services/events.service', () => ({
  EventsService: {
    searchActivities: vi.fn(),
    searchEvents: vi.fn(),
    searchPlaces: vi.fn(),
    searchFlights: vi.fn(),
    getDestinationInfo: vi.fn(),
    getPriceEstimate: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  apiRateLimiter: {},
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Typed references
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaExternalActivity = vi.mocked(prisma.externalActivity);
const mockPrismaUser = vi.mocked(prisma.user);
const mockPrismaSavedActivity = vi.mocked(prisma.savedActivity);
const mockPrismaTrip = vi.mocked(prisma.trip);

// Import EventsService mock reference after vi.mock hoisting
import { EventsService } from '@/services/events.service';
import { checkRateLimit } from '@/lib/rate-limit';
const mockEventsService = EventsService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockCheckRateLimit = vi.mocked(checkRateLimit);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
};

function makeRequest(url: string, body?: unknown, method = 'GET'): Request {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeNextRequest(url: string, body?: unknown, method = 'GET'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// discover/route.ts — GET (search activities)
// ---------------------------------------------------------------------------

describe('GET /api/discover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('http://localhost:3000/api/discover?city=Paris&startDate=2026-04-01&endDate=2026-04-10');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when city param is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // city defaults to '' which fails min(1) validation
    const req = makeRequest('http://localhost:3000/api/discover?startDate=2026-04-01&endDate=2026-04-10');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
  });

  it('returns 200 with destination data for type=all', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockEventsService.getDestinationInfo.mockResolvedValueOnce({
      events: [],
      restaurants: [],
      attractions: [],
      nightlife: [],
      coordinates: { lat: 48.8566, lng: 2.3522 },
    } as ReturnType<typeof EventsService.getDestinationInfo> extends Promise<infer T> ? T : never);

    const req = makeRequest(
      'http://localhost:3000/api/discover?city=Paris&startDate=2026-04-01&endDate=2026-04-10&type=all',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('returns 200 with events data for type=events', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockEventsService.searchEvents.mockResolvedValueOnce([
      { id: 'evt-1', name: 'Concert', type: 'ticketmaster', date: '2026-04-05', venue: 'Arena' },
    ] as Awaited<ReturnType<typeof EventsService.searchEvents>>);

    const req = makeRequest(
      'http://localhost:3000/api/discover?city=Paris&startDate=2026-04-01&endDate=2026-04-10&type=events',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// discover/route.ts — POST (search flights)
// ---------------------------------------------------------------------------

describe('POST /api/discover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(
      'http://localhost:3000/api/discover',
      { origin: 'NYC', destination: 'Paris', adults: 2 },
      'POST',
    );
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 400 with invalid body (missing required fields)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest(
      'http://localhost:3000/api/discover',
      { adults: 2 }, // missing origin and destination
      'POST',
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
  });

  it('returns 200 with flight results on success', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockEventsService.searchFlights.mockResolvedValueOnce([
      {
        id: 'fl-1',
        price: { total: '450.00', currency: 'USD' },
        itineraries: [],
      },
    ] as Awaited<ReturnType<typeof EventsService.searchFlights>>);

    const req = makeRequest(
      'http://localhost:3000/api/discover',
      { origin: 'JFK', destination: 'CDG', adults: 1 },
      'POST',
    );
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('returns 400 when adults exceeds max (9)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest(
      'http://localhost:3000/api/discover',
      { origin: 'JFK', destination: 'CDG', adults: 10 },
      'POST',
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// discover/search/route.ts — GET (search by query params)
// ---------------------------------------------------------------------------

describe('GET /api/discover/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const req = makeNextRequest('http://localhost:3000/api/discover/search?q=museums');
    const res = await searchGET(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeNextRequest('http://localhost:3000/api/discover/search?q=museums');
    const res = await searchGET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when limit param is invalid', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      expires: '2099-01-01',
    });

    // limit=0 fails min(1)
    const req = makeNextRequest('http://localhost:3000/api/discover/search?limit=0');
    const res = await searchGET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  it('returns 200 with internal and external results on success', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      expires: '2099-01-01',
    });

    mockPrismaActivity.findMany.mockResolvedValueOnce([
      {
        id: 'act-1',
        name: 'Louvre Museum',
        description: 'World-famous museum',
        category: 'SIGHTSEEING',
        location: 'Paris',
        cost: 17,
        currency: 'EUR',
        priceRange: 'MODERATE',
        isPublic: true,
        shareCount: 20,
        createdAt: new Date(),
        trip: { title: 'Paris Trip', destination: { city: 'Paris', country: 'France' } },
        _count: { savedBy: 10, comments: 5, ratings: 8 },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>);

    mockPrismaExternalActivity.findMany.mockResolvedValueOnce([
      {
        id: 'ext-1',
        externalId: 'xid-1',
        source: 'OPENTRIPMAP',
        name: 'Eiffel Tower',
        description: 'Iconic landmark',
        category: 'Attractions',
        tags: ['monument', 'paris'],
        latitude: 48.8584,
        longitude: 2.2945,
        address: 'Champ de Mars',
        city: 'Paris',
        country: 'France',
        rating: 4.8,
        ratingCount: 50000,
        priceLevel: 2,
        imageUrl: 'https://example.com/eiffel.jpg',
        thumbnailUrl: null,
        websiteUrl: 'https://www.toureiffel.paris',
        searchText: 'Eiffel Tower Paris France',
        popularity: 100,
        lastFetched: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>);

    const req = makeNextRequest('http://localhost:3000/api/discover/search?q=paris&city=Paris');
    const res = await searchGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.internal).toHaveLength(1);
    expect(body.data.external).toHaveLength(1);
    expect(body.data.total).toBe(2);
  });

  it('returns 200 with only external results when source=external', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      expires: '2099-01-01',
    });

    mockPrismaExternalActivity.findMany.mockResolvedValueOnce([]);

    const req = makeNextRequest('http://localhost:3000/api/discover/search?source=external');
    const res = await searchGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Internal results should be empty since source=external
    expect(body.data.internal).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// discover/import/route.ts — POST (admin import)
// ---------------------------------------------------------------------------

describe('POST /api/discover/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/import',
      { latitude: 48.8566, longitude: 2.3522 },
      'POST',
    );
    const res = await importPOST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authentication required/i);
  });

  it('returns 400 when body is invalid (missing latitude/longitude)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/import',
      { city: 'Paris' }, // missing latitude and longitude
      'POST',
    );
    const res = await importPOST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
  });

  it('returns 400 when radius is out of range', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/import',
      { latitude: 48.8566, longitude: 2.3522, radius: 99 }, // below min 100
      'POST',
    );
    const res = await importPOST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
  });

  it('returns 500 when OPENTRIPMAP_API_KEY is not configured', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // Ensure env var is not set (it won't be in test environment)
    const originalKey = process.env.OPENTRIPMAP_API_KEY;
    delete process.env.OPENTRIPMAP_API_KEY;

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/import',
      { latitude: 48.8566, longitude: 2.3522, city: 'Paris', country: 'France' },
      'POST',
    );
    const res = await importPOST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/api key not configured/i);

    if (originalKey !== undefined) {
      process.env.OPENTRIPMAP_API_KEY = originalKey;
    }
  });

  it('returns 500 with descriptive error when OPENTRIPMAP_API_KEY missing (valid body)', async () => {
    // The import route reads OPENTRIPMAP_API_KEY as a module-level constant at import
    // time — it cannot be overridden via process.env in tests. This test verifies that
    // a fully valid, authenticated request still returns 500 with the correct error body
    // when the API key constant is empty (as it always is in the test environment).
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/import',
      {
        latitude: 48.8566,
        longitude: 2.3522,
        city: 'Paris',
        country: 'France',
        radius: 5000,
        limit: 10,
      },
      'POST',
    );
    const res = await importPOST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/api key not configured/i);
  });
});

// ---------------------------------------------------------------------------
// discover/recommendations/route.ts — GET (personalized recommendations)
// ---------------------------------------------------------------------------

describe('GET /api/discover/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when no city or country provided and no tripId', async () => {
    // Rate limit allows through
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    // Auth guard — route requires session before checking params
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      expires: '2099-01-01',
    });
    // User preferences lookup
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    // No saved activities
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce([]);

    const req = makeNextRequest('http://localhost:3000/api/discover/recommendations');
    const res = await recoGET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/city or country is required/i);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    const req = makeNextRequest('http://localhost:3000/api/discover/recommendations?city=Paris');
    const res = await recoGET(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('returns 200 with recommendations for a given city', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    // Authenticated user for personalization
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // User preferences
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      preferences: { interests: ['museums', 'food'] },
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    // Saved activities (none to exclude)
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce([]);

    // Internal recommendations
    mockPrismaActivity.findMany.mockResolvedValueOnce([
      {
        id: 'act-1',
        name: 'Louvre Museum',
        description: 'World-famous museum',
        category: 'SIGHTSEEING',
        location: 'Paris, France',
        cost: 17,
        currency: 'EUR',
        priceRange: 'MODERATE',
        isPublic: true,
        shareCount: 50,
        createdAt: new Date(),
        trip: { title: 'Paris Adventure', destination: { city: 'Paris', country: 'France' } },
        _count: { savedBy: 25, ratings: 15 },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>);

    // External recommendations
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce([
      {
        id: 'ext-1',
        externalId: 'xid-paris-1',
        source: 'OPENTRIPMAP',
        name: 'Eiffel Tower',
        description: 'Iconic iron lattice tower',
        category: 'Attractions',
        tags: ['monument', 'landmark'],
        latitude: 48.8584,
        longitude: 2.2945,
        address: 'Champ de Mars, 5 Av. Anatole France',
        city: 'Paris',
        country: 'France',
        rating: 4.9,
        ratingCount: 100000,
        priceLevel: 2,
        imageUrl: 'https://example.com/eiffel.jpg',
        thumbnailUrl: null,
        websiteUrl: 'https://www.toureiffel.paris',
        searchText: 'Eiffel Tower Paris France',
        popularity: 100,
        lastFetched: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/recommendations?city=Paris&limit=10',
    );
    const res = await recoGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toBeDefined();
    expect(body.data.recommendations.length).toBeGreaterThan(0);
    expect(body.data.context.city).toBe('Paris');
  });

  it('returns 200 with empty recommendations when user has no saved activities', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // User with no preferences
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      preferences: null,
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    // No saved activities
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce([]);

    // Empty internal recommendations
    mockPrismaActivity.findMany.mockResolvedValueOnce([]);

    // Empty external recommendations
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce([]);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/recommendations?city=Tokyo',
    );
    const res = await recoGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toHaveLength(0);
  });

  it('returns 200 using tripId destination when no city param', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // User preferences lookup
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      preferences: { interests: ['culture'] },
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    // No saved activities
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce([]);

    // Trip lookup for destination
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: 'trip-42',
      destination: { city: 'Rome', country: 'Italy' },
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    // Internal results
    mockPrismaActivity.findMany.mockResolvedValueOnce([]);

    // External results
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce([]);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/recommendations?tripId=trip-42',
    );
    const res = await recoGET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.context.city).toBe('Rome');
    expect(body.data.context.tripId).toBe('trip-42');
  });

  it('returns 401 when unauthenticated (auth guard added 2026-03-24)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });
    // No session — anonymous users are now rejected
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeNextRequest(
      'http://localhost:3000/api/discover/recommendations?country=France',
    );
    const res = await recoGET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

});
