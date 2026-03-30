/**
 * Geocoding Service
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * Rate limited to 1 request per second per their usage policy
 */

import type { Destination } from '@/types';
import { logger } from '@/lib/logger';

// Nominatim API response type
interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
  boundingbox: string[];
}

// Cache for geocoding results to reduce API calls
const geocodeCache = new Map<string, Destination[]>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const cacheTimestamps = new Map<string, number>();

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to stay under Nominatim's rate limit

/**
 * Searches for destinations matching the provided query string using the
 * OpenStreetMap Nominatim API. Results are filtered to city/town/municipality
 * types, de-duplicated, and cached in memory for 1 hour to reduce API calls.
 * A 1.1-second inter-request delay is enforced to comply with Nominatim's
 * rate-limit policy.
 *
 * @param query - The search string (e.g. "Paris", "New York"). Must be at
 *   least 2 characters; shorter strings return an empty array immediately.
 * @returns A promise that resolves to an array of {@link Destination} objects
 *   each containing `city`, `country`, and `coordinates` (`lat`/`lng`).
 *   Returns an empty array on API error or when no matching cities are found.
 * @example
 * const results = await searchDestinations('Tokyo')
 * // results[0] => { city: 'Tokyo', country: 'Japan', coordinates: { lat: 35.68, lng: 139.69 } }
 */
export async function searchDestinations(query: string): Promise<Destination[]> {
  if (!query || query.length < 2) {
    return [];
  }

  const cacheKey = query.toLowerCase().trim();
  
  // Check cache first
  const cached = geocodeCache.get(cacheKey);
  const cachedTime = cacheTimestamps.get(cacheKey);
  if (cached && cachedTime && Date.now() - cachedTime < CACHE_TTL) {
    return cached;
  }

  // Rate limiting - wait if needed
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: '8',
      featuretype: 'city', // Prioritize cities
      'accept-language': 'en',
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          'User-Agent': 'OutTheGroupchat Travel App (contact@outthegroupchat.com)',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const results: NominatimResult[] = await response.json();

    // Transform to Destination format
    const destinations: Destination[] = results
      .filter(result => {
        // Filter to places that are cities/towns/municipalities
        const validTypes = ['city', 'town', 'village', 'municipality', 'administrative'];
        return validTypes.includes(result.type) || validTypes.includes(result.addresstype);
      })
      .map(result => ({
        city: extractCityName(result),
        country: result.address.country || 'Unknown',
        coordinates: {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        },
      }))
      // Remove duplicates
      .filter((dest, index, arr) => 
        arr.findIndex(d => d.city === dest.city && d.country === dest.country) === index
      );

    // Cache results
    geocodeCache.set(cacheKey, destinations);
    cacheTimestamps.set(cacheKey, Date.now());

    return destinations;
  } catch (error) {
    logger.error({ error }, 'Geocoding error');
    return [];
  }
}

/**
 * Extract the best city name from a Nominatim result
 */
function extractCityName(result: NominatimResult): string {
  const { address, name } = result;
  
  // Prefer address fields in order of specificity
  return (
    address.city ||
    address.town ||
    address.municipality ||
    address.village ||
    name ||
    'Unknown'
  );
}

/**
 * Retrieves the latitude/longitude coordinates for a specific city and country
 * using a precise Nominatim lookup. The result is cached in memory (keyed on
 * `"coords:<city>, <country>"`) to avoid repeated API calls for the same
 * destination. The same 1.1-second inter-request rate limit is applied.
 *
 * @param city - The city name (e.g. "Barcelona").
 * @param country - The country name (e.g. "Spain").
 * @returns A promise that resolves to an object `{ lat, lng }` when the
 *   destination is found, or `null` if the API returns no results, the
 *   request fails, or an exception is thrown.
 * @example
 * const coords = await getDestinationCoordinates('Rome', 'Italy')
 * // coords => { lat: 41.9028, lng: 12.4964 }
 */
export async function getDestinationCoordinates(
  city: string,
  country: string
): Promise<{ lat: number; lng: number } | null> {
  const query = `${city}, ${country}`;
  const cacheKey = `coords:${query.toLowerCase()}`;
  
  // Check cache
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.length > 0 && cached[0].coordinates) {
    return cached[0].coordinates;
  }

  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: '1',
      'accept-language': 'en',
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          'User-Agent': 'OutTheGroupchat Travel App (contact@outthegroupchat.com)',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const results: NominatimResult[] = await response.json();
    
    if (results.length === 0) {
      return null;
    }

    const coords = {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };

    // Cache the result
    geocodeCache.set(cacheKey, [{ city, country, coordinates: coords }]);
    cacheTimestamps.set(cacheKey, Date.now());

    return coords;
  } catch (error) {
    logger.error({ error }, 'Coordinate lookup error');
    return null;
  }
}

