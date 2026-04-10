/**
 * Unit tests for EventsService
 *
 * Strategy
 * --------
 * - All external API calls (Ticketmaster, Google Places, Amadeus flights) are mocked
 *   at the module level so no real HTTP requests are made.
 * - EventsService is a static-method-only class; no instance setup required.
 * - vi.clearAllMocks() in beforeEach resets call history without breaking factory defaults.
 *
 * Coverage goals
 * --------------
 * searchEvents:
 *   - Returns mapped EventSearchResult[] from Ticketmaster data
 *   - Maps venue name from _embedded.venues[0].name; falls back to "Venue TBD" when absent
 *   - Maps priceRange when priceRanges[0] is present; omits when absent
 *   - Returns empty array when Ticketmaster throws (non-fatal error path)
 *   - Filters by category "sports" (game/match/vs keywords)
 *   - Filters by category "music" (concert/tour/live keywords)
 *   - Filters by category "comedy" (comedy/stand-up keywords)
 *   - Filters by category "theater" (theater/musical/play keywords)
 *   - Unknown category defaults to including all events
 *   - Returns all events when categories array is empty
 *
 * searchPlaces:
 *   - Calls searchPlaces lib with correct query for type="restaurant"
 *   - Calls searchPlaces lib with correct query for type="bar"
 *   - Calls searchPlaces lib with correct query for type="attraction"
 *   - Calls searchPlaces lib with correct query for type="hotel"
 *   - Calls 3 queries for type="all" (default)
 *   - Uses known city coordinates when city is in CITY_COORDINATES
 *   - Deduplicates places by place_id
 *   - Returns empty array when all place searches throw
 *   - Skips a failing query but includes results from others
 *
 * getPlaceDetails:
 *   - Delegates to getPlaceDetails lib and returns its result
 *   - Returns null when lib returns null
 *
 * searchFlights:
 *   - Returns mapped FlightOffer[] on success
 *   - Returns empty array when getAirportCode returns null for origin
 *   - Returns empty array when getAirportCode returns null for destination
 *   - Returns empty array when searchFlights lib throws
 *   - Uses YYYY-MM-DD format for departureDate
 *   - Passes returnDate correctly when provided
 *
 * getPriceEstimate (static, pure):
 *   - Returns correct strings for levels 0–4 and undefined
 *
 * getDestinationInfo:
 *   - Returns the correct shape with events, restaurants, attractions, nightlife, coordinates
 *   - Caps events to 20
 *   - Returns null coordinates for unknown city
 *   - Adds priceEstimate to each restaurant
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlaceDetails } from '@/lib/api/places';
import type { FlightOffer } from '@/lib/api/flights';

// ---------------------------------------------------------------------------
// Module-level mocks (must be at top level, before any imports that use them)
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/ticketmaster', () => ({
  searchEvents: vi.fn(),
}));

vi.mock('@/lib/api/places', () => ({
  searchPlaces: vi.fn(),
  getPlaceDetails: vi.fn(),
  getPriceEstimate: vi.fn(),
}));

vi.mock('@/lib/api/flights', () => ({
  searchFlights: vi.fn(),
  getAirportCode: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static imports (after vi.mock hoisting)
// ---------------------------------------------------------------------------

import { EventsService } from '@/services/events.service';
import * as ticketmasterLib from '@/lib/api/ticketmaster';
import * as placesLib from '@/lib/api/places';
import * as flightsLib from '@/lib/api/flights';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockSearchTicketmaster = vi.mocked(ticketmasterLib.searchEvents);
const mockSearchPlaces = vi.mocked(placesLib.searchPlaces);
const mockGetPlaceDetails = vi.mocked(placesLib.getPlaceDetails);
const mockGetPriceEstimate = vi.mocked(placesLib.getPriceEstimate);
const mockSearchFlights = vi.mocked(flightsLib.searchFlights);
const mockGetAirportCode = vi.mocked(flightsLib.getAirportCode);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTicketmasterEvent(overrides: Partial<{
  id: string;
  name: string;
  url: string;
  localDate: string;
  venueName: string | undefined;
  priceMin: number;
  priceMax: number;
  hasPriceRanges: boolean;
  hasVenue: boolean;
}> = {}) {
  const {
    id = 'tm-1',
    name = 'Test Concert',
    url = 'https://ticketmaster.com/event/1',
    localDate = '2026-07-10',
    venueName = 'Grand Theater',
    hasPriceRanges = true,
    hasVenue = true,
    priceMin = 25,
    priceMax = 150,
  } = overrides;

  return {
    id,
    name,
    url,
    dates: { start: { localDate, localTime: '19:00:00' } },
    priceRanges: hasPriceRanges ? [{ min: priceMin, max: priceMax, currency: 'USD' }] : undefined,
    _embedded: hasVenue ? { venues: [{ name: venueName!, city: { name: 'Nashville' }, state: { name: 'TN' }, country: { name: 'USA' } }] } : undefined,
  };
}

function makePlaceDetails(overrides: Partial<PlaceDetails> = {}): PlaceDetails {
  return {
    place_id: 'place-1',
    name: 'Test Restaurant',
    formatted_address: '123 Main St',
    geometry: { location: { lat: 36.16, lng: -86.78 } },
    price_level: 2,
    rating: 4.3,
    types: ['restaurant', 'food'],
    photos: [],
    ...overrides,
  };
}

function makeFlightOfferRaw() {
  return {
    id: 'flight-1',
    source: { iataCode: 'BNA', cityName: 'Nashville' },
    destination: { iataCode: 'JFK', cityName: 'New York' },
    itineraries: [
      {
        duration: 'PT2H30M',
        segments: [
          {
            departure: { iataCode: 'BNA', at: '2026-07-10T08:00:00' },
            arrival: { iataCode: 'JFK', at: '2026-07-10T10:30:00' },
            carrierCode: 'DL',
            number: '123',
            aircraft: { code: '737' },
            duration: 'PT2H30M',
            id: 'seg-1',
          },
        ],
      },
    ],
    price: { total: '350.00', currency: 'USD' },
    numberOfBookableSeats: 8,
  };
}

// ---------------------------------------------------------------------------
// Tests: searchEvents
// ---------------------------------------------------------------------------

describe('EventsService.searchEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped EventSearchResult[] from Ticketmaster data', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ id: 'tm-1', name: 'Jazz Night', localDate: '2026-07-10', venueName: 'Blue Note' }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'tm-1',
      name: 'Jazz Night',
      type: 'ticketmaster',
      date: '2026-07-10',
      venue: 'Blue Note',
      url: 'https://ticketmaster.com/event/1',
    });
    expect(results[0].priceRange).toEqual({ min: 25, max: 150 });
  });

  it('falls back to "Venue TBD" when _embedded is absent', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ hasVenue: false }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
    });

    expect(results[0].venue).toBe('Venue TBD');
  });

  it('omits priceRange when priceRanges is absent', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ hasPriceRanges: false }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
    });

    expect(results[0].priceRange).toBeUndefined();
  });

  it('returns empty array when Ticketmaster throws (non-fatal)', async () => {
    mockSearchTicketmaster.mockRejectedValueOnce(new Error('API down'));

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
    });

    expect(results).toEqual([]);
  });

  it('returns all events when categories is empty', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ name: 'Anything Goes' }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: [],
    });

    expect(results).toHaveLength(1);
  });

  it('filters by category "sports" (name contains "game")', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ id: 'e1', name: 'Championship Game' }),
      makeTicketmasterEvent({ id: 'e2', name: 'Jazz Concert' }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: ['sports'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('e1');
  });

  it('filters by category "music" (name contains "concert")', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ id: 'e1', name: 'Rock Concert Live' }),
      makeTicketmasterEvent({ id: 'e2', name: 'Art Exhibition' }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: ['music'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('e1');
  });

  it('filters by category "comedy" (name contains "comedy")', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ id: 'e1', name: 'Stand-Up Comedy Night' }),
      makeTicketmasterEvent({ id: 'e2', name: 'Football Match' }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: ['comedy'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('e1');
  });

  it('filters by category "theater" (name contains "musical")', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ id: 'e1', name: 'Hamilton Musical' }),
      makeTicketmasterEvent({ id: 'e2', name: 'Baseball Game' }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: ['theater'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('e1');
  });

  it('unknown category passes all events through', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ id: 'e1', name: 'Some Random Event' }),
    ]);

    const results = await EventsService.searchEvents({
      city: 'Nashville',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: ['unknown_category'],
    });

    expect(results).toHaveLength(1);
  });

  it('passes correct date format (without trailing Z) to Ticketmaster', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([]);

    await EventsService.searchEvents({
      city: 'NYC',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.000Z'),
    });

    expect(mockSearchTicketmaster).toHaveBeenCalledOnce();
    const call = mockSearchTicketmaster.mock.calls[0][0];
    expect(call.startDateTime).not.toContain('Z');
    expect(call.endDateTime).not.toContain('Z');
    expect(call.city).toBe('NYC');
  });
});

// ---------------------------------------------------------------------------
// Tests: searchPlaces
// ---------------------------------------------------------------------------

describe('EventsService.searchPlaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls lib with correct query for type="restaurant"', async () => {
    mockSearchPlaces.mockResolvedValueOnce([makePlaceDetails()]);

    await EventsService.searchPlaces({ city: 'Nashville', type: 'restaurant' });

    expect(mockSearchPlaces).toHaveBeenCalledOnce();
    const call = mockSearchPlaces.mock.calls[0][0];
    expect(call.query).toBe('restaurants in Nashville');
  });

  it('calls lib with correct query for type="bar"', async () => {
    mockSearchPlaces.mockResolvedValueOnce([makePlaceDetails()]);

    await EventsService.searchPlaces({ city: 'Nashville', type: 'bar' });

    const call = mockSearchPlaces.mock.calls[0][0];
    expect(call.query).toBe('bars and nightlife in Nashville');
  });

  it('calls lib with correct query for type="attraction"', async () => {
    mockSearchPlaces.mockResolvedValueOnce([makePlaceDetails()]);

    await EventsService.searchPlaces({ city: 'Nashville', type: 'attraction' });

    const call = mockSearchPlaces.mock.calls[0][0];
    expect(call.query).toBe('tourist attractions in Nashville');
  });

  it('calls lib with correct query for type="hotel"', async () => {
    mockSearchPlaces.mockResolvedValueOnce([makePlaceDetails()]);

    await EventsService.searchPlaces({ city: 'Nashville', type: 'hotel' });

    const call = mockSearchPlaces.mock.calls[0][0];
    expect(call.query).toBe('hotels in Nashville');
  });

  it('calls 3 queries for type="all" (default)', async () => {
    mockSearchPlaces
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'p1' })])
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'p2' })])
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'p3' })]);

    await EventsService.searchPlaces({ city: 'Nashville', type: 'all' });

    expect(mockSearchPlaces).toHaveBeenCalledTimes(3);
    const queries = mockSearchPlaces.mock.calls.map(c => c[0].query);
    expect(queries).toContain('popular restaurants in Nashville');
    expect(queries).toContain('things to do in Nashville');
    expect(queries).toContain('nightlife in Nashville');
  });

  it('uses known city coordinates when city is in CITY_COORDINATES', async () => {
    mockSearchPlaces.mockResolvedValueOnce([]);

    await EventsService.searchPlaces({ city: 'Nashville', type: 'restaurant' });

    const call = mockSearchPlaces.mock.calls[0][0];
    expect(call.location).toEqual({ lat: 36.1627, lng: -86.7816 });
    expect(call.radius).toBe(10000);
  });

  it('passes undefined location for unknown city', async () => {
    mockSearchPlaces.mockResolvedValueOnce([]);

    await EventsService.searchPlaces({ city: 'UnknownCity', type: 'restaurant' });

    const call = mockSearchPlaces.mock.calls[0][0];
    expect(call.location).toBeUndefined();
  });

  it('deduplicates places by place_id', async () => {
    const duplicate = makePlaceDetails({ place_id: 'dup-1', name: 'Dup Place' });
    mockSearchPlaces
      .mockResolvedValueOnce([duplicate])
      .mockResolvedValueOnce([duplicate])
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'unique-1' })]);

    const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all' });

    const ids = results.map(p => p.place_id);
    const dupCount = ids.filter(id => id === 'dup-1').length;
    expect(dupCount).toBe(1);
  });

  it('returns empty array when all place searches throw', async () => {
    mockSearchPlaces
      .mockRejectedValueOnce(new Error('Places API down'))
      .mockRejectedValueOnce(new Error('Places API down'))
      .mockRejectedValueOnce(new Error('Places API down'));

    const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all' });

    expect(results).toEqual([]);
  });

  it('skips a failing query but includes results from other queries', async () => {
    mockSearchPlaces
      .mockRejectedValueOnce(new Error('First query failed'))
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'p2', name: 'Good Place' })])
      .mockResolvedValueOnce([]);

    const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all' });

    expect(results).toHaveLength(1);
    expect(results[0].place_id).toBe('p2');
  });

  it('respects the limit parameter', async () => {
    const places = Array.from({ length: 10 }, (_, i) =>
      makePlaceDetails({ place_id: `p${i}`, name: `Place ${i}` })
    );
    mockSearchPlaces.mockResolvedValueOnce(places);

    const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'restaurant', limit: 5 });

    expect(results.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Tests: getPlaceDetails
// ---------------------------------------------------------------------------

describe('EventsService.getPlaceDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to getPlaceDetails lib and returns its result', async () => {
    const place = makePlaceDetails({ place_id: 'abc-123', name: 'The Grand Hotel' });
    mockGetPlaceDetails.mockResolvedValueOnce(place);

    const result = await EventsService.getPlaceDetails('abc-123');

    expect(mockGetPlaceDetails).toHaveBeenCalledOnce();
    expect(mockGetPlaceDetails).toHaveBeenCalledWith('abc-123');
    expect(result).toBe(place);
  });

  it('returns null when lib returns null', async () => {
    mockGetPlaceDetails.mockResolvedValueOnce(null);

    const result = await EventsService.getPlaceDetails('nonexistent-id');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: searchFlights
// ---------------------------------------------------------------------------

describe('EventsService.searchFlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped FlightOffer[] on success', async () => {
    mockGetAirportCode
      .mockResolvedValueOnce('BNA')
      .mockResolvedValueOnce('JFK');
    mockSearchFlights.mockResolvedValueOnce([makeFlightOfferRaw() as unknown as FlightOffer]);

    const results = await EventsService.searchFlights({
      origin: 'Nashville',
      destination: 'New York',
      departureDate: new Date('2026-07-10'),
      adults: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'flight-1',
      price: {
        total: '350.00',
        currency: 'USD',
      },
    });
    expect(results[0].itineraries).toHaveLength(1);
  });

  it('returns empty array when origin airport code is null', async () => {
    mockGetAirportCode
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('JFK');

    const results = await EventsService.searchFlights({
      origin: 'Unknown City',
      destination: 'New York',
      departureDate: new Date('2026-07-10'),
      adults: 1,
    });

    expect(results).toEqual([]);
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  it('returns empty array when destination airport code is null', async () => {
    mockGetAirportCode
      .mockResolvedValueOnce('BNA')
      .mockResolvedValueOnce(null);

    const results = await EventsService.searchFlights({
      origin: 'Nashville',
      destination: 'Unknown City',
      departureDate: new Date('2026-07-10'),
      adults: 1,
    });

    expect(results).toEqual([]);
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  it('returns empty array when searchFlights lib throws', async () => {
    mockGetAirportCode
      .mockResolvedValueOnce('BNA')
      .mockResolvedValueOnce('JFK');
    mockSearchFlights.mockRejectedValueOnce(new Error('Amadeus API error'));

    const results = await EventsService.searchFlights({
      origin: 'Nashville',
      destination: 'New York',
      departureDate: new Date('2026-07-10'),
      adults: 1,
    });

    expect(results).toEqual([]);
  });

  it('passes departure date in YYYY-MM-DD format', async () => {
    mockGetAirportCode
      .mockResolvedValueOnce('BNA')
      .mockResolvedValueOnce('JFK');
    mockSearchFlights.mockResolvedValueOnce([]);

    await EventsService.searchFlights({
      origin: 'Nashville',
      destination: 'New York',
      departureDate: new Date('2026-07-10T00:00:00.000Z'),
      adults: 1,
    });

    const call = mockSearchFlights.mock.calls[0][0];
    expect(call.departureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('passes returnDate in YYYY-MM-DD format when provided', async () => {
    mockGetAirportCode
      .mockResolvedValueOnce('BNA')
      .mockResolvedValueOnce('JFK');
    mockSearchFlights.mockResolvedValueOnce([]);

    await EventsService.searchFlights({
      origin: 'Nashville',
      destination: 'New York',
      departureDate: new Date('2026-07-10'),
      returnDate: new Date('2026-07-17'),
      adults: 1,
    });

    const call = mockSearchFlights.mock.calls[0][0];
    expect(call.returnDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.returnDate).toBe('2026-07-17');
  });

  it('omits returnDate from lib call when not provided', async () => {
    mockGetAirportCode
      .mockResolvedValueOnce('BNA')
      .mockResolvedValueOnce('JFK');
    mockSearchFlights.mockResolvedValueOnce([]);

    await EventsService.searchFlights({
      origin: 'Nashville',
      destination: 'New York',
      departureDate: new Date('2026-07-10'),
      adults: 1,
    });

    const call = mockSearchFlights.mock.calls[0][0];
    expect(call.returnDate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: getPriceEstimate (pure function, no mocks needed)
// ---------------------------------------------------------------------------

describe('EventsService.getPriceEstimate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore real implementation for each test since this is a passthrough
    mockGetPriceEstimate.mockImplementation((priceLevel: number | undefined): string => {
      switch (priceLevel) {
        case 0: return 'Free';
        case 1: return 'Inexpensive';
        case 2: return 'Moderate';
        case 3: return 'Expensive';
        case 4: return 'Very Expensive';
        default: return 'Price not available';
      }
    });
  });

  it('returns "Free" for price level 0', () => {
    expect(EventsService.getPriceEstimate(0)).toBe('Free');
  });

  it('returns "Inexpensive" for price level 1', () => {
    expect(EventsService.getPriceEstimate(1)).toBe('Inexpensive');
  });

  it('returns "Moderate" for price level 2', () => {
    expect(EventsService.getPriceEstimate(2)).toBe('Moderate');
  });

  it('returns "Expensive" for price level 3', () => {
    expect(EventsService.getPriceEstimate(3)).toBe('Expensive');
  });

  it('returns "Very Expensive" for price level 4', () => {
    expect(EventsService.getPriceEstimate(4)).toBe('Very Expensive');
  });

  it('returns "Price not available" for undefined', () => {
    expect(EventsService.getPriceEstimate(undefined)).toBe('Price not available');
  });
});

// ---------------------------------------------------------------------------
// Tests: getDestinationInfo
// ---------------------------------------------------------------------------

describe('EventsService.getDestinationInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getPriceEstimate returns 'Moderate' passthrough
    mockGetPriceEstimate.mockReturnValue('Moderate');
  });

  it('returns correct shape with events, restaurants, attractions, nightlife, coordinates', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([
      makeTicketmasterEvent({ id: 'e1', name: 'Live Music' }),
    ]);
    // searchPlaces is called 3 times for restaurant, attraction, bar
    mockSearchPlaces
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'r1', name: 'Restaurant A' })])
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'a1', name: 'Attraction A' })])
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'b1', name: 'Bar A' })]);

    const result = await EventsService.getDestinationInfo(
      'Nashville',
      new Date('2026-07-01'),
      new Date('2026-07-31')
    );

    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('restaurants');
    expect(result).toHaveProperty('attractions');
    expect(result).toHaveProperty('nightlife');
    expect(result).toHaveProperty('coordinates');
    expect(result.events).toHaveLength(1);
    expect(result.restaurants).toHaveLength(1);
    expect(result.attractions).toHaveLength(1);
    expect(result.nightlife).toHaveLength(1);
    expect(result.coordinates).toEqual({ lat: 36.1627, lng: -86.7816 });
  });

  it('caps events to 20 even when more are returned', async () => {
    const manyEvents = Array.from({ length: 30 }, (_, i) =>
      makeTicketmasterEvent({ id: `e${i}`, name: `Event ${i}` })
    );
    mockSearchTicketmaster.mockResolvedValueOnce(manyEvents);
    mockSearchPlaces
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await EventsService.getDestinationInfo(
      'Nashville',
      new Date('2026-07-01'),
      new Date('2026-07-31')
    );

    expect(result.events.length).toBeLessThanOrEqual(20);
  });

  it('returns null coordinates for unknown city', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([]);
    mockSearchPlaces
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await EventsService.getDestinationInfo(
      'UnknownCity',
      new Date('2026-07-01'),
      new Date('2026-07-31')
    );

    expect(result.coordinates).toBeNull();
  });

  it('adds priceEstimate to each restaurant', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([]);
    mockSearchPlaces
      .mockResolvedValueOnce([makePlaceDetails({ place_id: 'r1', price_level: 2 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockGetPriceEstimate.mockReturnValue('Moderate');

    const result = await EventsService.getDestinationInfo(
      'Nashville',
      new Date('2026-07-01'),
      new Date('2026-07-31')
    );

    expect(result.restaurants[0]).toHaveProperty('priceEstimate', 'Moderate');
    expect(mockGetPriceEstimate).toHaveBeenCalled();
  });

  it('recognizes "NYC" and "New York" as known cities with coordinates', async () => {
    mockSearchTicketmaster.mockResolvedValueOnce([]);
    mockSearchPlaces
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await EventsService.getDestinationInfo(
      'NYC',
      new Date('2026-07-01'),
      new Date('2026-07-31')
    );

    expect(result.coordinates).toEqual({ lat: 40.7128, lng: -74.0060 });
  });
});
