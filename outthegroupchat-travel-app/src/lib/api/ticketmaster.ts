/**
 * @module ticketmaster
 * @description Client wrapper for the Ticketmaster Discovery API v2.
 * Provides helpers to search for live events by city and date range, and to
 * fetch full event details by ID.
 * Requires the `TICKETMASTER_API_KEY` environment variable.
 */
import axios from 'axios';
import { logger } from '@/lib/logger';

const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;

/**
 * Normalized representation of a Ticketmaster event as returned by the Discovery API.
 */
export interface TicketmasterEvent {
  /** Unique Ticketmaster identifier for this event. */
  id: string;
  /** Display name of the event (e.g. "Taylor Swift | The Eras Tour"). */
  name: string;
  /** URL to the event's Ticketmaster purchase page. */
  url: string;
  /** Date and time details for the event. */
  dates: {
    /** Scheduled start date/time information. */
    start: {
      /** Local start date in YYYY-MM-DD format. */
      localDate: string;
      /** Local start time in HH:MM:SS format. */
      localTime: string;
    };
  };
  /**
   * Ticket price ranges for this event. May be absent if pricing is not yet published
   * or the event is free.
   */
  priceRanges?: Array<{
    /** Minimum ticket price. */
    min: number;
    /** Maximum ticket price. */
    max: number;
    /** ISO 4217 currency code for the price values (e.g. "USD"). */
    currency: string;
  }>;
  /**
   * Embedded venue information provided by the Ticketmaster HAL response.
   * May be absent for virtual or venue-TBA events.
   */
  _embedded?: {
    /** List of venues where this event is held. Typically contains one entry. */
    venues: Array<{
      /** Display name of the venue (e.g. "Madison Square Garden"). */
      name: string;
      /** City in which the venue is located. */
      city: {
        /** City name string. */
        name: string;
      };
      /** State or province in which the venue is located. */
      state: {
        /** State or province name string. */
        name: string;
      };
      /** Country in which the venue is located. */
      country: {
        /** Country name string. */
        name: string;
      };
    }>;
  };
}

/**
 * Parameters accepted by {@link searchEvents} to query the Ticketmaster Discovery API.
 */
export interface EventSearchParams {
  /** Name of the city to search for events in (e.g. "New York"). */
  city: string;
  /** ISO 8601 start of the search date/time window (e.g. "2026-06-01T00:00:00Z"). */
  startDateTime: string;
  /** ISO 8601 end of the search date/time window (e.g. "2026-06-07T23:59:59Z"). */
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