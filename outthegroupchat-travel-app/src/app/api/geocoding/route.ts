import { NextResponse } from 'next/server';
import type { Destination } from '@/types';

// Rate limiting for Nominatim
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100;

// Cache for geocoding results
const cache = new Map<string, { data: Destination[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Nominatim API response type
interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  type: string;
  addresstype: string;
  name: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
  };
}

// Popular destinations fallback
const popularDestinations: Destination[] = [
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
  { city: 'Munich', country: 'Germany', coordinates: { lat: 48.1351, lng: 11.5820 } },
  { city: 'Berlin', country: 'Germany', coordinates: { lat: 52.5200, lng: 13.4050 } },
  { city: 'Sydney', country: 'Australia', coordinates: { lat: -33.8688, lng: 151.2093 } },
  { city: 'Singapore', country: 'Singapore', coordinates: { lat: 1.3521, lng: 103.8198 } },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ 
      success: true, 
      data: popularDestinations.slice(0, 8) 
    });
  }

  const cacheKey = query.toLowerCase();
  
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ success: true, data: cached.data });
  }

  // Check popular destinations first
  const queryLower = query.toLowerCase();
  const popularMatches = popularDestinations.filter(
    dest =>
      dest.city.toLowerCase().includes(queryLower) ||
      dest.country.toLowerCase().includes(queryLower)
  );

  // If we have good matches in popular, return them
  if (popularMatches.length >= 3) {
    return NextResponse.json({ success: true, data: popularMatches });
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
      limit: '8',
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
        const validTypes = ['city', 'town', 'village', 'municipality', 'administrative'];
        return validTypes.includes(result.type) || validTypes.includes(result.addresstype);
      })
      .map(result => ({
        city: result.address.city || result.address.town || result.address.municipality || result.address.village || result.name || 'Unknown',
        country: result.address.country || 'Unknown',
        coordinates: {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        },
      }))
      .filter((dest, index, arr) => 
        arr.findIndex(d => d.city === dest.city && d.country === dest.country) === index
      );

    // Combine with popular matches
    const combined = [...popularMatches];
    for (const result of destinations) {
      const isDuplicate = combined.some(
        d => d.city === result.city && d.country === result.country
      );
      if (!isDuplicate) {
        combined.push(result);
      }
    }

    const finalResults = combined.slice(0, 8);

    // Cache results
    cache.set(cacheKey, { data: finalResults, timestamp: Date.now() });

    return NextResponse.json({ success: true, data: finalResults });
  } catch (error) {
    console.error('Geocoding error:', error);
    // Return popular matches as fallback
    return NextResponse.json({ 
      success: true, 
      data: popularMatches.length > 0 ? popularMatches : popularDestinations.slice(0, 8) 
    });
  }
}
