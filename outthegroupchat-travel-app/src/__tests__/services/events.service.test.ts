import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsService } from '@/services/events.service';
import type { PlaceDetails } from '@/lib/api/places';
import type { FlightOffer } from '@/lib/api/flights';
import type { TicketmasterEvent } from '@/lib/api/ticketmaster';

// Mock all external API libs at module level
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

import { searchEvents as mockSearchTicketmaster } from '@/lib/api/ticketmaster';
import { searchPlaces as mockSearchPlaces, getPlaceDetails as mockGetPlaceDetails, getPriceEstimate as mockGetPriceEstimate } from '@/lib/api/places';
import { searchFlights as mockSearchFlights, getAirportCode as mockGetAirportCode } from '@/lib/api/flights';

// --- Fixture factories ---

function makeTicketmasterEvent(overrides: Partial<TicketmasterEvent> = {}): TicketmasterEvent {
  return {
    id: 'tm-event-1',
    name: 'Live Concert Tour',
    url: 'https://www.ticketmaster.com/event/1',
    dates: {
      start: {
        localDate: '2026-06-15',
        localTime: '20:00:00',
      },
    },
    priceRanges: [{ min: 50, max: 150, currency: 'USD' }],
    _embedded: {
      venues: [
        {
          name: 'Madison Square Garden',
          city: { name: 'New York' },
          state: { name: 'New York' },
          country: { name: 'USA' },
        },
      ],
    },
    ...overrides,
  };
}

function makePlaceDetails(overrides: Partial<PlaceDetails> = {}): PlaceDetails {
  return {
    place_id: 'place-abc-123',
    name: 'The Grand Restaurant',
    formatted_address: '123 Main St, Nashville, TN',
    geometry: {
      location: { lat: 36.1627, lng: -86.7816 },
    },
    price_level: 2,
    rating: 4.5,
    types: ['restaurant', 'food'],
    photos: [{ photo_reference: 'photo-ref-1' }],
    ...overrides,
  };
}

