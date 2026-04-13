/**
 * @module events.service
 * @description Aggregates event, place, and flight data from multiple external sources
 * (Ticketmaster, Google Places, flight APIs) to support trip activity discovery,
 * venue recommendations, and travel logistics for group trip planning.
 */
import { searchEvents as searchTicketmaster } from '@/lib/api/ticketmaster';
import { searchPlaces, getPlaceDetails, getPriceEstimate, type PlaceDetails } from '@/lib/api/places';
import { searchFlights, getAirportCode } from '@/lib/api/flights';
import type { EventSearchResult, FlightOffer } from '@/types';

// City to coordinates mapping for better search
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Nashville': { lat: 36.1627, lng: -86.7816 },
  'NYC': { lat: 40.7128, lng: -74.0060 },
  'New York': { lat: 40.7128, lng: -74.0060 },
  'Chicago': { lat: 41.8781, lng: -87.6298 },
  'Los Angeles': { lat: 34.0522, lng: -118.2437 },
  'LA': { lat: 34.0522, lng: -118.2437 },
  'Austin': { lat: 30.2672, lng: -97.7431 },
  'Boston': { lat: 42.3601, lng: -71.0589 },
  'Charleston': { lat: 32.7765, lng: -79.9311 },
};

/**
 * @description Parameters for searching Ticketmaster events in a city during a date range.
 * @property city - The destination city name (e.g., "Nashville", "Chicago")
 * @property startDate - The start of the date range to search for events
 * @property endDate - The end of the date range to search for events
 * @property categories - Optional list of category filters (e.g., "sports", "music", "comedy", "theater")
 */
export interface SearchEventsParams {
  city: string;
  startDate: Date;
  endDate: Date;
  categories?: string[];
}

/**
 * @description Parameters for searching places (restaurants, bars, attractions, hotels) in a city.
 * @property city - The destination city name to search within
 * @property type - The category of place to search for; defaults to 'all' which queries
 *   restaurants, things to do, and nightlife in a single call
 * @property limit - Maximum number of results to return; defaults to 20
 */
export interface SearchPlacesParams {
  city: string;
  type?: 'restaurant' | 'bar' | 'attraction' | 'hotel' | 'all';
  limit?: number;
}

/**
 * @description Parameters for searching available flights between two locations.
 * @property origin - City or airport name for the departure location
 * @property destination - City or airport name for the arrival location
 * @property departureDate - The outbound flight date
 * @property returnDate - Optional return flight date for round-trip searches
 * @property adults - Number of adult passengers (minimum 1)
 */
export interface SearchFlightsParams {
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  adults: number;
}

/**
 * @description Service class providing static methods to query events, places, and flight data
 * from external APIs in support of group trip planning and destination discovery.
 */
export class EventsService {
  /**
   * Search for events in a city during a date range using the Ticketmaster API.
   * Results are optionally filtered by category keywords matched against event names.
   * @param params - Search parameters including city, date range, and optional category filters
   * @returns A promise resolving to an array of normalised event results; returns an empty
   *   array when the Ticketmaster API is unavailable
   * @throws Never — Ticketmaster errors are caught internally and treated as empty results
   */
  static async searchEvents(params: SearchEventsParams): Promise<EventSearchResult[]> {
    const { city, startDate, endDate, categories } = params;
    
    const results: EventSearchResult[] = [];

    try {
      // Search Ticketmaster
      const ticketmasterEvents = await searchTicketmaster({
        city,
        startDateTime: startDate.toISOString().replace('Z', ''),
        endDateTime: endDate.toISOString().replace('Z', ''),
        size: 50,
      });

      for (const event of ticketmasterEvents) {
        results.push({
          id: event.id,
          name: event.name,
          type: 'ticketmaster',
          date: event.dates.start.localDate,
          venue: event._embedded?.venues?.[0]?.name || 'Venue TBD',
          priceRange: event.priceRanges?.[0] ? {
            min: event.priceRanges[0].min,
            max: event.priceRanges[0].max,
          } : undefined,
          url: event.url,
        });
      }
    } catch {
      // Ticketmaster errors are non-fatal; continue with empty results
    }

    // Filter by category if specified
    if (categories && categories.length > 0) {
      return results.filter(event => {
        const name = event.name.toLowerCase();
        return categories.some(cat => {
          switch (cat.toLowerCase()) {
            case 'sports':
              return name.includes('game') || name.includes('match') || name.includes('vs');
            case 'music':
              return name.includes('concert') || name.includes('tour') || name.includes('live');
            case 'comedy':
              return name.includes('comedy') || name.includes('stand-up');
            case 'theater':
              return name.includes('theater') || name.includes('musical') || name.includes('play');
            default:
              return true;
          }
        });
      });
    }

    return results;
  }

