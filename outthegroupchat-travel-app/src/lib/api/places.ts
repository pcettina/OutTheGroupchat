/**
 * @module places
 * @description Client wrapper for the Google Places API (Text Search and Details endpoints).
 * Exposes helpers to search for places, retrieve detailed place information, and convert
 * the numeric `price_level` field to a human-readable string.
 * Requires the `GOOGLE_PLACES_API_KEY` environment variable.
 */
import axios from 'axios';
import { logger } from '@/lib/logger';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

/**
 * Subset of the Google Places Details response returned by {@link getPlaceDetails}
 * and individual results from {@link searchPlaces}.
 */
export interface PlaceDetails {
  /** Unique Google Places identifier for this location. */
  place_id: string;
  /** Display name of the place (e.g. "Eiffel Tower"). */
  name: string;
  /** Human-readable full address string. */
  formatted_address: string;
  /** Geographic coordinate data for this place. */
  geometry: {
    /** Latitude/longitude coordinate pair. */
    location: {
      /** Decimal latitude of the place. */
      lat: number;
      /** Decimal longitude of the place. */
      lng: number;
    };
  };
  /**
   * Google Places price level on a 0–4 scale.
   * 0 = Free, 1 = Inexpensive, 2 = Moderate, 3 = Expensive, 4 = Very Expensive.
   * Absent when price information is unavailable.
   */
  price_level?: number;
  /** Average user rating on a scale of 1.0–5.0. Absent when no ratings exist. */
  rating?: number;
  /** List of Google Places type tags describing the place (e.g. ["restaurant", "food"]). */
  types: string[];
  /** Array of photo references that can be resolved via the Places Photo API. */
  photos?: Array<{
    /** Opaque token used to fetch the photo image from the Places Photo API. */
    photo_reference: string;
  }>;
}

/**
 * Parameters accepted by {@link searchPlaces} to query the Google Places Text Search API.
 */
export interface PlaceSearchParams {
  /** Free-text search query (e.g. "coffee shops in Tokyo"). */
  query: string;
  /**
   * Optional geographic center point used to bias search results.
   * Must be paired with a `radius` value to take effect.
   */
  location?: {
    /** Decimal latitude of the bias center. */
    lat: number;
    /** Decimal longitude of the bias center. */
    lng: number;
  };
  /** Search radius in meters when `location` is provided (default: 5000). */
  radius?: number;
  /** Optional Google Places type filter to restrict results (e.g. "museum", "restaurant"). */
  type?: string;
}

/**
 * @description Searches for places using the Google Places Text Search API.
 * Optionally biases results toward a geographic location and radius. Returns an empty array on error.
 * @param {PlaceSearchParams} params - Search parameters for the places query.
 * @param {string} params.query - The text query to search for (e.g. "restaurants in Paris").
 * @param {{ lat: number; lng: number }} [params.location] - Optional center point for geographic bias.
 * @param {number} [params.radius=5000] - Search radius in meters when location is provided.
 * @param {string} [params.type] - Optional Google Places type filter (e.g. "restaurant", "museum").
 * @returns {Promise<PlaceDetails[]>} Array of matching place detail objects.
 */
export async function searchPlaces({
  query,
  location,
  radius = 5000,
  type,
}: PlaceSearchParams): Promise<PlaceDetails[]> {
  try {
    const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/textsearch/json`, {
      params: {
        key: GOOGLE_PLACES_API_KEY,
        query,
        ...(location && {
          location: `${location.lat},${location.lng}`,
          radius,
        }),
        ...(type && { type }),
      },
    });

    return response.data.results || [];
  } catch (error) {
    logger.error({ error }, 'Error searching places');
    return [];
  }
}

/**
 * @description Fetches detailed information for a single place using the Google Places Details API.
 * Returns null when the place is not found or on error.
 * @param {string} placeId - The Google Places place_id for the location.
 * @returns {Promise<PlaceDetails | null>} The place detail object, or null.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  try {
    const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/details/json`, {
      params: {
        key: GOOGLE_PLACES_API_KEY,
        place_id: placeId,
        fields: 'name,formatted_address,geometry,price_level,rating,types,photos',
      },
    });

    return response.data.result || null;
  } catch (error) {
    logger.error({ error }, 'Error fetching place details');
    return null;
  }
}

/**
 * @description Converts a Google Places numeric price_level (0–4) to a human-readable price estimate string.
 * @param {number | undefined} priceLevel - The numeric price level from the Google Places API.
 * @returns {string} A descriptive label such as "Free", "Moderate", or "Price not available".
 */
export function getPriceEstimate(priceLevel: number | undefined): string {
  switch (priceLevel) {
    case 0:
      return 'Free';
    case 1:
      return 'Inexpensive';
    case 2:
      return 'Moderate';
    case 3:
      return 'Expensive';
    case 4:
      return 'Very Expensive';
    default:
      return 'Price not available';
  }
} 