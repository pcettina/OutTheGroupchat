/**
 * Unit tests for GET /api/trips/[tripId]/suggestions
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, Ticketmaster, Places, costs)
 *   are mocked at the module level so no real I/O occurs.
 * - Each test sets up its own mocks using mockResolvedValueOnce / mockReturnValueOnce
 *   to avoid state leakage between test cases.
 * - vi.clearAllMocks() in beforeEach resets call counts without wiping implementations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { searchEvents } from '@/lib/api/ticketmaster';
import { searchPlaces } from '@/lib/api/places';
import { calculateDailyCosts } from '@/lib/utils/costs';

// ---------------------------------------------------------------------------
// Module-level mocks (must be hoisted before any import that uses these)
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/ticketmaster', () => ({
  searchEvents: vi.fn(),
}));

vi.mock('@/lib/api/places', () => ({
  searchPlaces: vi.fn(),
}));

vi.mock('@/lib/utils/costs', () => ({
  calculateDailyCosts: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import route handler under test
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/trips/[tripId]/suggestions/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip) as { findUnique: ReturnType<typeof vi.fn> };
const mockSearchEvents = vi.mocked(searchEvents);
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockCalculateDailyCosts = vi.mocked(calculateDailyCosts);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_OTHER_USER_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_TRIP_ID = 'clh7nz5vr0000mg0hb9gkfxe0';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: '2099-01-01',
};

/** A minimal trip with the owner as a member (via members array of User-like objects). */
const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Paris Trip',
  description: 'A trip to Paris',
  destination: { city: 'Paris', country: 'France' },
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-06-10'),
  isPublic: false,
  ownerId: MOCK_USER_ID,
  status: 'PLANNING',
  viewCount: 0,
  coverImage: null,
  budget: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  members: [{ id: MOCK_USER_ID, userId: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' }],
};

/** A trip owned by someone else with no matching members. */
const MOCK_FOREIGN_TRIP = {
  ...MOCK_TRIP,
  ownerId: MOCK_OTHER_USER_ID,
  members: [{ id: MOCK_OTHER_USER_ID, userId: MOCK_OTHER_USER_ID, name: 'Other User', email: 'other@example.com' }],
};

/** Sample Ticketmaster events. */
const MOCK_EVENTS = [
  {
    id: 'evt-1',
    name: 'Paris Concert',
    url: 'https://ticketmaster.com/evt-1',
    dates: { start: { localDate: '2026-06-05', localTime: '20:00:00' } },
    priceRanges: [{ min: 40, max: 120, currency: 'EUR' }],
  },
  {
    id: 'evt-2',
    name: 'Art Exhibition',
    url: 'https://ticketmaster.com/evt-2',
    dates: { start: { localDate: '2026-06-07', localTime: '10:00:00' } },
  },
];

/** Sample Places (attractions). */
const MOCK_ATTRACTIONS = [
  {
    place_id: 'place-eiffel',
    name: 'Eiffel Tower',
    formatted_address: 'Champ de Mars, Paris',
    geometry: { location: { lat: 48.8584, lng: 2.2945 } },
    rating: 4.7,
    types: ['tourist_attraction', 'point_of_interest'],
  },
];

/** Sample Places (restaurants). */
const MOCK_RESTAURANTS = [
  {
    place_id: 'place-cafe',
    name: 'Café de Flore',
    formatted_address: '172 Bd Saint-Germain, Paris',
    geometry: { location: { lat: 48.854, lng: 2.332 } },
    price_level: 3,
    rating: 4.5,
    types: ['restaurant', 'food'],
  },
];

/** The daily costs object returned by calculateDailyCosts for 'moderate'. */
const MOCK_DAILY_COSTS = {
  accommodation: 150,
  food: 60,
  activities: 50,
  transportation: 30,
  total: 290,
};

/** Build a minimal Request object compatible with App Router handlers. */
function makeRequest(path: string): Request {
  return new Request(`http://localhost:3000${path}`, { method: 'GET' });
}

/** Parse the JSON body from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

/** Helper to call the GET handler with resolved dynamic params. */
async function callGet(tripId: string) {
  const req = makeRequest(`/api/trips/${tripId}/suggestions`);
  return GET(req, { params: { tripId } });
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to avoid state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/suggestions
// ===========================================================================
describe('GET /api/trips/[tripId]/suggestions', () => {
  // ─── Auth / access guards ──────────────────────────────────────────────

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(401);
    expect(mockPrismaTrip.findUnique).not.toHaveBeenCalled();
    expect(mockSearchEvents).not.toHaveBeenCalled();
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  it('returns 401 when session exists but user id is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'Ghost' },
      expires: '2099-01-01',
    } as never);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(401);
    expect(mockPrismaTrip.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when trip does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(404);
    expect(mockSearchEvents).not.toHaveBeenCalled();
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not the owner and not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_FOREIGN_TRIP);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(401);
    expect(mockSearchEvents).not.toHaveBeenCalled();
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  // ─── Successful responses ─────────────────────────────────────────────

  it('returns 200 with suggestions and costs when owner calls the route', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce(MOCK_EVENTS);
    mockSearchPlaces
      .mockResolvedValueOnce(MOCK_ATTRACTIONS)  // tourist_attraction call
      .mockResolvedValueOnce(MOCK_RESTAURANTS); // restaurant call
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.trip).toBeDefined();
    expect(body.suggestions).toBeDefined();
    expect(body.costs).toBeDefined();
  });

  it('returns events, attractions, and restaurants in the suggestions object', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce(MOCK_EVENTS);
    mockSearchPlaces
      .mockResolvedValueOnce(MOCK_ATTRACTIONS)
      .mockResolvedValueOnce(MOCK_RESTAURANTS);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(body.suggestions.events).toHaveLength(2);
    expect(body.suggestions.attractions).toHaveLength(1);
    expect(body.suggestions.restaurants).toHaveLength(1);
    expect(body.suggestions.events[0].name).toBe('Paris Concert');
    expect(body.suggestions.attractions[0].name).toBe('Eiffel Tower');
    expect(body.suggestions.restaurants[0].name).toBe('Café de Flore');
  });

  it('allows a non-owner trip member to view suggestions', async () => {
    const memberTrip = {
      ...MOCK_FOREIGN_TRIP,
      members: [
        { id: MOCK_OTHER_USER_ID, userId: MOCK_OTHER_USER_ID, name: 'Other User', email: 'other@example.com' },
        { id: MOCK_USER_ID, userId: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
      ],
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(memberTrip);
    mockSearchEvents.mockResolvedValueOnce(MOCK_EVENTS);
    mockSearchPlaces
      .mockResolvedValueOnce(MOCK_ATTRACTIONS)
      .mockResolvedValueOnce(MOCK_RESTAURANTS);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(200);
  });

  // ─── External API call arguments ─────────────────────────────────────

  it('passes the trip city to searchEvents', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    await callGet(MOCK_TRIP_ID);

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Paris' })
    );
  });

  it('passes formatted ISO start/end dates to searchEvents', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    await callGet(MOCK_TRIP_ID);

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startDateTime: '2026-06-01',
        endDateTime: '2026-06-10',
      })
    );
  });

  it('queries attractions with tourist_attraction type and city name', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    await callGet(MOCK_TRIP_ID);

    expect(mockSearchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tourist_attraction',
        query: expect.stringContaining('Paris'),
      })
    );
  });

  it('queries restaurants with restaurant type and city name', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    await callGet(MOCK_TRIP_ID);

    expect(mockSearchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'restaurant',
        query: expect.stringContaining('Paris'),
      })
    );
  });

  it('calls calculateDailyCosts with moderate tier', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    await callGet(MOCK_TRIP_ID);

    expect(mockCalculateDailyCosts).toHaveBeenCalledWith('moderate');
  });

  // ─── Costs calculation ────────────────────────────────────────────────

  it('returns the correct daily costs in the response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(body.costs.daily).toEqual(MOCK_DAILY_COSTS);
  });

  it('computes total cost as daily.total multiplied by trip duration in days', async () => {
    // Trip: 2026-06-01 -> 2026-06-10 = 9 days
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    // 9 days * 290 daily total = 2610
    expect(body.costs.total).toBe(MOCK_DAILY_COSTS.total * 9);
  });

  // ─── Edge cases: empty external API results ───────────────────────────

  it('returns empty arrays when Ticketmaster returns no events', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces
      .mockResolvedValueOnce(MOCK_ATTRACTIONS)
      .mockResolvedValueOnce(MOCK_RESTAURANTS);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.suggestions.events).toEqual([]);
    expect(body.suggestions.attractions).toHaveLength(1);
    expect(body.suggestions.restaurants).toHaveLength(1);
  });

  it('returns empty arrays when Places returns no attractions or restaurants', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce(MOCK_EVENTS);
    mockSearchPlaces
      .mockResolvedValueOnce([]) // attractions
      .mockResolvedValueOnce([]); // restaurants
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.suggestions.events).toHaveLength(2);
    expect(body.suggestions.attractions).toEqual([]);
    expect(body.suggestions.restaurants).toEqual([]);
  });

  it('returns all-empty suggestions when all external APIs return empty arrays', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.suggestions.events).toEqual([]);
    expect(body.suggestions.attractions).toEqual([]);
    expect(body.suggestions.restaurants).toEqual([]);
  });

  // ─── Missing destination handling ─────────────────────────────────────

  it('uses "Unknown" as city when destination is null', async () => {
    const tripNoDest = { ...MOCK_TRIP, destination: null };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripNoDest);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Unknown' })
    );
    // suggestions structure should still be present
    expect(body.suggestions).toBeDefined();
  });

  it('uses "Unknown" as city when destination object has no city property', async () => {
    const tripNoCity = { ...MOCK_TRIP, destination: { country: 'France' } };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripNoCity);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    await callGet(MOCK_TRIP_ID);

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Unknown' })
    );
  });

  // ─── Database failure ─────────────────────────────────────────────────

  it('returns 500 when Prisma findUnique throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(500);
    expect(mockSearchEvents).not.toHaveBeenCalled();
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  // ─── Parallel API call verification ──────────────────────────────────

  it('calls searchEvents and searchPlaces (twice) in the same request', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce(MOCK_EVENTS);
    mockSearchPlaces
      .mockResolvedValueOnce(MOCK_ATTRACTIONS)
      .mockResolvedValueOnce(MOCK_RESTAURANTS);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    await callGet(MOCK_TRIP_ID);

    expect(mockSearchEvents).toHaveBeenCalledTimes(1);
    expect(mockSearchPlaces).toHaveBeenCalledTimes(2);
  });

  // ─── Response structure ───────────────────────────────────────────────

  it('response includes the trip object at the top level', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(body.trip.id).toBe(MOCK_TRIP_ID);
    expect(body.trip.title).toBe('Paris Trip');
  });

  it('response costs object contains both daily and total fields', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce(MOCK_DAILY_COSTS);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(body.costs).toHaveProperty('daily');
    expect(body.costs).toHaveProperty('total');
    expect(typeof body.costs.total).toBe('number');
  });
});
