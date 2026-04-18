/**
 * Unit tests for GET /api/venues/search — covers the Google Places API
 * integration (Phase 4 Session 3). The route queries Prisma first, then
 * optionally supplements with Google Places when key is set + q >= 3 chars +
 * DB result count is below the requested `limit`. Places hits are cached
 * to the Venue table (source='google_places'), then merged with DB wins on
 * (name+city) collision.
 *
 * Global mocks (prisma, next-auth, sentry, logger) come from setup.ts.
 * Local mocks: @/lib/rate-limit, @/lib/api/places.
 * The route reads process.env.GOOGLE_PLACES_API_KEY inline per request, so
 * mutating process.env per test is sufficient (no stubEnv-before-import).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Default mapPlaceToVenue returns a BAR-category shape; individual tests
// override via mockReturnValueOnce when they need a different category.
vi.mock('@/lib/api/places', () => ({
  searchPlaces: vi.fn().mockResolvedValue([]),
  inferVenueCategory: vi.fn((types: string[]) => {
    if (types.includes('bar')) return 'BAR';
    if (types.includes('cafe')) return 'COFFEE';
    if (types.includes('restaurant')) return 'RESTAURANT';
    if (types.includes('park')) return 'PARK';
    if (types.includes('gym')) return 'GYM';
    return 'OTHER';
  }),
  parseAddressLocale: vi.fn(() => ({ city: 'NYC', country: 'US' })),
  buildPlacePhotoUrl: vi.fn(() => null),
  mapPlaceToVenue: vi.fn((place: Record<string, unknown>) => ({
    id: `gp_${place.place_id as string}`,
    name: place.name as string,
    externalId: place.place_id as string,
    source: 'google_places',
    category: 'BAR',
    city: 'NYC',
    country: 'US',
    latitude: 40.75,
    longitude: -73.95,
    address: (place.formatted_address as string) ?? null,
    imageUrl: null,
  })),
}));

import { GET } from '@/app/api/venues/search/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { searchPlaces, mapPlaceToVenue } from '@/lib/api/places';

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockMapPlaceToVenue = vi.mocked(mapPlaceToVenue);

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaVenue = prisma.venue as unknown as {
  findMany: MockFn;
  findFirst: MockFn;
  create: MockFn;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'cluser000000000000000001a';
const session = {
  user: { id: USER_ID, name: 'Alice', email: 'alice@test.com' },
  expires: '2099-01-01',
};

const dbVenueCoffee = {
  id: 'venue-db-1',
  name: 'Coffee Shop',
  address: '123 Main',
  city: 'NYC',
  country: 'US',
  category: 'COFFEE',
  latitude: 40.7,
  longitude: -74.0,
  imageUrl: null,
};

const dbVenueBar = {
  id: 'venue-db-2',
  name: 'Downtown Bar',
  address: '456 Oak',
  city: 'NYC',
  country: 'US',
  category: 'BAR',
  latitude: 40.71,
  longitude: -74.01,
  imageUrl: null,
};

const placesResultBar = {
  place_id: 'place-abc-1',
  name: 'Downtown Bar',
  formatted_address: '456 Oak, NYC, NY, USA',
  geometry: { location: { lat: 40.75, lng: -73.95 } },
  types: ['bar', 'point_of_interest'],
  rating: 4.2,
};

const placesResultCoffee = {
  place_id: 'place-abc-2',
  name: 'New Cafe',
  formatted_address: '789 Pine, NYC, NY, USA',
  geometry: { location: { lat: 40.76, lng: -73.96 } },
  types: ['cafe', 'food'],
  rating: 4.5,
};

/** Canonical "created Bar row" echoed by prisma.venue.create in multiple tests. */
const createdBarRow = {
  id: 'venue-new-1',
  name: 'Downtown Bar',
  address: '456 Oak, NYC, NY, USA',
  city: 'NYC',
  country: 'US',
  category: 'BAR' as const,
  latitude: 40.75,
  longitude: -73.95,
  imageUrl: null,
};

const makeReq = (query: string = '') =>
  new NextRequest(`http://localhost/api/venues/search${query ? `?${query}` : ''}`, {
    method: 'GET',
  });

