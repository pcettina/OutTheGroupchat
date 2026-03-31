/**
 * Unit tests for:
 *   GET /api/trips/[tripId]/suggestions
 *   GET /api/trips/[tripId]/flights
 *
 * Strategy
 * --------
 * - All Prisma, NextAuth, and logger mocks are hoisted via setup.ts.
 * - External API libraries (Ticketmaster, Places, Amadeus flights, costs) are
 *   mocked here so no real HTTP requests are made.
 * - Each test sets up its own mocks using mockResolvedValueOnce() to prevent
 *   state leakage between tests.
 * - vi.clearAllMocks() is called in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock external API libraries — no real HTTP calls
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/ticketmaster', () => ({
  searchEvents: vi.fn(),
}));

vi.mock('@/lib/api/places', () => ({
  searchPlaces: vi.fn(),
}));

vi.mock('@/lib/api/flights', () => ({
  searchFlights: vi.fn(),
  getAirportCode: vi.fn(),
}));

vi.mock('@/lib/utils/costs', () => ({
  calculateDailyCosts: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are registered
// ---------------------------------------------------------------------------
import { GET as suggestionsGET } from '@/app/api/trips/[tripId]/suggestions/route';
import { GET as flightsGET } from '@/app/api/trips/[tripId]/flights/route';
import { searchEvents } from '@/lib/api/ticketmaster';
import { searchPlaces } from '@/lib/api/places';
import { searchFlights, getAirportCode } from '@/lib/api/flights';
import { calculateDailyCosts } from '@/lib/utils/costs';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaUser = vi.mocked(prisma.user);
const mockSearchEvents = vi.mocked(searchEvents);
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockSearchFlights = vi.mocked(searchFlights);
const mockGetAirportCode = vi.mocked(getAirportCode);
const mockCalculateDailyCosts = vi.mocked(calculateDailyCosts);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0000mg0hb9gkfxe0';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: '2099-01-01',
};

/** Trip owned by MOCK_USER_ID with that user as a member. */
const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Paris Getaway',
  description: 'A lovely trip to Paris',
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

/** Trip owned by a different user with no overlapping members. */
const MOCK_TRIP_OTHER_OWNER = {
  ...MOCK_TRIP,
  ownerId: 'other-user-id',
  members: [],
};

/** Build a minimal Request object for App Router handlers. */
function makeRequest(path: string, method = 'GET'): Request {
  return new Request(`http://localhost:3000${path}`, { method });
}

