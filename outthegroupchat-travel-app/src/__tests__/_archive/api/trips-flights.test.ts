/**
 * Unit tests for GET /api/trips/[tripId]/flights
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked globally
 *   via src/__tests__/setup.ts.
 * - The Amadeus flight library (@/lib/api/flights) is mocked locally in this
 *   file so that searchFlights and getAirportCode never make real HTTP calls.
 * - Each test sets up its own mocks using mockResolvedValueOnce() to prevent
 *   state leakage between tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { searchFlights, getAirportCode } from '@/lib/api/flights';

// Mock the Amadeus flights library — never make real HTTP calls in tests.
vi.mock('@/lib/api/flights', () => ({
  searchFlights: vi.fn(),
  getAirportCode: vi.fn(),
}));

// Import the route handler under test.
import { GET } from '@/app/api/trips/[tripId]/flights/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip) as { findUnique: ReturnType<typeof vi.fn> };
const mockPrismaUser = vi.mocked(prisma.user) as { findUnique: ReturnType<typeof vi.fn> };
const mockSearchFlights = vi.mocked(searchFlights);
const mockGetAirportCode = vi.mocked(getAirportCode);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-abc-123';
const MOCK_TRIP_ID = 'trip-xyz-456';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: '2099-01-01',
};

/** A minimal TripMember row. Note: the route checks member.id === session.user.id */
const MOCK_MEMBER = {
  id: MOCK_USER_ID,
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'MEMBER',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

/** A minimal Trip row as returned by prisma.trip.findUnique with members included. */
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
  members: [MOCK_MEMBER],
};

/** A minimal FlightOffer as returned by the mocked searchFlights function. */
const MOCK_FLIGHT_OFFER = {
  id: 'flight-offer-1',
  source: { iataCode: 'JFK', cityName: 'New York' },
  destination: { iataCode: 'CDG', cityName: 'Paris' },
  itineraries: [
    {
      duration: 'PT7H30M',
      segments: [
        {
          departure: { iataCode: 'JFK', at: '2026-06-01T10:00:00' },
          arrival: { iataCode: 'CDG', at: '2026-06-01T22:30:00' },
          carrierCode: 'AF',
          number: '007',
          aircraft: { code: '777' },
          duration: 'PT7H30M',
          id: 'seg-1',
        },
      ],
    },
  ],
  price: { currency: 'USD', total: '850.00', base: '700.00' },
  numberOfBookableSeats: 9,
};

/** Build a minimal Request accepted by App Router handlers. */
function makeRequest(path: string, method = 'GET'): Request {
  return new Request(`http://localhost:3000${path}`, { method });
}

