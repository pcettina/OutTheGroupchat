/**
 * @module flights
 * @description Client wrapper for the Amadeus Flight Offers and Locations APIs.
 * Handles OAuth2 token acquisition and caching, flight search, and IATA code lookup.
 * Requires `AMADEUS_API_KEY` and `AMADEUS_API_SECRET` environment variables.
 */
import axios from 'axios';

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;
const AMADEUS_BASE_URL = 'https://test.api.amadeus.com/v2';

interface AmadeusToken {
  access_token: string;
  expires_at: number;
}

let amadeusToken: AmadeusToken | null = null;

/**
 * Normalized representation of a flight offer returned by the Amadeus API.
 */
export interface FlightOffer {
  /** Unique identifier assigned by Amadeus for this offer. */
  id: string;
  /** Departure airport details derived from the first segment of the first itinerary. */
  source: {
    /** IATA code of the departure airport or city (e.g. "JFK"). */
    iataCode: string;
    /** Human-readable city name for the departure location. */
    cityName: string;
  };
  /** Arrival airport details derived from the first segment of the first itinerary. */
  destination: {
    /** IATA code of the arrival airport or city (e.g. "CDG"). */
    iataCode: string;
    /** Human-readable city name for the arrival location. */
    cityName: string;
  };
  /**
   * Ordered list of itineraries (outbound + optional return).
   * Each itinerary contains one or more flight segments.
   */
  itineraries: Array<{
    /** Total flight duration in ISO 8601 duration format (e.g. "PT10H30M"). */
    duration: string;
    /** Individual flight segments that make up this itinerary (legs). */
    segments: Array<{
      /** Departure information for this segment. */
      departure: {
        /** IATA code of the departure airport. */
        iataCode: string;
        /** Terminal identifier at the departure airport, if available. */
        terminal?: string;
        /** Scheduled departure date-time in ISO 8601 format. */
        at: string;
      };
      /** Arrival information for this segment. */
      arrival: {
        /** IATA code of the arrival airport. */
        iataCode: string;
        /** Terminal identifier at the arrival airport, if available. */
        terminal?: string;
        /** Scheduled arrival date-time in ISO 8601 format. */
        at: string;
      };
      /** IATA carrier code of the operating airline (e.g. "AA"). */
      carrierCode: string;
      /** Flight number (excluding carrier prefix, e.g. "123"). */
      number: string;
      /** Aircraft type information. */
      aircraft: {
        /** ICAO or IATA aircraft type code (e.g. "738"). */
        code: string;
      };
      /** Segment flight duration in ISO 8601 duration format. */
      duration: string;
      /** Unique segment identifier within the offer. */
      id: string;
    }>;
  }>;
  /** Pricing information for this offer. */
  price: {
    /** ISO 4217 currency code (e.g. "USD"). */
    currency: string;
    /** Total price including taxes and fees, as a decimal string. */
    total: string;
    /** Base fare before taxes and fees, as a decimal string. */
    base: string;
  };
  /** Number of seats still available for booking at this price. */
  numberOfBookableSeats: number;
}

async function getAmadeusToken(): Promise<string> {
  if (amadeusToken && amadeusToken.expires_at > Date.now()) {
    return amadeusToken.access_token;
  }

  try {
    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: AMADEUS_API_KEY!,
        client_secret: AMADEUS_API_SECRET!,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    amadeusToken = {
      access_token: response.data.access_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
    };

    return amadeusToken.access_token;
  } catch {
    throw new Error('Failed to authenticate with Amadeus API');
  }
}

interface AmadeusSegmentRaw {
  departure: { iataCode: string; terminal?: string; at: string; cityName?: string };
  arrival: { iataCode: string; terminal?: string; at: string; cityName?: string };
  carrierCode: string;
  number: string;
  aircraft: { code: string };
  duration: string;
  id: string;
}

interface AmadeusItineraryRaw {
  duration: string;
  segments: AmadeusSegmentRaw[];
}

interface AmadeusOfferRaw {
  id: string;
  itineraries: AmadeusItineraryRaw[];
  price: { currency: string; total: string; base: string };
  numberOfBookableSeats: number;
}

/**
 * Parameters accepted by {@link searchFlights} to query the Amadeus Flight Offers API.
 */