function makeFlightOffer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    id: 'flight-offer-1',
    source: { iataCode: 'JFK', cityName: 'New York' },
    destination: { iataCode: 'BNA', cityName: 'Nashville' },
    itineraries: [
      {
        duration: 'PT2H30M',
        segments: [
          {
            departure: { iataCode: 'JFK', at: '2026-06-15T08:00:00' },
            arrival: { iataCode: 'BNA', at: '2026-06-15T10:30:00' },
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

// ===================================================================
// TESTS
// ===================================================================

describe('EventsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // searchEvents
  // ---------------------------------------------------------------

  describe('searchEvents', () => {
    it('returns mapped EventSearchResult array from ticketmaster events', async () => {
      const event = makeTicketmasterEvent();
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([event]);

      const results = await EventsService.searchEvents({
        city: 'New York',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'tm-event-1',
        name: 'Live Concert Tour',
        type: 'ticketmaster',
        date: '2026-06-15',
        venue: 'Madison Square Garden',
        priceRange: { min: 50, max: 150 },
        url: 'https://www.ticketmaster.com/event/1',
      });
    });

    it('uses "Venue TBD" when _embedded.venues is absent', async () => {
      const event = makeTicketmasterEvent({ _embedded: undefined });
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([event]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(results[0].venue).toBe('Venue TBD');
    });

    it('returns undefined priceRange when priceRanges is absent', async () => {
      const event = makeTicketmasterEvent({ priceRanges: undefined });
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([event]);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(results[0].priceRange).toBeUndefined();
    });

    it('returns empty array when ticketmaster throws (non-fatal)', async () => {
      vi.mocked(mockSearchTicketmaster).mockRejectedValueOnce(new Error('API down'));

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(results).toEqual([]);
    });

    it('filters events by music category', async () => {
      const events = [
        makeTicketmasterEvent({ id: 'e1', name: 'Taylor Swift Concert Tour' }),
        makeTicketmasterEvent({ id: 'e2', name: 'NBA Game Knicks vs Lakers' }),
        makeTicketmasterEvent({ id: 'e3', name: 'Comedy Night Stand-up Show' }),
      ];
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce(events);

      const results = await EventsService.searchEvents({
        city: 'New York',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
        categories: ['music'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e1');
    });

    it('filters events by sports category', async () => {
      const events = [
        makeTicketmasterEvent({ id: 'e1', name: 'Lakers vs Celtics Game' }),
        makeTicketmasterEvent({ id: 'e2', name: 'Live Concert Night' }),
      ];
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce(events);

      const results = await EventsService.searchEvents({
        city: 'Los Angeles',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
        categories: ['sports'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e1');
    });

    it('filters events by comedy category', async () => {
      const events = [
        makeTicketmasterEvent({ id: 'e1', name: 'Dave Chappelle Comedy Stand-up' }),
        makeTicketmasterEvent({ id: 'e2', name: 'Rock Concert' }),
      ];
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce(events);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
        categories: ['comedy'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e1');
    });

    it('filters events by theater category', async () => {
      const events = [
        makeTicketmasterEvent({ id: 'e1', name: 'Hamilton The Musical' }),
        makeTicketmasterEvent({ id: 'e2', name: 'Baseball Game' }),
      ];
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce(events);

      const results = await EventsService.searchEvents({
        city: 'Chicago',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
        categories: ['theater'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e1');
    });

    it('returns all events when categories is an empty array', async () => {
      const events = [
        makeTicketmasterEvent({ id: 'e1', name: 'Event One' }),
        makeTicketmasterEvent({ id: 'e2', name: 'Event Two' }),
      ];
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce(events);

      const results = await EventsService.searchEvents({
        city: 'Nashville',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
        categories: [],
      });

      expect(results).toHaveLength(2);
    });

    it('returns all results when no categories filter is provided', async () => {
      const events = [
        makeTicketmasterEvent({ id: 'e1', name: 'Random Event' }),
        makeTicketmasterEvent({ id: 'e2', name: 'Another Event' }),
      ];
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce(events);

      const results = await EventsService.searchEvents({
        city: 'Austin',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-30'),
      });

      expect(results).toHaveLength(2);
    });

    it('passes correct ISO datetime params to ticketmaster', async () => {
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([]);

      await EventsService.searchEvents({
        city: 'Nashville',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
      });

      expect(mockSearchTicketmaster).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(mockSearchTicketmaster).mock.calls[0][0];
      expect(callArgs.city).toBe('Nashville');
      expect(callArgs.startDateTime).not.toContain('Z');
      expect(callArgs.endDateTime).not.toContain('Z');
      expect(callArgs.size).toBe(50);
    });
  });

  // ---------------------------------------------------------------
  // searchPlaces
  // ---------------------------------------------------------------

  describe('searchPlaces', () => {
    it('returns places for restaurant type', async () => {
      const place = makePlaceDetails();
      vi.mocked(mockSearchPlaces).mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({
        city: 'Nashville',
        type: 'restaurant',
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].place_id).toBe('place-abc-123');
    });

    it('returns places for bar type', async () => {
      const place = makePlaceDetails({ place_id: 'bar-123', name: 'Honky Tonk Bar' });
      vi.mocked(mockSearchPlaces).mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({
        city: 'Nashville',
        type: 'bar',
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Honky Tonk Bar');
    });

    it('returns places for attraction type', async () => {
      const place = makePlaceDetails({ place_id: 'attr-1', name: 'Ryman Auditorium' });
      vi.mocked(mockSearchPlaces).mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({
        city: 'Nashville',
        type: 'attraction',
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Ryman Auditorium');
    });

    it('returns places for hotel type', async () => {
      const place = makePlaceDetails({ place_id: 'hotel-1', name: 'Grand Hyatt' });
      vi.mocked(mockSearchPlaces).mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({
        city: 'Nashville',
        type: 'hotel',
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Grand Hyatt');
    });

    it('issues 3 queries for type "all" and deduplicates results', async () => {
      const place1 = makePlaceDetails({ place_id: 'p1', name: 'Restaurant A' });
      const place2 = makePlaceDetails({ place_id: 'p2', name: 'Attraction B' });
      const place3 = makePlaceDetails({ place_id: 'p3', name: 'Bar C' });
      // 3 queries for "all" type
      vi.mocked(mockSearchPlaces)
        .mockResolvedValueOnce([place1])
        .mockResolvedValueOnce([place2])
        .mockResolvedValueOnce([place3]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all' });

      expect(mockSearchPlaces).toHaveBeenCalledTimes(3);
      const placeIds = results.map(r => r.place_id);
      expect(placeIds).toContain('p1');
      expect(placeIds).toContain('p2');
      expect(placeIds).toContain('p3');
    });

    it('deduplicates places with the same place_id', async () => {
      const place = makePlaceDetails({ place_id: 'dupe-id' });
      // All 3 queries for "all" return the same place
      vi.mocked(mockSearchPlaces)
        .mockResolvedValueOnce([place])
        .mockResolvedValueOnce([place])
        .mockResolvedValueOnce([place]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all' });

      expect(results.filter(r => r.place_id === 'dupe-id')).toHaveLength(1);
    });

    it('handles search errors non-fatally and continues with other queries', async () => {
      const place = makePlaceDetails({ place_id: 'p1' });
      vi.mocked(mockSearchPlaces)
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce([place])
        .mockResolvedValueOnce([]);

      const results = await EventsService.searchPlaces({ city: 'Nashville', type: 'all' });

      // Should still return results from the successful queries
      expect(results.some(r => r.place_id === 'p1')).toBe(true);
    });

    it('passes location coordinates for known cities', async () => {
      vi.mocked(mockSearchPlaces).mockResolvedValueOnce([]);

      await EventsService.searchPlaces({ city: 'Nashville', type: 'restaurant' });

      const callArgs = vi.mocked(mockSearchPlaces).mock.calls[0][0];
      expect(callArgs.location).toEqual({ lat: 36.1627, lng: -86.7816 });
    });

    it('passes undefined location for unknown city', async () => {
      vi.mocked(mockSearchPlaces).mockResolvedValueOnce([]);

      await EventsService.searchPlaces({ city: 'UnknownCity', type: 'restaurant' });

      const callArgs = vi.mocked(mockSearchPlaces).mock.calls[0][0];
      expect(callArgs.location).toBeUndefined();
    });

    it('respects the limit parameter', async () => {
      // Create 5 places
      const places = Array.from({ length: 5 }, (_, i) =>
        makePlaceDetails({ place_id: `p${i}`, name: `Place ${i}` })
      );
      vi.mocked(mockSearchPlaces).mockResolvedValueOnce(places);

      const results = await EventsService.searchPlaces({
        city: 'Nashville',
        type: 'restaurant',
        limit: 3,
      });

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------
  // getPlaceDetails
  // ---------------------------------------------------------------

  describe('getPlaceDetails', () => {
    it('returns place details for a valid place ID', async () => {
      const place = makePlaceDetails();
      vi.mocked(mockGetPlaceDetails).mockResolvedValueOnce(place);

      const result = await EventsService.getPlaceDetails('place-abc-123');

      expect(result).toEqual(place);
      expect(mockGetPlaceDetails).toHaveBeenCalledWith('place-abc-123');
    });

    it('returns null when place is not found', async () => {
      vi.mocked(mockGetPlaceDetails).mockResolvedValueOnce(null);

      const result = await EventsService.getPlaceDetails('nonexistent-id');

      expect(result).toBeNull();
    });

    it('propagates errors from the places API', async () => {
      vi.mocked(mockGetPlaceDetails).mockRejectedValueOnce(new Error('Network error'));

      await expect(EventsService.getPlaceDetails('place-id')).rejects.toThrow('Network error');
    });
  });

  // ---------------------------------------------------------------
  // searchFlights
  // ---------------------------------------------------------------

  describe('searchFlights', () => {
    it('returns mapped flight offers for valid origin and destination', async () => {
      vi.mocked(mockGetAirportCode)
        .mockResolvedValueOnce('JFK')
        .mockResolvedValueOnce('BNA');
      vi.mocked(mockSearchFlights).mockResolvedValueOnce([makeFlightOffer()]);

      const results = await EventsService.searchFlights({
        origin: 'New York',
        destination: 'Nashville',
        departureDate: new Date('2026-06-15'),
        adults: 2,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'flight-offer-1',
        price: { total: '350.00', currency: 'USD' },
      });
    });

    it('returns empty array when originCode is null', async () => {
      vi.mocked(mockGetAirportCode)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('BNA');

      const results = await EventsService.searchFlights({
        origin: 'Unknown City',
        destination: 'Nashville',
        departureDate: new Date('2026-06-15'),
        adults: 1,
      });

      expect(results).toEqual([]);
      expect(mockSearchFlights).not.toHaveBeenCalled();
    });

    it('returns empty array when destCode is null', async () => {
      vi.mocked(mockGetAirportCode)
        .mockResolvedValueOnce('JFK')
        .mockResolvedValueOnce(null);

      const results = await EventsService.searchFlights({
        origin: 'New York',
        destination: 'Unknown Destination',
        departureDate: new Date('2026-06-15'),
        adults: 1,
      });

      expect(results).toEqual([]);
      expect(mockSearchFlights).not.toHaveBeenCalled();
    });

    it('returns empty array when searchFlights throws', async () => {
      vi.mocked(mockGetAirportCode)
        .mockResolvedValueOnce('JFK')
        .mockResolvedValueOnce('BNA');
      vi.mocked(mockSearchFlights).mockRejectedValueOnce(new Error('Amadeus API error'));

      const results = await EventsService.searchFlights({
        origin: 'New York',
        destination: 'Nashville',
        departureDate: new Date('2026-06-15'),
        adults: 1,
      });

      expect(results).toEqual([]);
    });

    it('returns empty array when getAirportCode throws', async () => {
      vi.mocked(mockGetAirportCode).mockRejectedValueOnce(new Error('Auth failed'));

      const results = await EventsService.searchFlights({
        origin: 'New York',
        destination: 'Nashville',
        departureDate: new Date('2026-06-15'),
        adults: 1,
      });

      expect(results).toEqual([]);
    });

    it('passes correct departure date string to searchFlights', async () => {
      vi.mocked(mockGetAirportCode)
        .mockResolvedValueOnce('JFK')
        .mockResolvedValueOnce('BNA');
      vi.mocked(mockSearchFlights).mockResolvedValueOnce([]);

      await EventsService.searchFlights({
        origin: 'New York',
        destination: 'Nashville',
        departureDate: new Date('2026-06-15T00:00:00.000Z'),
        adults: 1,
      });

      const callArgs = vi.mocked(mockSearchFlights).mock.calls[0][0];
      expect(callArgs.departureDate).toBe('2026-06-15');
    });

    it('passes return date when provided', async () => {
      vi.mocked(mockGetAirportCode)
        .mockResolvedValueOnce('JFK')
        .mockResolvedValueOnce('BNA');
      vi.mocked(mockSearchFlights).mockResolvedValueOnce([]);

      await EventsService.searchFlights({
        origin: 'New York',
        destination: 'Nashville',
        departureDate: new Date('2026-06-15T00:00:00.000Z'),
        returnDate: new Date('2026-06-20T00:00:00.000Z'),
        adults: 2,
      });

      const callArgs = vi.mocked(mockSearchFlights).mock.calls[0][0];
      expect(callArgs.returnDate).toBe('2026-06-20');
      expect(callArgs.adults).toBe(2);
    });

    it('maps flight itineraries and price correctly', async () => {
      vi.mocked(mockGetAirportCode)
        .mockResolvedValueOnce('JFK')
        .mockResolvedValueOnce('BNA');
      const offer = makeFlightOffer({ id: 'unique-flight-id' });
      vi.mocked(mockSearchFlights).mockResolvedValueOnce([offer]);

      const results = await EventsService.searchFlights({
        origin: 'New York',
        destination: 'Nashville',
        departureDate: new Date('2026-06-15'),
        adults: 1,
      });

      expect(results[0].id).toBe('unique-flight-id');
      expect(results[0].itineraries).toHaveLength(1);
      expect(results[0].price.currency).toBe('USD');
    });
  });

  // ---------------------------------------------------------------
  // getPriceEstimate (synchronous)
  // ---------------------------------------------------------------

  describe('getPriceEstimate', () => {
    it('delegates to the places lib getPriceEstimate', () => {
      vi.mocked(mockGetPriceEstimate).mockReturnValueOnce('Free');

      const result = EventsService.getPriceEstimate(0);

      expect(result).toBe('Free');
      expect(mockGetPriceEstimate).toHaveBeenCalledWith(0);
    });

    it('returns Inexpensive for price level 1', () => {
      vi.mocked(mockGetPriceEstimate).mockReturnValueOnce('Inexpensive');

      const result = EventsService.getPriceEstimate(1);

      expect(result).toBe('Inexpensive');
    });

    it('returns Moderate for price level 2', () => {
      vi.mocked(mockGetPriceEstimate).mockReturnValueOnce('Moderate');

      const result = EventsService.getPriceEstimate(2);

      expect(result).toBe('Moderate');
    });

    it('returns Expensive for price level 3', () => {
      vi.mocked(mockGetPriceEstimate).mockReturnValueOnce('Expensive');

      const result = EventsService.getPriceEstimate(3);

      expect(result).toBe('Expensive');
    });

    it('returns Very Expensive for price level 4', () => {
      vi.mocked(mockGetPriceEstimate).mockReturnValueOnce('Very Expensive');

      const result = EventsService.getPriceEstimate(4);

      expect(result).toBe('Very Expensive');
    });

    it('returns Price not available for undefined', () => {
      vi.mocked(mockGetPriceEstimate).mockReturnValueOnce('Price not available');

      const result = EventsService.getPriceEstimate(undefined);

      expect(result).toBe('Price not available');
      expect(mockGetPriceEstimate).toHaveBeenCalledWith(undefined);
    });
  });

  // ---------------------------------------------------------------
  // getDestinationInfo
  // ---------------------------------------------------------------

  describe('getDestinationInfo', () => {
    it('returns combined destination info with events, restaurants, attractions, nightlife, and coordinates', async () => {
      const event = makeTicketmasterEvent();
      const restaurant = makePlaceDetails({ place_id: 'rest-1', price_level: 2 });
      const attraction = makePlaceDetails({ place_id: 'attr-1' });
      const bar = makePlaceDetails({ place_id: 'bar-1' });

      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([event]);
      // searchPlaces is called 3 times (restaurant, attraction, bar) — each single query type
      vi.mocked(mockSearchPlaces)
        .mockResolvedValueOnce([restaurant])
        .mockResolvedValueOnce([attraction])
        .mockResolvedValueOnce([bar]);
      vi.mocked(mockGetPriceEstimate).mockReturnValueOnce('Moderate');

      const info = await EventsService.getDestinationInfo(
        'Nashville',
        new Date('2026-06-01'),
        new Date('2026-06-30')
      );

      expect(info.events).toHaveLength(1);
      expect(info.restaurants).toHaveLength(1);
      expect(info.restaurants[0].priceEstimate).toBe('Moderate');
      expect(info.attractions).toHaveLength(1);
      expect(info.nightlife).toHaveLength(1);
      expect(info.coordinates).toEqual({ lat: 36.1627, lng: -86.7816 });
    });

    it('caps events at 20 results', async () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        makeTicketmasterEvent({ id: `e${i}`, name: `Event ${i}` })
      );
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce(events);
      vi.mocked(mockSearchPlaces)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const info = await EventsService.getDestinationInfo(
        'Nashville',
        new Date('2026-06-01'),
        new Date('2026-06-30')
      );

      expect(info.events).toHaveLength(20);
    });

    it('returns null coordinates for unknown city', async () => {
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([]);
      vi.mocked(mockSearchPlaces)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const info = await EventsService.getDestinationInfo(
        'UnknownCity',
        new Date('2026-06-01'),
        new Date('2026-06-30')
      );

      expect(info.coordinates).toBeNull();
    });

    it('attaches priceEstimate to each restaurant', async () => {
      const restaurant1 = makePlaceDetails({ place_id: 'r1', price_level: 1 });
      const restaurant2 = makePlaceDetails({ place_id: 'r2', price_level: 3 });

      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([]);
      vi.mocked(mockSearchPlaces)
        .mockResolvedValueOnce([restaurant1, restaurant2])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      vi.mocked(mockGetPriceEstimate)
        .mockReturnValueOnce('Inexpensive')
        .mockReturnValueOnce('Expensive');

      const info = await EventsService.getDestinationInfo(
        'NYC',
        new Date('2026-06-01'),
        new Date('2026-06-30')
      );

      expect(info.restaurants[0].priceEstimate).toBe('Inexpensive');
      expect(info.restaurants[1].priceEstimate).toBe('Expensive');
    });

    it('returns known NYC coordinates', async () => {
      vi.mocked(mockSearchTicketmaster).mockResolvedValueOnce([]);
      vi.mocked(mockSearchPlaces)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const info = await EventsService.getDestinationInfo(
        'NYC',
        new Date('2026-06-01'),
        new Date('2026-06-30')
      );

      expect(info.coordinates).toEqual({ lat: 40.7128, lng: -74.0060 });
    });

    it('handles all external API errors gracefully', async () => {
      vi.mocked(mockSearchTicketmaster).mockRejectedValueOnce(new Error('TM down'));
      vi.mocked(mockSearchPlaces)
        .mockRejectedValueOnce(new Error('Places error 1'))
        .mockRejectedValueOnce(new Error('Places error 2'))
        .mockRejectedValueOnce(new Error('Places error 3'));

      const info = await EventsService.getDestinationInfo(
        'Nashville',
        new Date('2026-06-01'),
        new Date('2026-06-30')
      );

      expect(info.events).toEqual([]);
      expect(info.restaurants).toEqual([]);
      expect(info.attractions).toEqual([]);
      expect(info.nightlife).toEqual([]);
      expect(info.coordinates).toEqual({ lat: 36.1627, lng: -86.7816 });
    });
  });
});