/** Parse the JSON body from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/flights
// ===========================================================================
describe('GET /api/trips/[tripId]/flights', () => {
  /** Helper: call the handler with a resolved params object. */
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as never);
    const req = makeRequest(`/api/trips/${tripId}/flights`);
    return GET(req, { params: { tripId } });
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  it('returns 401 when there is no session', async () => {
    const res = await callGet(MOCK_TRIP_ID, null);

    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
    expect(mockPrismaTrip.findUnique).not.toHaveBeenCalled();
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  it('returns 401 when session exists but user.id is missing', async () => {
    const sessionWithoutId = { user: { name: 'Test', email: 'test@x.com' }, expires: '2099-01-01' };
    const res = await callGet(MOCK_TRIP_ID, sessionWithoutId);

    expect(res.status).toBe(401);
    expect(mockPrismaTrip.findUnique).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Trip resolution
  // -------------------------------------------------------------------------

  it('returns 404 when the trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Trip not found');
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  it('returns 401 when the user is neither the owner nor a member', async () => {
    const otherOwnerId = 'other-owner-id';
    const tripOwnedByOther = {
      ...MOCK_TRIP,
      ownerId: otherOwnerId,
      // members list does NOT contain MOCK_USER_ID
      members: [{ ...MOCK_MEMBER, id: 'other-member-id', userId: otherOwnerId }],
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripOwnedByOther);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  it('allows access when the user is the trip owner (even with no members)', async () => {
    const ownerTrip = { ...MOCK_TRIP, members: [] };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(ownerTrip);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([MOCK_FLIGHT_OFFER]);

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(200);
  });

  it('allows access when the user is a trip member (not owner)', async () => {
    const nonOwnerSession = {
      user: { id: 'member-user-id', name: 'Member', email: 'member@x.com' },
      expires: '2099-01-01',
    };
    const memberTrip = {
      ...MOCK_TRIP,
      ownerId: 'actual-owner-id',
      members: [{ ...MOCK_MEMBER, id: 'member-user-id', userId: 'member-user-id' }],
    };
    mockGetServerSession.mockResolvedValueOnce(nonOwnerSession as never);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(memberTrip);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'Chicago' });
    mockGetAirportCode.mockResolvedValueOnce('ORD');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([MOCK_FLIGHT_OFFER]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/flights`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });

    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Airport code resolution
  // -------------------------------------------------------------------------

  it('returns 400 when origin airport code cannot be resolved', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'Unknown City' });
    mockGetAirportCode.mockResolvedValueOnce(null); // origin fails
    mockGetAirportCode.mockResolvedValueOnce('CDG'); // destination succeeds

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Could not find airport codes for the cities');
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  it('returns 400 when destination airport code cannot be resolved', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK'); // origin succeeds
    mockGetAirportCode.mockResolvedValueOnce(null); // destination fails

    const res = await callGet(MOCK_TRIP_ID);

    expect(res.status).toBe(400);
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  it('calls getAirportCode for origin and destination cities', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([MOCK_FLIGHT_OFFER]);

    await callGet(MOCK_TRIP_ID);

    expect(mockGetAirportCode).toHaveBeenCalledTimes(2);
    expect(mockGetAirportCode).toHaveBeenCalledWith('New York');
    expect(mockGetAirportCode).toHaveBeenCalledWith('Paris');
  });

  // -------------------------------------------------------------------------
  // User city / origin defaults
  // -------------------------------------------------------------------------

  it('defaults origin city to "New York" when user has no city set', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: null });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([MOCK_FLIGHT_OFFER]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.origin.city).toBe('New York');
    expect(mockGetAirportCode).toHaveBeenCalledWith('New York');
  });

  it('defaults origin city to "New York" when user record does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([MOCK_FLIGHT_OFFER]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.origin.city).toBe('New York');
  });

  it('uses the user city when it is set in their profile', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'Los Angeles' });
    mockGetAirportCode.mockResolvedValueOnce('LAX');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.origin.city).toBe('Los Angeles');
    expect(body.origin.code).toBe('LAX');
  });

  // -------------------------------------------------------------------------
  // Destination city handling
  // -------------------------------------------------------------------------

  it('uses "Unknown" as destination city when trip destination has no city', async () => {
    const tripNoCity = {
      ...MOCK_TRIP,
      destination: { country: 'France' }, // no city
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripNoCity);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce(null); // 'Unknown' won't resolve

    const res = await callGet(MOCK_TRIP_ID);

    // getAirportCode called with 'Unknown'
    expect(mockGetAirportCode).toHaveBeenCalledWith('Unknown');
    expect(res.status).toBe(400);
  });

  it('handles null trip destination gracefully', async () => {
    const tripNullDest = { ...MOCK_TRIP, destination: null };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripNullDest);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce(null); // 'Unknown' won't resolve

    const res = await callGet(MOCK_TRIP_ID);

    expect(mockGetAirportCode).toHaveBeenCalledWith('Unknown');
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Successful response structure
  // -------------------------------------------------------------------------

  it('returns flights with correct response structure', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([MOCK_FLIGHT_OFFER]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    // Top-level shape
    expect(body).toHaveProperty('flights');
    expect(body).toHaveProperty('origin');
    expect(body).toHaveProperty('destination');
    // origin shape
    expect(body.origin).toEqual({ city: 'New York', code: 'JFK' });
    // destination shape
    expect(body.destination).toEqual({ city: 'Paris', code: 'CDG' });
    // flights array
    expect(Array.isArray(body.flights)).toBe(true);
    expect(body.flights).toHaveLength(1);
    expect(body.flights[0].id).toBe('flight-offer-1');
  });

  it('returns an empty flights array when the API finds no results', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.flights).toEqual([]);
    expect(body.origin).toBeDefined();
    expect(body.destination).toBeDefined();
  });

  it('returns multiple flight offers when API returns multiple results', async () => {
    const secondOffer = { ...MOCK_FLIGHT_OFFER, id: 'flight-offer-2' };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([MOCK_FLIGHT_OFFER, secondOffer]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.flights).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // searchFlights call arguments
  // -------------------------------------------------------------------------

  it('passes correct arguments to searchFlights', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    expect(mockSearchFlights).toHaveBeenCalledWith({
      originLocationCode: 'JFK',
      destinationLocationCode: 'CDG',
      departureDate: '2026-06-01',
      returnDate: '2026-06-10',
      adults: 1, // MOCK_TRIP.members.length = 1
      nonStop: true,
      max: 5,
    });
  });

  it('passes the trip member count as the adults parameter', async () => {
    const tripWithThreeMembers = {
      ...MOCK_TRIP,
      members: [
        { ...MOCK_MEMBER, id: 'mem-1' },
        { ...MOCK_MEMBER, id: 'mem-2' },
        { ...MOCK_MEMBER, id: 'mem-3' },
      ],
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripWithThreeMembers);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    const callArgs = mockSearchFlights.mock.calls[0][0];
    expect(callArgs.adults).toBe(3);
  });

  it('uses adults=1 when trip has no members', async () => {
    const tripNoMembers = { ...MOCK_TRIP, members: [] };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripNoMembers);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    const callArgs = mockSearchFlights.mock.calls[0][0];
    // members.length is 0, and `0 || 1` = 1
    expect(callArgs.adults).toBe(1);
  });

  it('formats trip startDate and endDate as YYYY-MM-DD strings for the flight search', async () => {
    const tripWithDates = {
      ...MOCK_TRIP,
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: new Date('2026-08-25T00:00:00.000Z'),
    };
    mockPrismaTrip.findUnique.mockResolvedValueOnce(tripWithDates);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    const callArgs = mockSearchFlights.mock.calls[0][0];
    expect(callArgs.departureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.returnDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('returns 500 when prisma.trip.findUnique throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockPrismaTrip.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/flights`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal error');
  });

  it('returns 500 when prisma.user.findUnique throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('Timeout'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/flights`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal error');
  });

  it('returns 500 when getAirportCode throws unexpectedly', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockRejectedValueOnce(new Error('Amadeus API unreachable'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/flights`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal error');
  });

  it('returns 200 with empty flights when searchFlights throws (library swallows error)', async () => {
    // The real searchFlights catches all errors and returns [] — so even if
    // the mock rejects, the route's catch block should handle it gracefully.
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    // Simulate the library returning [] after an internal error (as it does)
    mockSearchFlights.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.flights).toEqual([]);
  });

  it('returns 500 when searchFlights itself throws (not caught by library)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP);
    mockPrismaUser.findUnique.mockResolvedValueOnce({ city: 'New York' });
    mockGetAirportCode.mockResolvedValueOnce('JFK');
    mockGetAirportCode.mockResolvedValueOnce('CDG');
    mockSearchFlights.mockRejectedValueOnce(new Error('Unexpected flight API crash'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/flights`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal error');
  });
});
