import axios from 'axios';
import { logger } from '@/lib/logger';

const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;

/**
 * @description Represents an event returned from the Ticketmaster Discovery API.
 * @property {string} id - Unique Ticketmaster identifier for the event.
 * @property {string} name - Display name of the event.
 * @property {string} url - URL to the event's Ticketmaster purchase page.
 * @property {object} dates - Scheduling information for the event.
 * @property {object} dates.start - Start date and time details.
 * @property {string} dates.start.localDate - Event start date in YYYY-MM-DD format (local time zone).
 * @property {string} dates.start.localTime - Event start time in HH:MM:SS format (local time zone).
 * @property {Array<{ min: number; max: number; currency: string }>} [priceRanges] - Optional ticket price ranges; each entry has a min, max, and ISO 4217 currency code.
 * @property {object} [_embedded] - Optional embedded related resources returned by the Ticketmaster API.
 * @property {Array<object>} [_embedded.venues] - List of venues associated with the event.
 * @property {string} _embedded.venues[].name - Venue name.
 * @property {{ name: string }} _embedded.venues[].city - City where the venue is located.
 * @property {{ name: string }} _embedded.venues[].state - State or region where the venue is located.
 * @property {{ name: string }} _embedded.venues[].country - Country where the venue is located.
 */
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

/**
 * @description Parameters accepted by the searchEvents function to query the Ticketmaster Discovery API.
 * @property {string} city - The city name to search for events in (e.g. "New York").
 * @property {string} startDateTime - ISO 8601 start of the date range (e.g. "2026-06-01T00:00:00Z").
 * @property {string} endDateTime - ISO 8601 end of the date range (e.g. "2026-06-07T23:59:59Z").
 * @property {number} [size] - Maximum number of events to return (default: 20).
 */
export interface EventSearchParams {
  city: string;
  startDateTime: string;
  endDateTime: string;
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