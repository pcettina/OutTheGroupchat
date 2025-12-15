// Events Service - Aggregates events from multiple sources
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

export interface SearchEventsParams {
  city: string;
  startDate: Date;
  endDate: Date;
  categories?: string[];
}

export interface SearchPlacesParams {
  city: string;
  type?: 'restaurant' | 'bar' | 'attraction' | 'hotel' | 'all';
  limit?: number;
}

export interface SearchFlightsParams {
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  adults: number;
}

export class EventsService {
  /**
   * Search for events in a city during a date range
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
    } catch (error) {
      console.error('Error fetching Ticketmaster events:', error);
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
   * Search for places (restaurants, bars, attractions) in a city
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
      } catch (error) {
        console.error(`Error searching places for "${query}":`, error);
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
   * Get place details with enhanced information
   */
  static async getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
    return getPlaceDetails(placeId);
  }

  /**
   * Search for flights
   */
  static async searchFlights(params: SearchFlightsParams): Promise<FlightOffer[]> {
    const { origin, destination, departureDate, returnDate, adults } = params;

    try {
      // Get airport codes
      const originCode = await getAirportCode(origin);
      const destCode = await getAirportCode(destination);

      if (!originCode || !destCode) {
        console.error('Could not find airport codes for origin/destination');
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
    } catch (error) {
      console.error('Error searching flights:', error);
      return [];
    }
  }

  /**
   * Get price estimate text from price level
   */
  static getPriceEstimate(priceLevel: number | undefined): string {
    return getPriceEstimate(priceLevel);
  }

  /**
   * Get comprehensive destination info
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

