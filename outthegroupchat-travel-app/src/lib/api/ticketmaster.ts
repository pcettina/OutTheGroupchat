import axios from 'axios';
import { logger } from '@/lib/logger';

const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;

export interface TicketmasterEvent {
  id: string;
  name: string;
  url: string;
  dates: {
    start: {
      localDate: string;
      localTime: string;
    };
  };
  priceRanges?: Array<{
    min: number;
    max: number;
    currency: string;
  }>;
  _embedded?: {
    venues: Array<{
      name: string;
      city: {
        name: string;
      };
      state: {
        name: string;
      };
      country: {
        name: string;
      };
    }>;
  };
}

export interface EventSearchParams {
  city: string;
  startDateTime: string;
  endDateTime: string;
  size?: number;
}

export async function searchEvents({
  city,
  startDateTime,
  endDateTime,
  size = 20,
}: EventSearchParams): Promise<TicketmasterEvent[]> {
  try {
    const response = await axios.get(`${TICKETMASTER_BASE_URL}/events`, {
      params: {
        apikey: TICKETMASTER_API_KEY,
        city,
        startDateTime,
        endDateTime,
        size,
      },
    });

    return response.data._embedded?.events || [];
  } catch (error) {
    logger.error({ error }, 'Error fetching Ticketmaster events');
    return [];
  }
}

export async function getEventDetails(eventId: string): Promise<TicketmasterEvent | null> {
  try {
    const response = await axios.get(`${TICKETMASTER_BASE_URL}/events/${eventId}`, {
      params: {
        apikey: TICKETMASTER_API_KEY,
      },
    });

    return response.data;
  } catch (error) {
    logger.error({ error }, 'Error fetching Ticketmaster event details');
    return null;
  }
} 