  /**
   * Search for places (restaurants, bars, attractions, hotels) in a city using the
   * Google Places API. When `type` is 'all', multiple queries are issued in sequence
   * and results are de-duplicated by `place_id`.
   * @param params - Search parameters including city, place type, and result limit
   * @returns A promise resolving to a de-duplicated array of place details up to `limit`
   *   entries; individual query failures are silently skipped
   * @throws Never — per-query errors are caught internally and treated as empty sub-results
   */
  static async searchPlaces(params: SearchPlacesParams): Promise<PlaceDetails[]> {
    const { city, type = 'all', limit = 20 } = params;
    
    const coordinates = CITY_COORDINATES[city];
    const queries: string[] = [];

    switch (type) {
      case 'restaurant':
        queries.push(`restaurants in ${city}`);
        break;
      case 'bar':
        queries.push(`bars and nightlife in ${city}`);
        break;
      case 'attraction':
        queries.push(`tourist attractions in ${city}`);
        break;
      case 'hotel':
        queries.push(`hotels in ${city}`);
        break;
      case 'all':
      default:
        queries.push(
          `popular restaurants in ${city}`,
          `things to do in ${city}`,
          `nightlife in ${city}`
        );
    }

    const results: PlaceDetails[] = [];

    for (const query of queries) {
      try {
        const places = await searchPlaces({
          query,
          location: coordinates,
          radius: 10000,
        });

        results.push(...places.slice(0, Math.ceil(limit / queries.length)));
      } catch {
        // Place search errors are non-fatal; skip this query
      }
    }

    // Remove duplicates
    const uniquePlaces = results.reduce((acc, place) => {
      if (!acc.find(p => p.place_id === place.place_id)) {
        acc.push(place);
      }
      return acc;
    }, [] as PlaceDetails[]);

    return uniquePlaces.slice(0, limit);
  }

  /**
   * Retrieve detailed information for a single place by its Google Places ID.
   * Delegates directly to the underlying `getPlaceDetails` library function.
   * @param placeId - The Google Places `place_id` string identifying the venue
   * @returns A promise resolving to the full `PlaceDetails` object, or `null` when
   *   the place cannot be found or the API is unavailable
   * @throws When the external Places API returns an unexpected error
   */
  static async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    return getPlaceDetails(placeId);
  }

  /**
   * Search for available flights between two cities using the Amadeus flights API.
   * City names are resolved to IATA airport codes before the search is executed.
   * @param params - Search parameters including origin, destination, departure date,
   *   optional return date, and number of adults
   * @returns A promise resolving to an array of up to 10 normalised `FlightOffer` objects;
   *   returns an empty array when airport codes cannot be resolved or the API fails
   * @throws Never — all errors are caught internally and result in an empty array return
   */
  static async searchFlights(params: SearchFlightsParams): Promise<FlightOffer[]> {
    const { origin, destination, departureDate, returnDate, adults } = params;

    try {
      // Get airport codes
      const originCode = await getAirportCode(origin);
      const destCode = await getAirportCode(destination);

      if (!originCode || !destCode) {
        return [];
      }

      const flights = await searchFlights({
        originLocationCode: originCode,
        destinationLocationCode: destCode,
        departureDate: departureDate.toISOString().split('T')[0],
        returnDate: returnDate?.toISOString().split('T')[0],
        adults,
        max: 10,
      });

      return flights.map(flight => ({
        id: flight.id,
        price: {
          total: flight.price.total,
          currency: flight.price.currency,
        },
        itineraries: flight.itineraries,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Convert a numeric Google Places price level into a human-readable estimate string.
   * Delegates directly to the underlying `getPriceEstimate` library function.
   * @param priceLevel - Google Places price level integer (0–4), or `undefined` when
   *   the place has no pricing data
   * @returns A display string such as "Free", "$", "$$", "$$$", or "$$$$";
   *   returns a default value for `undefined` or out-of-range inputs
   */
  static getPriceEstimate(priceLevel: number | undefined): string {
    return getPriceEstimate(priceLevel);
  }

  /**
   * Fetch comprehensive destination information including events, restaurants,
   * attractions, and nightlife for a given city and date range.
   * All four data sources are queried concurrently via `Promise.all`.
   * @param city - The destination city name (e.g., "Nashville", "New York")
   * @param startDate - The start date of the trip used to bound the event search window
   * @param endDate - The end date of the trip used to bound the event search window
   * @returns A promise resolving to an object with the following shape:
   *   - `events` — up to 20 `EventSearchResult` items from Ticketmaster
   *   - `restaurants` — up to 10 `PlaceDetails` entries each augmented with a `priceEstimate` string
   *   - `attractions` — up to 10 `PlaceDetails` entries for tourist attractions
   *   - `nightlife` — up to 10 `PlaceDetails` entries for bars and nightlife venues
   *   - `coordinates` — `{ lat, lng }` for known cities, or `null` when the city is not in
   *     the built-in coordinate mapping
   * @throws Never — individual sub-requests swallow errors and return empty arrays on failure
   */
  static async getDestinationInfo(city: string, startDate: Date, endDate: Date) {
    const [events, restaurants, attractions, nightlife] = await Promise.all([
      this.searchEvents({ city, startDate, endDate }),
      this.searchPlaces({ city, type: 'restaurant', limit: 10 }),
      this.searchPlaces({ city, type: 'attraction', limit: 10 }),
      this.searchPlaces({ city, type: 'bar', limit: 10 }),
    ]);

    return {
      events: events.slice(0, 20),
      restaurants: restaurants.map(r => ({
        ...r,
        priceEstimate: this.getPriceEstimate(r.price_level),
      })),
      attractions,
      nightlife,
      coordinates: CITY_COORDINATES[city] || null,
    };
  }
}

