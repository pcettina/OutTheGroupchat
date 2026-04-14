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
 * @description Represents a normalized flight offer returned from the Amadeus Flight Offers API.
 * @property {string} id - Unique identifier for the flight offer assigned by Amadeus.
 * @property {{ iataCode: string; cityName: string }} source - Departure airport IATA code and city name.
 * @property {{ iataCode: string; cityName: string }} destination - Arrival airport IATA code and city name.
 * @property {Array<object>} itineraries - One or more itineraries (outbound, return) each containing flight segments.
 * @property {string} itineraries[].duration - Total itinerary duration in ISO 8601 duration format (e.g. "PT5H30M").
 * @property {Array<object>} itineraries[].segments - Individual flight segments within this itinerary.
 * @property {object} itineraries[].segments[].departure - Departure details including IATA code, optional terminal, and datetime.
 * @property {object} itineraries[].segments[].arrival - Arrival details including IATA code, optional terminal, and datetime.
 * @property {string} itineraries[].segments[].carrierCode - IATA airline carrier code (e.g. "AA", "UA").
 * @property {string} itineraries[].segments[].number - Flight number (e.g. "1234").
 * @property {{ code: string }} itineraries[].segments[].aircraft - Aircraft type code.
 * @property {string} itineraries[].segments[].duration - Segment flight duration in ISO 8601 duration format.
 * @property {string} itineraries[].segments[].id - Unique segment identifier within the offer.
 * @property {{ currency: string; total: string; base: string }} price - Pricing details with currency, total, and base fare.
 * @property {number} numberOfBookableSeats - Number of seats available to book at this price.
 */
export interface FlightOffer {
  id: string;
  source: {
    iataCode: string;
    cityName: string;
  };
  destination: {
    iataCode: string;
    cityName: string;
  };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      carrierCode: string;
      number: string;
      aircraft: {
        code: string;
      };
      duration: string;
      id: string;
    }>;
  }>;
  price: {
    currency: string;
    total: string;
    base: string;
  };
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
 * @description Parameters accepted by the searchFlights function to query the Amadeus Flight Offers API.
 * @property {string} originLocationCode - IATA code for the departure airport or city (e.g. "JFK").
 * @property {string} destinationLocationCode - IATA code for the arrival airport or city (e.g. "CDG").
 * @property {string} departureDate - Departure date in YYYY-MM-DD format.
 * @property {string} [returnDate] - Optional return date in YYYY-MM-DD format for round-trip searches.
 * @property {number} [adults] - Number of adult passengers (default: 1).
 * @property {boolean} [nonStop] - When true, returns only non-stop flights (default: false).
 * @property {string} [currencyCode] - ISO 4217 currency code for pricing (default: "USD").
 * @property {number} [max] - Maximum number of flight offers to return (default: 10).
 */
export interface FlightSearchParams {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  nonStop?: boolean;
  currencyCode?: string;
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