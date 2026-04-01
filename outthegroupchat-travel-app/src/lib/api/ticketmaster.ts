import axios from 'axios';
import { logger } from '@/lib/logger';

const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;

/**
 * Represents an event returned by the Ticketmaster Discovery API.
 */
export interface TicketmasterEvent {
  /** Unique Ticketmaster event identifier. */
  id: string;
  /** Display name/title of the event. */
  name: string;
  /** URL to the event's page on Ticketmaster for purchasing tickets. */
  url: string;
  /** Scheduling information for the event. */
  dates: {
    /** Start date and time details. */
    start: {
      /** Local start date in YYYY-MM-DD format. */
      localDate: string;
      /** Local start time in HH:mm:ss format. */
      localTime: string;
    };
  };
  /** Ticket price ranges for the event. Optional — absent when pricing is unavailable. */
  priceRanges?: Array<{
    /** Minimum ticket price for this range. */
    min: number;
    /** Maximum ticket price for this range. */
    max: number;
    /** ISO 4217 currency code for the prices (e.g., 'USD'). */
    currency: string;
  }>;
  /** Embedded related resources, including venue details. Optional. */
  _embedded?: {
    /** List of venues where the event is held. */
    venues: Array<{
      /** Display name of the venue. */
      name: string;
      /** City where the venue is located. */
      city: {
        /** City name. */
        name: string;
      };
      /** State or region where the venue is located. */
      state: {
        /** State or region name. */
        name: string;
      };
      /** Country where the venue is located. */
      country: {
        /** Country name. */
        name: string;
      };
    }>;
  };
}

/**
 * Parameters for searching events via the Ticketmaster Discovery API.
 */
export interface EventSearchParams {
  /** Name of the city to search for events in (e.g., 'New York'). */
  city: string;
  /** ISO 8601 datetime marking the start of the search window (e.g., '2026-06-01T00:00:00Z'). */
  startDateTime: string;
  /** ISO 8601 datetime marking the end of the search window. */
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