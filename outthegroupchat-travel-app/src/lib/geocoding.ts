/**
 * Geocoding Service
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * Rate limited to 1 request per second per their usage policy
 */

import type { Destination } from '@/types';

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
 * Search for destinations matching a query
 * Uses OpenStreetMap Nominatim API
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
    console.error('Geocoding error:', error);
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
 * Get coordinates for a specific destination
 * Uses a more precise lookup
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
    console.error('Coordinate lookup error:', error);
    return null;
  }
}

/**
 * Popular destinations fallback
 * Used when API fails or for quick suggestions
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
 * Search with fallback to popular destinations
 * Combines API results with popular destinations for better UX
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
 * Clear the geocoding cache
 * Useful for testing or when cache gets stale
 */
export function clearGeocodingCache(): void {
  geocodeCache.clear();
  cacheTimestamps.clear();
}
