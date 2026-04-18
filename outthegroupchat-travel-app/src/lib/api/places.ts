import axios from 'axios';
import { logger } from '@/lib/logger';
import { VenueCategory, type VenueSearchResult } from '@/types/meetup';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  price_level?: number;
  rating?: number;
  types: string[];
  photos?: Array<{
    photo_reference: string;
  }>;
}

export interface PlaceSearchParams {
  query: string;
  location?: {
    lat: number;
    lng: number;
  };
  radius?: number;
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

/**
 * @description Infers a project VenueCategory from Google Places `types` array.
 * Falls through to OTHER when no type matches (Google has no "coworking" type).
 * @param {string[]} types - The types array from a PlaceDetails result.
 * @returns {VenueCategory} The inferred project VenueCategory enum value.
 */
export function inferVenueCategory(types: string[]): VenueCategory {
  if (types.includes('bar') || types.includes('night_club')) return VenueCategory.BAR;
  if (types.includes('cafe') || types.includes('coffee_shop')) return VenueCategory.COFFEE;
  if (types.includes('restaurant') || types.includes('food')) return VenueCategory.RESTAURANT;
  if (types.includes('park')) return VenueCategory.PARK;
  if (types.includes('gym')) return VenueCategory.GYM;
  return VenueCategory.OTHER;
}

/**
 * @description Best-effort extraction of city and country from a Google Places
 * `formatted_address` string. Returns `{ city, country }` with `'Unknown'` fallbacks.
 * Strategy: split on commas, take the last segment as country and the second-to-last
 * segment as city (stripping trailing postal codes / state abbreviations).
 * @param {string} address - The `formatted_address` value from PlaceDetails.
 * @returns {{ city: string; country: string }} Parsed locale hints.
 */
export function parseAddressLocale(address: string): { city: string; country: string } {
  if (!address) return { city: 'Unknown', country: 'Unknown' };

  const parts = address
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length === 0) return { city: 'Unknown', country: 'Unknown' };
  if (parts.length === 1) return { city: 'Unknown', country: parts[0] };

  const country = parts[parts.length - 1];
  // Second-to-last segment: may be "City" or "City 12345" or "State 12345".
  // Strip a trailing postal code token if present.
  const rawCity = parts[parts.length - 2];
  const city = rawCity.replace(/\s+\d{3,}.*$/, '').trim() || 'Unknown';

  return { city: city.length > 0 ? city : 'Unknown', country };
}

/**
 * @description Builds a Google Places Photo URL from a photo_reference, or null
 * when no photo exists or the API key is not configured.
 * @param {string | undefined} photoReference - The first photo_reference from a PlaceDetails result.
 * @param {number} [maxWidth=400] - Max width in pixels for the served image.
 * @returns {string | null} The Places Photo endpoint URL, or null.
 */
export function buildPlacePhotoUrl(
  photoReference: string | undefined,
  maxWidth = 400
): string | null {
  if (!photoReference || !GOOGLE_PLACES_API_KEY) return null;
  return `${GOOGLE_PLACES_BASE_URL}/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(
    photoReference
  )}&key=${GOOGLE_PLACES_API_KEY}`;
}

/**
 * @description Maps a Google PlaceDetails object to the project's Venue search
 * result shape. The caller can pass a `cityHint` (e.g. a user-supplied `?city=`
 * filter) which takes precedence over address parsing when present.
 * @param {PlaceDetails} place - A Google Places Text Search result entry.
 * @param {{ cityHint?: string }} [options] - Optional overrides (city hint).
 * @returns {VenueSearchResult & { source: string; externalId: string }} The
 * mapped venue with extra `source` / `externalId` fields for DB upsert.
 */
export function mapPlaceToVenue(
  place: PlaceDetails,
  options: { cityHint?: string } = {}
): VenueSearchResult & { source: string; externalId: string } {
  const { city: parsedCity, country } = parseAddressLocale(place.formatted_address);
  const city = options.cityHint && options.cityHint.trim().length > 0
    ? options.cityHint.trim()
    : parsedCity;

  const imageUrl = buildPlacePhotoUrl(place.photos?.[0]?.photo_reference);

  return {
    // `id` will be replaced with the DB id after upsert. Until then we surface
    // the Google place_id prefixed so callers can still distinguish results.
    id: `gp_${place.place_id}`,
    name: place.name,
    address: place.formatted_address || null,
    city,
    country,
    category: inferVenueCategory(place.types ?? []),
    latitude: place.geometry?.location?.lat ?? null,
    longitude: place.geometry?.location?.lng ?? null,
    imageUrl,
    source: 'google_places',
    externalId: place.place_id,
  };
}