// Save the original env var so the afterAll can restore it if set.
const originalKey = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) because the "cap at limit" test queues
  // mockResolvedValueOnce values the route short-circuits past, which
  // clearAllMocks does NOT flush. resetAllMocks flushes the Once queues.
  vi.resetAllMocks();
  // Re-arm factory-level mockResolvedValue defaults that resetAllMocks wiped.
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  mockSearchPlaces.mockResolvedValue([]);
  // Re-arm mapPlaceToVenue default implementation.
  mockMapPlaceToVenue.mockImplementation((place: unknown) => {
    const p = place as Record<string, unknown>;
    return {
      id: `gp_${p.place_id as string}`,
      name: p.name as string,
      externalId: p.place_id as string,
      source: 'google_places',
      category: 'BAR',
      city: 'NYC',
      country: 'US',
      latitude: 40.75,
      longitude: -73.95,
      address: (p.formatted_address as string) ?? null,
      imageUrl: null,
    };
  });
  delete process.env.GOOGLE_PLACES_API_KEY;
});

afterAll(() => {
  if (originalKey !== undefined) {
    process.env.GOOGLE_PLACES_API_KEY = originalKey;
  }
});

// ===========================================================================
// Auth + validation
// ===========================================================================
describe('GET /api/venues/search — auth + validation', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq('q=coffee'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when limit is not a number', async () => {
    mockGetServerSession.mockResolvedValueOnce(session);
    const res = await GET(makeReq('q=coffee&limit=abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 when category is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(session);
    const res = await GET(makeReq('q=coffee&category=NOT_A_REAL_CATEGORY'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(session);
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await GET(makeReq('q=coffee'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });
});

// ===========================================================================
// DB-only path — Places not called
// ===========================================================================
describe('GET /api/venues/search — DB-only path (Places not invoked)', () => {
  it('returns DB results and does not call Places when GOOGLE_PLACES_API_KEY is undefined', async () => {
    // beforeEach already deletes the env var.
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueCoffee]);

    const res = await GET(makeReq('q=coffee&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0].id).toBe('venue-db-1');
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  it('does not call Places when q param is missing (even with key set)', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueCoffee]);

    const res = await GET(makeReq('city=NYC&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.venues).toHaveLength(1);
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  it('does not call Places when q is under 3 chars', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueCoffee]);

    const res = await GET(makeReq('q=co&limit=10'));
    expect(res.status).toBe(200);
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  it('does not call Places when DB already returned `limit` rows (short-circuit)', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    // limit=2, DB returns 2 -> no room for Places supplementation
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueCoffee, dbVenueBar]);

    const res = await GET(makeReq('q=coffee&limit=2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.venues).toHaveLength(2);
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Places API path — key set + q length>=3 + room for more results
// ===========================================================================
describe('GET /api/venues/search — Places API path', () => {
  it('calls searchPlaces with "<q> in <city>" query when both q and city set', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([]); // no DB hits — room for Places
    mockSearchPlaces.mockResolvedValueOnce([]); // bail early with [] so no upsert

    const res = await GET(makeReq('q=bars&city=NYC&limit=10'));
    expect(res.status).toBe(200);
    expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
    expect(mockSearchPlaces).toHaveBeenCalledWith({ query: 'bars in NYC' });
  });

  it('calls searchPlaces with "<q>" when only q is set', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]);

    const res = await GET(makeReq('q=bars&limit=10'));
    expect(res.status).toBe(200);
    expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
    expect(mockSearchPlaces).toHaveBeenCalledWith({ query: 'bars' });
  });

  it('maps Google Places result to Venue shape and includes BAR category in response', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([placesResultBar]);
    mockPrismaVenue.findFirst.mockResolvedValueOnce(null);
    mockPrismaVenue.create.mockResolvedValueOnce(createdBarRow);

    const res = await GET(makeReq('q=bars&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0]).toMatchObject({ name: 'Downtown Bar', category: 'BAR', city: 'NYC' });
    expect(mockMapPlaceToVenue).toHaveBeenCalledTimes(1);
  });

  it('upserts new Places result into DB via findFirst + create', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([placesResultBar]);
    mockPrismaVenue.findFirst.mockResolvedValueOnce(null);
    mockPrismaVenue.create.mockResolvedValueOnce(createdBarRow);

    const res = await GET(makeReq('q=bars&limit=10'));
    expect(res.status).toBe(200);

    // Route looks up by (source, externalId) first.
    expect(mockPrismaVenue.findFirst).toHaveBeenCalledTimes(1);
    const findFirstArg = mockPrismaVenue.findFirst.mock.calls[0]?.[0];
    expect(findFirstArg?.where).toEqual({
      source: 'google_places',
      externalId: 'place-abc-1',
    });

    // Then creates on miss, carrying over fields from the mapped candidate.
    expect(mockPrismaVenue.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrismaVenue.create.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({
      name: 'Downtown Bar',
      externalId: 'place-abc-1',
      source: 'google_places',
      category: 'BAR',
    });
  });

  it('reuses existing cached Places row via findFirst (does not call create)', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([placesResultBar]);
    // findFirst returns existing — create is NOT called.
    mockPrismaVenue.findFirst.mockResolvedValueOnce({ ...createdBarRow, id: 'venue-existing-1' });

    const res = await GET(makeReq('q=bars&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0].id).toBe('venue-existing-1');
    expect(mockPrismaVenue.create).not.toHaveBeenCalled();
  });

  it('dedupes when DB and Places return same name+city — DB row wins', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    // DB + Places both return "Downtown Bar" in NYC.
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueBar]);
    mockSearchPlaces.mockResolvedValueOnce([placesResultBar]);
    mockPrismaVenue.findFirst.mockResolvedValueOnce(null);
    mockPrismaVenue.create.mockResolvedValueOnce({ ...createdBarRow, id: 'venue-new-collision' });

    const res = await GET(makeReq('q=bars&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only the DB row survives — Places collision is dropped.
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0].id).toBe('venue-db-2');
    expect(body.venues.find((v: { id: string }) => v.id === 'venue-new-collision')).toBeUndefined();
  });

  it('filters Places results by category query param', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([]);
    // Two Places results — one BAR, one COFFEE. Override mapPlaceToVenue so each
    // returns its actual inferred category.
    mockSearchPlaces.mockResolvedValueOnce([placesResultBar, placesResultCoffee]);
    mockMapPlaceToVenue
      .mockReturnValueOnce({ ...createdBarRow, id: 'gp_place-abc-1', externalId: 'place-abc-1', source: 'google_places' })
      .mockReturnValueOnce({
        ...createdBarRow,
        id: 'gp_place-abc-2',
        externalId: 'place-abc-2',
        source: 'google_places',
        name: 'New Cafe',
        category: 'COFFEE',
        address: '789 Pine, NYC, NY, USA',
      });

    // Only the BAR result should survive the category filter.
    mockPrismaVenue.findFirst.mockResolvedValueOnce(null);
    mockPrismaVenue.create.mockResolvedValueOnce({ ...createdBarRow, id: 'venue-new-bar' });

    const res = await GET(makeReq('q=bars&category=BAR&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0].category).toBe('BAR');
    // The COFFEE-category result should never reach the DB.
    expect(mockPrismaVenue.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrismaVenue.create.mock.calls[0]?.[0];
    expect(createArg?.data?.category).toBe('BAR');
  });

  it('caps merged results at `limit` (short-circuits when DB fills cap)', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    // limit=1 and DB returns 1 — dbVenues.length(1) is NOT < limit(1), so
    // shouldCallPlaces=false. The cap is enforced implicitly by the short-circuit.
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueCoffee]);

    const res = await GET(makeReq('q=bars&limit=1'));
    expect(res.status).toBe(200);
    expect(mockSearchPlaces).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.venues).toHaveLength(1);
  });
});

// ===========================================================================
// Graceful degradation — Places failures don't break the route
// ===========================================================================
describe('GET /api/venues/search — graceful degradation', () => {
  it('returns DB results when searchPlaces returns empty array', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueCoffee]);
    mockSearchPlaces.mockResolvedValueOnce([]); // graceful no-results

    const res = await GET(makeReq('q=coffee&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0].id).toBe('venue-db-1');
    // findFirst/create should NOT be invoked since there were no Places results.
    expect(mockPrismaVenue.findFirst).not.toHaveBeenCalled();
    expect(mockPrismaVenue.create).not.toHaveBeenCalled();
  });

  it('still returns 200 with remaining DB results when a Places row fails to cache', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    mockGetServerSession.mockResolvedValueOnce(session);
    mockPrismaVenue.findMany.mockResolvedValueOnce([dbVenueCoffee]);
    mockSearchPlaces.mockResolvedValueOnce([placesResultBar]);
    // Simulate a DB error during cache: findFirst throws. The per-row try/catch
    // should swallow the error and continue, yielding just the DB row.
    mockPrismaVenue.findFirst.mockRejectedValueOnce(new Error('db hiccup'));

    const res = await GET(makeReq('q=coffee&limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // DB row survives even though the Places cache failed.
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0].id).toBe('venue-db-1');
  });
});