export interface FlightSearchParams {
  /** IATA code of the origin airport or city (e.g. "JFK"). */
  originLocationCode: string;
  /** IATA code of the destination airport or city (e.g. "CDG"). */
  destinationLocationCode: string;
  /** Outbound departure date in YYYY-MM-DD format. */
  departureDate: string;
  /** Return date in YYYY-MM-DD format. Omit for one-way searches. */
  returnDate?: string;
  /** Number of adult passengers (default: 1). */
  adults?: number;
  /** When true, only non-stop flights are returned (default: false). */
  nonStop?: boolean;
  /** ISO 4217 currency code for pricing (default: "USD"). */
  currencyCode?: string;
  /** Maximum number of flight offers to return (default: 10). */
  max?: number;
}

/**
 * @description Searches for available flight offers via the Amadeus Flight Offers API.
 * Returns an empty array on error rather than throwing.
 * @param {FlightSearchParams} params - Search parameters including origin, destination, dates, and filters.
 * @param {string} params.originLocationCode - IATA code for the departure airport/city.
 * @param {string} params.destinationLocationCode - IATA code for the arrival airport/city.
 * @param {string} params.departureDate - Departure date in YYYY-MM-DD format.
 * @param {string} [params.returnDate] - Optional return date in YYYY-MM-DD format for round trips.
 * @param {number} [params.adults=1] - Number of adult passengers.
 * @param {boolean} [params.nonStop=false] - Whether to filter for non-stop flights only.
 * @param {string} [params.currencyCode='USD'] - Currency code for pricing.
 * @param {number} [params.max=10] - Maximum number of offers to return.
 * @returns {Promise<FlightOffer[]>} Array of normalized flight offer objects.
 */
export async function searchFlights({
  originLocationCode,
  destinationLocationCode,
  departureDate,
  returnDate,
  adults = 1,
  nonStop = false,
  currencyCode = 'USD',
  max = 10,
}: FlightSearchParams): Promise<FlightOffer[]> {
  try {
    const token = await getAmadeusToken();

    const response = await axios.get(`${AMADEUS_BASE_URL}/shopping/flight-offers`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        originLocationCode,
        destinationLocationCode,
        departureDate,
        returnDate,
        adults,
        nonStop,
        currencyCode,
        max,
      },
    });

    return response.data.data.map((offer: AmadeusOfferRaw) => ({
      id: offer.id,
      source: {
        iataCode: offer.itineraries[0].segments[0].departure.iataCode,
        cityName: offer.itineraries[0].segments[0].departure.cityName || '',
      },
      destination: {
        iataCode: offer.itineraries[0].segments[0].arrival.iataCode,
        cityName: offer.itineraries[0].segments[0].arrival.cityName || '',
      },
      itineraries: offer.itineraries.map((itinerary: AmadeusItineraryRaw) => ({
        duration: itinerary.duration,
        segments: itinerary.segments.map((segment: AmadeusSegmentRaw) => ({
          departure: {
            iataCode: segment.departure.iataCode,
            terminal: segment.departure.terminal,
            at: segment.departure.at,
          },
          arrival: {
            iataCode: segment.arrival.iataCode,
            terminal: segment.arrival.terminal,
            at: segment.arrival.at,
          },
          carrierCode: segment.carrierCode,
          number: segment.number,
          aircraft: {
            code: segment.aircraft.code,
          },
          duration: segment.duration,
          id: segment.id,
        })),
      })),
      price: {
        currency: offer.price.currency,
        total: offer.price.total,
        base: offer.price.base,
      },
      numberOfBookableSeats: offer.numberOfBookableSeats,
    }));
  } catch {
    return [];
  }
}

/**
 * @description Looks up the primary IATA code for a given city or airport name using the Amadeus Locations API.
 * Returns null when no match is found or on error.
 * @param {string} cityName - The city or airport name to search for.
 * @returns {Promise<string | null>} The IATA code of the first matching location, or null.
 */
export async function getAirportCode(cityName: string): Promise<string | null> {
  try {
    const token = await getAmadeusToken();

    const response = await axios.get(
      `${AMADEUS_BASE_URL}/reference-data/locations`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          keyword: cityName,
          subType: 'CITY,AIRPORT',
        },
      }
    );

    if (response.data.data && response.data.data.length > 0) {
      return response.data.data[0].iataCode;
    }

    return null;
  } catch {
    return null;
  }
} 