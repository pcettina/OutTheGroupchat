import axios from 'axios';
import { logger } from '@/lib/logger';

const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;

/**
 * Represents an event returned by the Ticketmaster Discovery API,
 * including schedule, venue details, and optional ticket price ranges.
 */
export interface TicketmasterEvent {
  /** Unique Ticketmaster event identifier. */
  id: string;
  /** Display name of the event. */
  name: string;
  /** Deep-link URL to the event's Ticketmaster purchase page. */
  url: string;
  /** Scheduling information for the event. */
  dates: {
    start: {
      /** Local start date in YYYY-MM-DD format. */
      localDate: string;
      /** Local start time in HH:MM:SS format. */
      localTime: string;
    };
  };
  /** Ticket price ranges; absent when pricing is not publicly available. */
  priceRanges?: Array<{
    /** Minimum ticket price in the given currency. */
    min: number;
    /** Maximum ticket price in the given currency. */
    max: number;
    /** ISO 4217 currency code for the price range (e.g., "USD"). */
    currency: string;
  }>;
  /** Embedded venue data returned by the Ticketmaster HAL response. */
  _embedded?: {
    /** List of venues where the event is held. */
    venues: Array<{
      /** Venue display name. */
      name: string;
      city: {
        /** City name of the venue. */
        name: string;
      };
      state: {
        /** State or region name of the venue. */
        name: string;
      };
      country: {
        /** Country name of the venue. */
        name: string;
      };
    }>;
  };
}

/**
 * Parameters accepted by {@link searchEvents} when querying the Ticketmaster Discovery API.
 */
export interface EventSearchParams {
  /** City name to search for events in (e.g., "New York"). */
  city: string;
  /** ISO 8601 start of the search window (e.g., "2026-06-01T00:00:00Z"). */
  startDateTime: string;
  /** ISO 8601 end of the search window (e.g., "2026-06-07T23:59:59Z"). */
  endDateTime: string;
  /** Maximum number of events to return (default: 20). */
  size?: number;
}

/**
 * @description Searches for events in a given city within a date range using the Ticketmaster Discovery API.
 * Returns an empty array on error rather than throwing.
 * @param {EventSearchParams} params - Search parameters for the event query.
 * @param {string} params.city - The city name to search for events in.
 * @param {string} params.startDateTime - ISO 8601 start of the date range (e.g. "2026-06-01T00:00:00Z").
 * @param {string} params.endDateTime - ISO 8601 end of the date range.
 * @param {number} [params.size=20] - Maximum number of events to return.
 * @returns {Promise<TicketmasterEvent[]>} Array of Ticketmaster event objects.
 */
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

/**
 * @description Fetches full details for a single Ticketmaster event by its ID.
 * Returns null when the event is not found or on error.
 * @param {string} eventId - The Ticketmaster event identifier.
 * @returns {Promise<TicketmasterEvent | null>} The event details object, or null.
 */
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