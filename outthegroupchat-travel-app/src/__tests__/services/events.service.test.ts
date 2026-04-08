/**
 * Comprehensive unit tests for EventsService
 *
 * Strategy
 * --------
 * - All external API modules (@/lib/api/ticketmaster, @/lib/api/places,
 *   @/lib/api/flights) are mocked with vi.mock() factories so no real HTTP
 *   requests are made.
 * - vi.clearAllMocks() in beforeEach clears call counts/history while
 *   preserving factory-established default implementations.
 * - Each test uses mockResolvedValueOnce() for isolated, non-leaking setups.
 *
 * Coverage goals
 * --------------
 * searchEvents:
 *   - Returns mapped EventSearchResult[] on happy path
 *   - Sets venue to 'Venue TBD' when _embedded is absent
 *   - Includes priceRange when priceRanges present
 *   - priceRange is undefined when priceRanges absent
 *   - Returns empty array when ticketmaster throws
 *   - Filters by 'sports' category keyword (game/match/vs)
 *   - Filters by 'music' category keyword (concert/tour/live)
 *   - Filters by 'comedy' category keyword
 *   - Filters by 'theater' category keyword
 *   - Unknown category passes all events through
 *   - No category filter returns all events
 *
 * searchPlaces:
 *   - Returns places for 'restaurant' type
 *   - Returns places for 'bar' type
 *   - Returns places for 'attraction' type
 *   - Returns places for 'hotel' type
 *   - 'all' type fires three queries and deduplicates results
 *   - Defaults to type='all' and limit=20
 *   - Respects limit parameter (slices to limit)
 *   - Skips failed queries non-fatally
 *   - Deduplicates by place_id
 *   - City with known coordinates passes location to searchPlaces lib
 *
 * getPlaceDetails:
 *   - Delegates to lib getPlaceDetails and returns result
 *   - Returns null when lib returns null
 *
 * searchFlights:
 *   - Returns mapped FlightOffer[] on happy path
 *   - Returns empty array when originCode is null
 *   - Returns empty array when destCode is null
 *   - Returns empty array when searchFlights lib throws
 *   - Formats departureDate correctly (YYYY-MM-DD)
 *   - Passes returnDate when provided
 *   - returnDate is undefined when not provided
 *
 * getPriceEstimate:
 *   - Returns correct label for each price level 0-4
 *   - Returns 'Price not available' for undefined
 *
 * getDestinationInfo:
 *   - Returns events, restaurants, attractions, nightlife, and coordinates
 *   - coordinates is null for unknown city
 *   - Events are sliced to 20
 *   - Restaurants include priceEstimate field
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external API modules before importing the service under test
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/ticketmaster', () => ({
  searchEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/api/places', () => ({
  searchPlaces: vi.fn().mockResolvedValue([]),
  getPlaceDetails: vi.fn().mockResolvedValue(null),
  getPriceEstimate: vi.fn((level: number | undefined) => {
    switch (level) {
      case 0: return 'Free';
      case 1: return 'Inexpensive';
      case 2: return 'Moderate';
      case 3: return 'Expensive';
      case 4: return 'Very Expensive';
      default: return 'Price not available';
    }
  }),
}));

vi.mock('@/lib/api/flights', () => ({
  searchFlights: vi.fn().mockResolvedValue([]),
  getAirportCode: vi.fn().mockResolvedValue(null),
}));

// Also mock logger to avoid noise
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { EventsService } from '@/services/events.service';
import { searchEvents as searchTicketmaster } from '@/lib/api/ticketmaster';
import { searchPlaces, getPlaceDetails, getPriceEstimate } from '@/lib/api/places';
import { searchFlights, getAirportCode } from '@/lib/api/flights';
import type { PlaceDetails } from '@/lib/api/places';
import type { FlightOffer } from '@/lib/api/flights';

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------
const mockSearchTicketmaster = vi.mocked(searchTicketmaster);
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockGetPlaceDetails = vi.mocked(getPlaceDetails);
const mockSearchFlights = vi.mocked(searchFlights);
const mockGetAirportCode = vi.mocked(getAirportCode);

// ---------------------------------------------------------------------------
// Shared fixture factories
// ---------------------------------------------------------------------------
function makeTicketmasterEvent(overrides: Partial<{
  id: string;
  name: string;
  url: string;
  venueName: string;
  localDate: string;
  priceMin: number;
  priceMax: number;
}> = {}) {
  const {
    id = 'evt-1',
    name = 'Test Event',
    url = 'https://ticketmaster.com/event/1',
    venueName = 'Test Arena',
    localDate = '2026-06-15',
    priceMin,
    priceMax,
  } = overrides;

  return {
    id,
    name,
    url,
    dates: { start: { localDate, localTime: '20:00:00' } },
    ...(priceMin !== undefined && priceMax !== undefined
      ? { priceRanges: [{ min: priceMin, max: priceMax, currency: 'USD' }] }
      : {}),
    _embedded: { venues: [{ name: venueName, city: { name: 'Nashville' }, state: { name: 'TN' }, country: { name: 'US' } }] },
  };
}

function makePlaceDetails(overrides: Partial<PlaceDetails> = {}): PlaceDetails {
  return {
    place_id: 'place-1',
    name: 'Test Place',
    formatted_address: '123 Main St',
    geometry: { location: { lat: 36.16, lng: -86.78 } },
    types: ['restaurant'],
    price_level: 2,
    rating: 4.5,
    ...overrides,
  };
}

function makeFlightOffer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    id: 'flight-1',
    source: { iataCode: 'BNA', cityName: 'Nashville' },
    destination: { iataCode: 'JFK', cityName: 'New York' },
    itineraries: [
      {
        duration: 'PT2H30M',
        segments: [
          {
            departure: { iataCode: 'BNA', at: '2026-06-15T08:00:00' },
            arrival: { iataCode: 'JFK', at: '2026-06-15T10:30:00' },
            carrierCode: 'DL',
            number: '123',
            aircraft: { code: '737' },
            duration: 'PT2H30M',
            id: 'seg-1',
          },
        ],
      },
    ],
    price: { currency: 'USD', total: '350.00', base: '300.00' },
    numberOfBookableSeats: 5,
    ...overrides,
  };
}

const START_DATE = new Date('2026-06-15T00:00:00.000Z');
const END_DATE = new Date('2026-06-18T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('EventsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // searchEvents
  // =========================================================================
  describe('searchEvents', () => {
    it('returns mapped EventSearchResult[] on happy path', async () => {
      const tmEvent = makeTicketmasterEvent({ priceMin: 50, priceMax: 150 });
      mockSearchTicketmaster.mockResolvedValueOnce([tmEvent]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'evt-1',
        name: 'Test Event',
        type: 'ticketmaster',
        date: '2026-06-15',
        venue: 'Test Arena',
        url: 'https://ticketmaster.com/event/1',
        priceRange: { min: 50, max: 150 },
      });
    });

    it("sets venue to 'Venue TBD' when _embedded is absent", async () => {
      const tmEvent = { ...makeTicketmasterEvent(), _embedded: undefined };
      mockSearchTicketmaster.mockResolvedValueOnce([tmEvent]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
      });

      expect(results[0].venue).toBe('Venue TBD');
    });

    it('sets priceRange to undefined when priceRanges absent', async () => {
      const tmEvent = makeTicketmasterEvent(); // no priceMin/priceMax
      mockSearchTicketmaster.mockResolvedValueOnce([tmEvent]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
      });

      expect(results[0].priceRange).toBeUndefined();
    });

    it('returns empty array when ticketmaster throws', async () => {
      mockSearchTicketmaster.mockRejectedValueOnce(new Error('API down'));

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
      });

      expect(results).toEqual([]);
    });

    it("filters by 'sports' category matching 'game'", async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Playoff Game 7' }),
        makeTicketmasterEvent({ id: '2', name: 'Rock Concert' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: ['sports'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it("filters by 'sports' category matching 'match'", async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Championship Match' }),
        makeTicketmasterEvent({ id: '2', name: 'Comedy Show' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: ['sports'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it("filters by 'music' category matching 'concert'", async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Summer Concert Series' }),
        makeTicketmasterEvent({ id: '2', name: 'Broadway Play' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: ['music'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it("filters by 'music' category matching 'live'", async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Live at the Ryman' }),
        makeTicketmasterEvent({ id: '2', name: 'Comedy Night' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: ['music'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it("filters by 'comedy' category", async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Stand-up Comedy Showcase' }),
        makeTicketmasterEvent({ id: '2', name: 'Game Night Playoff' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: ['comedy'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it("filters by 'theater' category matching 'musical'", async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Hamilton The Musical' }),
        makeTicketmasterEvent({ id: '2', name: 'Sports Game' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: ['theater'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('unknown category passes all events through', async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Event One' }),
        makeTicketmasterEvent({ id: '2', name: 'Event Two' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: ['unknown-category'],
      });

      expect(results).toHaveLength(2);
    });

    it('returns all events when no category filter provided', async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Concert' }),
        makeTicketmasterEvent({ id: '2', name: 'Game' }),
        makeTicketmasterEvent({ id: '3', name: 'Show' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
      });

      expect(results).toHaveLength(3);
    });

    it('returns all events when categories is empty array', async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: '1', name: 'Event A' }),
        makeTicketmasterEvent({ id: '2', name: 'Event B' }),
      ]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
        categories: [],
      });

      expect(results).toHaveLength(2);
    });

    it('passes correct ISO date strings to ticketmaster (without trailing Z)', async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([]);

      await EventsService.searchEvents({
        city: 'Nashville',
        startDate: START_DATE,
        endDate: END_DATE,
      });

      expect(mockSearchTicketmaster).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Nashville',
          startDateTime: expect.not.stringContaining('Z'),
          endDateTime: expect.not.stringContaining('Z'),
          size: 50,
        })
      );
    });
  });

  // =========================================================================
  // searchPlaces
  // =========================================================================
  describe('searchPlaces', () => {
    it("fires one query for 'restaurant' type and returns results", async () => {
      const place = makePlaceDetails({ place_id: 'p1' });
      mockSearchPlaces.mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({
        city: 'Nashville',
        type: 'restaurant',
      });

      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      expect(mockSearchPlaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'restaurants in Nashville' })
      );
      expect(results).toHaveLength(1);
      expect(results[0].place_id).toBe('p1');
    });

    it("fires one query for 'bar' type", async () => {
      const place = makePlaceDetails({ place_id: 'b1' });
      mockSearchPlaces.mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'bar' });

      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      expect(mockSearchPlaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'bars and nightlife in Nashville' })
      );
      expect(results[0].place_id).toBe('b1');
    });

    it("fires one query for 'attraction' type", async () => {
      const place = makePlaceDetails({ place_id: 'a1' });
      mockSearchPlaces.mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'attraction' });

      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      expect(mockSearchPlaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'tourist attractions in Nashville' })
      );
      expect(results[0].place_id).toBe('a1');
    });

    it("fires one query for 'hotel' type", async () => {
      const place = makePlaceDetails({ place_id: 'h1' });
      mockSearchPlaces.mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'hotel' });

      expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
      expect(mockSearchPlaces).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'hotels in Nashville' })
      );
      expect(results[0].place_id).toBe('h1');
    });

    it("'all' type fires three queries", async () => {
      mockSearchPlaces
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 'r1' })])
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 't1' })])
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 'n1' })]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all', limit: 20 });

      expect(mockSearchPlaces).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
    });

    it('deduplicates results by place_id across queries', async () => {
      const dup = makePlaceDetails({ place_id: 'dup-1' });
      mockSearchPlaces
        .mockResolvedValueOnce([dup])
        .mockResolvedValueOnce([dup]) // same place returned in second query
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 'unique-1' })]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all', limit: 20 });

      const ids = results.map(r => r.place_id);
      expect(ids.filter(id => id === 'dup-1')).toHaveLength(1);
    });

    it('respects the limit parameter', async () => {
      // type=restaurant → 1 query; return 10 places, limit=5
      const places = Array.from({ length: 10 }, (_, i) =>
        makePlaceDetails({ place_id: `p${i}` })
      );
      mockSearchPlaces.mockResolvedValueOnce(places);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'restaurant', limit: 5 });

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('skips failed queries non-fatally and returns results from others', async () => {
      mockSearchPlaces
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 't1' })])
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 'n1' })]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all', limit: 20 });

      // Should still have results from the successful queries
      expect(results.length).toBeGreaterThan(0);
    });

    it('defaults to type=all and limit=20', async () => {
      mockSearchPlaces
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await EventsService.searchPlaces({ city: 'Nashville' });

      // 'all' fires 3 queries
      expect(mockSearchPlaces).toHaveBeenCalledTimes(3);
    });

    it('passes coordinates for known cities', async () => {
      mockSearchPlaces.mockResolvedValueOnce([]);

      await EventsService.searchPlaces({ city: 'Nashville', type: 'restaurant' });

      expect(mockSearchPlaces).toHaveBeenCalledWith(
        expect.objectContaining({
          location: { lat: 36.1627, lng: -86.7816 },
          radius: 10000,
        })
      );
    });

    it('passes undefined location for unknown cities', async () => {
      mockSearchPlaces.mockResolvedValueOnce([]);

      await EventsService.searchPlaces({ city: 'Atlantis', type: 'restaurant' });

      expect(mockSearchPlaces).toHaveBeenCalledWith(
        expect.objectContaining({
          location: undefined,
        })
      );
    });
  });

  // =========================================================================
  // getPlaceDetails
  // =========================================================================
  describe('getPlaceDetails', () => {
    it('delegates to lib getPlaceDetails and returns result', async () => {
      const placeDetails = makePlaceDetails({ place_id: 'detail-1', name: 'Fancy Restaurant' });
      mockGetPlaceDetails.mockResolvedValueOnce(placeDetails);

      const result = await EventsService.getPlaceDetails('detail-1');

      expect(mockGetPlaceDetails).toHaveBeenCalledWith('detail-1');
      expect(result).toEqual(placeDetails);
    });

    it('returns null when lib returns null', async () => {
      mockGetPlaceDetails.mockResolvedValueOnce(null);

      const result = await EventsService.getPlaceDetails('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // searchFlights
  // =========================================================================
  describe('searchFlights', () => {
    it('returns mapped FlightOffer[] on happy path', async () => {
      mockGetAirportCode
        .mockResolvedValueOnce('BNA') // origin
        .mockResolvedValueOnce('JFK'); // destination
      const flightOffer = makeFlightOffer();
      mockSearchFlights.mockResolvedValueOnce([flightOffer]);

      const results = await EventsService.searchFlights({
        origin: 'Nashville',
        destination: 'New York',
        departureDate: START_DATE,
        adults: 2,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'flight-1',
        price: { total: '350.00', currency: 'USD' },
      });
    });

    it('returns empty array when originCode is null', async () => {
      mockGetAirportCode
        .mockResolvedValueOnce(null)  // origin
        .mockResolvedValueOnce('JFK'); // destination

      const results = await EventsService.searchFlights({
        origin: 'Unknown City',
        destination: 'New York',
        departureDate: START_DATE,
        adults: 1,
      });

      expect(results).toEqual([]);
      expect(mockSearchFlights).not.toHaveBeenCalled();
    });

    it('returns empty array when destCode is null', async () => {
      mockGetAirportCode
        .mockResolvedValueOnce('BNA')  // origin
        .mockResolvedValueOnce(null);  // destination

      const results = await EventsService.searchFlights({
        origin: 'Nashville',
        destination: 'Unknown City',
        departureDate: START_DATE,
        adults: 1,
      });

      expect(results).toEqual([]);
      expect(mockSearchFlights).not.toHaveBeenCalled();
    });

    it('returns empty array when searchFlights lib throws', async () => {
      mockGetAirportCode
        .mockResolvedValueOnce('BNA')
        .mockResolvedValueOnce('JFK');
      mockSearchFlights.mockRejectedValueOnce(new Error('Amadeus down'));

      const results = await EventsService.searchFlights({
        origin: 'Nashville',
        destination: 'New York',
        departureDate: START_DATE,
        adults: 1,
      });

      expect(results).toEqual([]);
    });

    it('formats departureDate correctly as YYYY-MM-DD', async () => {
      mockGetAirportCode
        .mockResolvedValueOnce('BNA')
        .mockResolvedValueOnce('JFK');
      mockSearchFlights.mockResolvedValueOnce([]);

      await EventsService.searchFlights({
        origin: 'Nashville',
        destination: 'New York',
        departureDate: new Date('2026-06-15T12:00:00.000Z'),
        adults: 1,
      });

      expect(mockSearchFlights).toHaveBeenCalledWith(
        expect.objectContaining({
          departureDate: '2026-06-15',
        })
      );
    });

    it('passes returnDate when provided', async () => {
      mockGetAirportCode
        .mockResolvedValueOnce('BNA')
        .mockResolvedValueOnce('JFK');
      mockSearchFlights.mockResolvedValueOnce([]);

      await EventsService.searchFlights({
        origin: 'Nashville',
        destination: 'New York',
        departureDate: new Date('2026-06-15T00:00:00.000Z'),
        returnDate: new Date('2026-06-18T00:00:00.000Z'),
        adults: 2,
      });

      expect(mockSearchFlights).toHaveBeenCalledWith(
        expect.objectContaining({
          returnDate: '2026-06-18',
          adults: 2,
          max: 10,
        })
      );
    });

    it('returnDate is undefined when not provided', async () => {
      mockGetAirportCode
        .mockResolvedValueOnce('BNA')
        .mockResolvedValueOnce('JFK');
      mockSearchFlights.mockResolvedValueOnce([]);

      await EventsService.searchFlights({
        origin: 'Nashville',
        destination: 'New York',
        departureDate: START_DATE,
        adults: 1,
      });

      expect(mockSearchFlights).toHaveBeenCalledWith(
        expect.objectContaining({
          returnDate: undefined,
        })
      );
    });
  });

  // =========================================================================
  // getPriceEstimate
  // =========================================================================
  describe('getPriceEstimate', () => {
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

  // =========================================================================
  // getDestinationInfo
  // =========================================================================
  describe('getDestinationInfo', () => {
    it('returns events, restaurants, attractions, nightlife, and coordinates', async () => {
      // searchEvents → ticketmaster call
      mockSearchTicketmaster.mockResolvedValueOnce([
        makeTicketmasterEvent({ id: 'e1' }),
      ]);
      // restaurants, attractions, bars (3 separate searchPlaces calls)
      mockSearchPlaces
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 'r1', name: 'Ramen House' })])
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 'a1', name: 'Museum' })])
        .mockResolvedValueOnce([makePlaceDetails({ place_id: 'b1', name: 'Rooftop Bar' })]);

      const info = await EventsService.getDestinationInfo('Nashville', START_DATE, END_DATE);

      expect(info.events).toHaveLength(1);
      expect(info.restaurants).toHaveLength(1);
      expect(info.restaurants[0]).toHaveProperty('priceEstimate');
      expect(info.attractions).toHaveLength(1);
      expect(info.nightlife).toHaveLength(1);
      expect(info.coordinates).toEqual({ lat: 36.1627, lng: -86.7816 });
    });

    it('coordinates is null for unknown city', async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([]);
      mockSearchPlaces
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const info = await EventsService.getDestinationInfo('Atlantis', START_DATE, END_DATE);

      expect(info.coordinates).toBeNull();
    });

    it('slices events to at most 20', async () => {
      // Return 25 events from ticketmaster
      const manyEvents = Array.from({ length: 25 }, (_, i) =>
        makeTicketmasterEvent({ id: `evt-${i}`, name: `Event ${i}` })
      );
      mockSearchTicketmaster.mockResolvedValueOnce(manyEvents);
      mockSearchPlaces
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const info = await EventsService.getDestinationInfo('Nashville', START_DATE, END_DATE);

      expect(info.events).toHaveLength(20);
    });

    it('adds priceEstimate to each restaurant', async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([]);
      mockSearchPlaces
        .mockResolvedValueOnce([
          makePlaceDetails({ place_id: 'r1', price_level: 2 }),
          makePlaceDetails({ place_id: 'r2', price_level: 0 }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const info = await EventsService.getDestinationInfo('Nashville', START_DATE, END_DATE);

      expect(info.restaurants[0].priceEstimate).toBe('Moderate');
      expect(info.restaurants[1].priceEstimate).toBe('Free');
    });

    it('handles all empty results gracefully', async () => {
      mockSearchTicketmaster.mockResolvedValueOnce([]);
      mockSearchPlaces
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const info = await EventsService.getDestinationInfo('Nashville', START_DATE, END_DATE);

      expect(info.events).toEqual([]);
      expect(info.restaurants).toEqual([]);
      expect(info.attractions).toEqual([]);
      expect(info.nightlife).toEqual([]);
    });
  });
});