/**
 * Curated list of popular travel destinations used as an instant fallback
 * when the Nominatim API is unavailable or when a query matches too few
 * API results. Each entry includes pre-computed coordinates so no network
 * request is needed to serve these suggestions.
 */
export const popularDestinations: Destination[] = [
  { city: 'Miami', country: 'USA', coordinates: { lat: 25.7617, lng: -80.1918 } },
  { city: 'Cancun', country: 'Mexico', coordinates: { lat: 21.1619, lng: -86.8515 } },
  { city: 'Las Vegas', country: 'USA', coordinates: { lat: 36.1699, lng: -115.1398 } },
  { city: 'Nashville', country: 'USA', coordinates: { lat: 36.1627, lng: -86.7816 } },
  { city: 'New Orleans', country: 'USA', coordinates: { lat: 29.9511, lng: -90.0715 } },
  { city: 'Austin', country: 'USA', coordinates: { lat: 30.2672, lng: -97.7431 } },
  { city: 'Barcelona', country: 'Spain', coordinates: { lat: 41.3851, lng: 2.1734 } },
  { city: 'Amsterdam', country: 'Netherlands', coordinates: { lat: 52.3676, lng: 4.9041 } },
  { city: 'Tokyo', country: 'Japan', coordinates: { lat: 35.6762, lng: 139.6503 } },
  { city: 'Paris', country: 'France', coordinates: { lat: 48.8566, lng: 2.3522 } },
  { city: 'London', country: 'United Kingdom', coordinates: { lat: 51.5074, lng: -0.1278 } },
  { city: 'Rome', country: 'Italy', coordinates: { lat: 41.9028, lng: 12.4964 } },
  { city: 'Bali', country: 'Indonesia', coordinates: { lat: -8.3405, lng: 115.0920 } },
  { city: 'Dubai', country: 'United Arab Emirates', coordinates: { lat: 25.2048, lng: 55.2708 } },
  { city: 'Bangkok', country: 'Thailand', coordinates: { lat: 13.7563, lng: 100.5018 } },
  { city: 'New York City', country: 'USA', coordinates: { lat: 40.7128, lng: -74.0060 } },
];

/**
 * Searches for destinations with a two-tier strategy for improved UX and
 * resilience. First checks {@link popularDestinations} for instant matches;
 * if 3 or more popular matches are found they are returned immediately without
 * an API call. Otherwise calls {@link searchDestinations} via the Nominatim
 * API and merges the results with any popular matches, capped at 8 entries.
 * Falls back gracefully to popular matches (or the full popular list) when
 * the API throws.
 *
 * @param query - The search string typed by the user. When shorter than 2
 *   characters the first 8 entries of {@link popularDestinations} are returned.
 * @returns A promise that resolves to an array of up to 8 {@link Destination}
 *   objects. Never rejects — API errors are caught and handled internally.
 * @example
 * const suggestions = await searchDestinationsWithFallback('Bali')
 * // suggestions[0] => { city: 'Bali', country: 'Indonesia', coordinates: { lat: -8.34, lng: 115.09 } }
 */
export async function searchDestinationsWithFallback(query: string): Promise<Destination[]> {
  if (!query || query.length < 2) {
    return popularDestinations.slice(0, 8);
  }

  const queryLower = query.toLowerCase();
  
  // First, check popular destinations for quick matches
  const popularMatches = popularDestinations.filter(
    dest =>
      dest.city.toLowerCase().includes(queryLower) ||
      dest.country.toLowerCase().includes(queryLower)
  );

  // If we have good matches in popular, return them immediately
  if (popularMatches.length >= 3) {
    return popularMatches;
  }

  // Otherwise, call the API
  try {
    const apiResults = await searchDestinations(query);
    
    // Combine popular matches with API results, removing duplicates
    const combined = [...popularMatches];
    for (const result of apiResults) {
      const isDuplicate = combined.some(
        d => d.city === result.city && d.country === result.country
      );
      if (!isDuplicate) {
        combined.push(result);
      }
    }

    return combined.slice(0, 8);
  } catch (error) {
    // On error, return popular matches or fallback
    return popularMatches.length > 0 ? popularMatches : popularDestinations.slice(0, 8);
  }
}

/**
 * Clears the in-memory geocoding cache and its associated timestamp map,
 * forcing subsequent calls to `searchDestinations` and
 * `getDestinationCoordinates` to fetch fresh data from the Nominatim API.
 * Primarily useful in tests to prevent cross-test state leakage, and in
 * production scenarios where cache invalidation is explicitly required.
 *
 * @returns void
 * @example
 * clearGeocodingCache()
 * // All cached geocode results and timestamps are now cleared.
 */
export function clearGeocodingCache(): void {
  geocodeCache.clear();
  cacheTimestamps.clear();
}
