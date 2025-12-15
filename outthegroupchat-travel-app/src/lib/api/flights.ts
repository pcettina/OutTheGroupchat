import axios from 'axios';

const AMADEUS_API_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.AMADEUS_API_SECRET;
const AMADEUS_BASE_URL = 'https://test.api.amadeus.com/v2';

interface AmadeusToken {
  access_token: string;
  expires_at: number;
}

let amadeusToken: AmadeusToken | null = null;

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
  } catch (error) {
    console.error('Error getting Amadeus token:', error);
    throw new Error('Failed to authenticate with Amadeus API');
  }
}

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

    return response.data.data.map((offer: any) => ({
      id: offer.id,
      source: {
        iataCode: offer.itineraries[0].segments[0].departure.iataCode,
        cityName: offer.itineraries[0].segments[0].departure.cityName || '',
      },
      destination: {
        iataCode: offer.itineraries[0].segments[0].arrival.iataCode,
        cityName: offer.itineraries[0].segments[0].arrival.cityName || '',
      },
      itineraries: offer.itineraries.map((itinerary: any) => ({
        duration: itinerary.duration,
        segments: itinerary.segments.map((segment: any) => ({
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
  } catch (error) {
    console.error('Error searching flights:', error);
    return [];
  }
}

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
  } catch (error) {
    console.error('Error getting airport code:', error);
    return null;
  }
} 