/** Parse JSON from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

/** Read plain text from a Response (for non-JSON error bodies). */
async function parseText(res: Response) {
  return res.text();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/suggestions
// ===========================================================================
describe('GET /api/trips/[tripId]/suggestions', () => {
  /** Helper that calls the handler with resolved dynamic params. */
  async function callSuggestions(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as never);
    const req = makeRequest(`/api/trips/${tripId}/suggestions`);
    return suggestionsGET(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callSuggestions(MOCK_TRIP_ID, null);

    expect(res.status).toBe(401);
    expect(mockPrismaTrip.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callSuggestions(MOCK_TRIP_ID);
    const body = await parseText(res);

    expect(res.status).toBe(404);
    expect(body).toContain('Trip not found');
  });

  it('returns 401 when the user is not a member or owner', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_OTHER_OWNER as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    const res = await callSuggestions(MOCK_TRIP_ID);

    expect(res.status).toBe(401);
    expect(mockSearchEvents).not.toHaveBeenCalled();
  });

  it('returns 200 with suggestions data when authenticated as owner', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockSearchEvents.mockResolvedValueOnce([
      { id: 'evt-1', name: 'Eiffel Tower Concert', url: 'https://example.com/evt-1', dates: { start: { localDate: '2026-06-02', localTime: '20:00:00' } } },
    ]);
    mockSearchPlaces.mockResolvedValueOnce([
      { place_id: 'place-1', name: 'Louvre Museum', formatted_address: 'Rue de Rivoli, 75001 Paris', geometry: { location: { lat: 48.8606, lng: 2.3376 } }, types: ['museum'] },
    ]);
    mockSearchPlaces.mockResolvedValueOnce([
      { place_id: 'place-2', name: 'Le Petit Bistro', formatted_address: '1 Rue de la Paix, 75001 Paris', geometry: { location: { lat: 48.8698, lng: 2.3309 } }, types: ['restaurant'] },
    ]);
    mockCalculateDailyCosts.mockReturnValueOnce({
      accommodation: 150,
      food: 60,
      activities: 50,
      transportation: 30,
      total: 290,
    });

    const res = await callSuggestions(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('trip');
    expect(body).toHaveProperty('suggestions');
    expect(body.suggestions).toHaveProperty('events');
    expect(body.suggestions).toHaveProperty('attractions');
    expect(body.suggestions).toHaveProperty('restaurants');
    expect(body).toHaveProperty('costs');
    expect(body.costs).toHaveProperty('daily');
    expect(body.costs).toHaveProperty('total');
    expect(body.suggestions.events).toHaveLength(1);
    expect(body.suggestions.attractions).toHaveLength(1);
    expect(body.suggestions.restaurants).toHaveLength(1);
  });

  it('returns 200 when the user is a trip member (not owner)', async () => {
    const tripAsMember = {
      ...MOCK_TRIP_OTHER_OWNER,
      members: [{ id: MOCK_USER_ID, userId: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' }],
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripAsMember as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce({
      accommodation: 150,
      food: 60,
      activities: 50,
      transportation: 30,
      total: 290,
    });

    const res = await callSuggestions(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('suggestions');
  });

  it('calls searchEvents with the correct city and dates', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce({
      accommodation: 150,
      food: 60,
      activities: 50,
      transportation: 30,
      total: 290,
    });

    await callSuggestions(MOCK_TRIP_ID);

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'Paris',
        startDateTime: '2026-06-01',
        endDateTime: '2026-06-10',
      })
    );
  });

  it('handles a trip with no destination city gracefully', async () => {
    const tripNoCity = { ...MOCK_TRIP, destination: null };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripNoCity as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockSearchEvents.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockCalculateDailyCosts.mockReturnValueOnce({
      accommodation: 150,
      food: 60,
      activities: 50,
      transportation: 30,
      total: 290,
    });

    const res = await callSuggestions(MOCK_TRIP_ID);

    expect(res.status).toBe(200);
    // Route falls back to 'Unknown' when city is missing
    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Unknown' })
    );
  });

  it('returns 500 when Prisma throws during trip lookup', async () => {
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await callSuggestions(MOCK_TRIP_ID);
    const body = await parseText(res);

    expect(res.status).toBe(500);
    expect(body).toContain('Internal error');
  });

  it('returns 500 when an external API call throws unexpectedly', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    // searchEvents throws (not gracefully returns []) — route catch block fires
    mockSearchEvents.mockRejectedValueOnce(new Error('Ticketmaster API down'));

    const res = await callSuggestions(MOCK_TRIP_ID);

    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// GET /api/trips/[tripId]/flights
// ===========================================================================
describe('GET /api/trips/[tripId]/flights', () => {
  /** Helper that calls the handler with resolved dynamic params. */
  async function callFlights(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as never);
    const req = makeRequest(`/api/trips/${tripId}/flights`);
    return flightsGET(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callFlights(MOCK_TRIP_ID, null);

    expect(res.status).toBe(401);
    expect(mockPrismaTrip.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseText(res);

    expect(res.status).toBe(404);
    expect(body).toContain('Trip not found');
  });

  it('returns 401 when the user is not a member or owner', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_OTHER_OWNER as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    const res = await callFlights(MOCK_TRIP_ID);

    expect(res.status).toBe(401);
    expect(mockGetAirportCode).not.toHaveBeenCalled();
  });

  it('returns 400 when airport code cannot be found for origin', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    // originCode returns null → route returns 400
    mockGetAirportCode.mockResolvedValueOnce(null);
    mockGetAirportCode.mockResolvedValueOnce('CDG');

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseText(res);

    expect(res.status).toBe(400);
    expect(body).toContain('Could not find airport codes');
  });

  it('returns 400 when airport code cannot be found for destination', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    // destinationCode returns null → route returns 400
    mockGetAirportCode.mockResolvedValueOnce(null);

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseText(res);

    expect(res.status).toBe(400);
    expect(body).toContain('Could not find airport codes');
  });

  it('returns 200 with flight data when all lookups succeed', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([
      {
        id: 'flight-1',
        source: { iataCode: 'JFK', cityName: 'New York' },
        destination: { iataCode: 'CDG', cityName: 'Paris' },
        itineraries: [],
        price: { currency: 'USD', total: '850.00', base: '700.00' },
        numberOfBookableSeats: 9,
      },
    ]);

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('flights');
    expect(body).toHaveProperty('origin');
    expect(body).toHaveProperty('destination');
    expect(body.origin.city).toBe('New York');
    expect(body.origin.code).toBe('JFK');
    expect(body.destination.city).toBe('Paris');
    expect(body.destination.code).toBe('CDG');
    expect(body.flights).toHaveLength(1);
    expect(body.flights[0].id).toBe('flight-1');
  });

  it('returns 200 as a trip member (not owner)', async () => {
    const tripAsMember = {
      ...MOCK_TRIP_OTHER_OWNER,
      members: [{ id: MOCK_USER_ID, userId: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' }],
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripAsMember as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'Los Angeles' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mockGetAirportCode.mockResolvedValueOnce('LAX');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.origin.city).toBe('Los Angeles');
    expect(body.origin.code).toBe('LAX');
  });

  it('defaults origin city to New York when user has no city set', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: null } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.origin.city).toBe('New York');
  });

  it('calls searchFlights with the correct parameters', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    await callFlights(MOCK_TRIP_ID);

    expect(mockSearchFlights).toHaveBeenCalledWith(
      expect.objectContaining({
        originLocationCode: 'JFK',
        destinationLocationCode: 'CDG',
        departureDate: '2026-06-01',
        returnDate: '2026-06-10',
        nonStop: true,
        max: 5,
      })
    );
  });

  it('returns 500 when Prisma throws during trip lookup', async () => {
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseText(res);

    expect(res.status).toBe(500);
    expect(body).toContain('Internal error');
  });

  it('returns 500 when Prisma throws during user lookup', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('User DB error'));

    const res = await callFlights(MOCK_TRIP_ID);
    const body = await parseText(res);

    expect(res.status).toBe(500);
    expect(body).toContain('Internal error');
  });
});
