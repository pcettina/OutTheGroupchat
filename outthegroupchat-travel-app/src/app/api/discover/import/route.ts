import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// OpenTripMap API integration
const OPENTRIPMAP_API_KEY = process.env.OPENTRIPMAP_API_KEY || '';
const OPENTRIPMAP_BASE_URL = 'https://api.opentripmap.com/0.1/en/places';

interface OpenTripMapPlace {
  xid: string;
  name: string;
  kinds: string;
  point: { lat: number; lon: number };
  rate?: number;
  osm?: string;
  wikidata?: string;
}

interface OpenTripMapPlaceDetail {
  xid: string;
  name: string;
  kinds: string;
  point: { lat: number; lon: number };
  rate?: number;
  address?: {
    city?: string;
    road?: string;
    house_number?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  wikipedia_extracts?: {
    text?: string;
  };
  preview?: {
    source?: string;
  };
  url?: string;
}

// Map OpenTripMap categories to our categories
function mapCategory(kinds: string): string {
  const kindList = kinds.split(',');
  
  if (kindList.some(k => k.includes('food') || k.includes('restaurant') || k.includes('cafe'))) {
    return 'Food & Dining';
  }
  if (kindList.some(k => k.includes('museum') || k.includes('cultural') || k.includes('historic'))) {
    return 'Culture & History';
  }
  if (kindList.some(k => k.includes('natural') || k.includes('park') || k.includes('beach'))) {
    return 'Nature & Outdoors';
  }
  if (kindList.some(k => k.includes('amusement') || k.includes('theatre') || k.includes('cinema'))) {
    return 'Entertainment';
  }
  if (kindList.some(k => k.includes('sport'))) {
    return 'Sports & Recreation';
  }
  if (kindList.some(k => k.includes('shop'))) {
    return 'Shopping';
  }
  if (kindList.some(k => k.includes('nightclub') || k.includes('bar'))) {
    return 'Nightlife';
  }
  
  return 'Attractions';
}

// Generate search tags from kinds
function generateTags(kinds: string, name: string): string[] {
  const tags = kinds.split(',').map(k => k.trim().toLowerCase());
  // Add name words as tags
  const nameWords = name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return [...new Set([...tags, ...nameWords])];
}

// Import places from OpenTripMap for a location
export async function POST(req: NextRequest) {
  try {
    // Check authentication - only admins can import
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { city, country, latitude, longitude, radius = 10000, limit = 100 } = await req.json();

    if (!latitude || !longitude) {
      return NextResponse.json(
        { error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    if (!OPENTRIPMAP_API_KEY) {
      return NextResponse.json(
        { error: 'OpenTripMap API key not configured' },
        { status: 500 }
      );
    }

    // Fetch places from OpenTripMap
    const placesUrl = `${OPENTRIPMAP_BASE_URL}/radius?radius=${radius}&lon=${longitude}&lat=${latitude}&limit=${limit}&apikey=${OPENTRIPMAP_API_KEY}`;
    
    const placesResponse = await fetch(placesUrl);
    if (!placesResponse.ok) {
      throw new Error('Failed to fetch from OpenTripMap');
    }

    const places: OpenTripMapPlace[] = await placesResponse.json();

    // Filter places with names and good ratings
    const validPlaces = places.filter(p => p.name && p.name.length > 2);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Import each place
    for (const place of validPlaces.slice(0, 50)) { // Limit to 50 per request
      try {
        // Get detailed info
        const detailUrl = `${OPENTRIPMAP_BASE_URL}/xid/${place.xid}?apikey=${OPENTRIPMAP_API_KEY}`;
        const detailResponse = await fetch(detailUrl);
        
        if (!detailResponse.ok) {
          skipped++;
          continue;
        }

        const detail: OpenTripMapPlaceDetail = await detailResponse.json();

        // Upsert the external activity
        await prisma.externalActivity.upsert({
          where: {
            externalId_source: {
              externalId: place.xid,
              source: 'OPENTRIPMAP',
            },
          },
          update: {
            name: detail.name || place.name,
            description: detail.wikipedia_extracts?.text || null,
            category: mapCategory(place.kinds),
            tags: generateTags(place.kinds, place.name),
            latitude: place.point.lat,
            longitude: place.point.lon,
            address: detail.address ? 
              `${detail.address.house_number || ''} ${detail.address.road || ''}, ${detail.address.city || city}`.trim() : 
              null,
            city: detail.address?.city || city,
            country: detail.address?.country || country,
            rating: place.rate ? place.rate / 2 : null, // Convert 0-10 to 0-5
            imageUrl: detail.preview?.source || null,
            websiteUrl: detail.url || null,
            searchText: `${detail.name} ${place.kinds} ${detail.address?.city || city}`,
            lastFetched: new Date(),
          },
          create: {
            externalId: place.xid,
            source: 'OPENTRIPMAP',
            name: detail.name || place.name,
            description: detail.wikipedia_extracts?.text || null,
            category: mapCategory(place.kinds),
            tags: generateTags(place.kinds, place.name),
            latitude: place.point.lat,
            longitude: place.point.lon,
            address: detail.address ? 
              `${detail.address.house_number || ''} ${detail.address.road || ''}, ${detail.address.city || city}`.trim() : 
              null,
            city: detail.address?.city || city,
            country: detail.address?.country || country,
            rating: place.rate ? place.rate / 2 : null,
            imageUrl: detail.preview?.source || null,
            websiteUrl: detail.url || null,
            searchText: `${detail.name} ${place.kinds} ${detail.address?.city || city}`,
            popularity: Math.floor((place.rate || 0) * 10),
          },
        });

        imported++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        skipped++;
        errors.push(`Failed to import ${place.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        imported,
        skipped,
        total: validPlaces.length,
        errors: errors.slice(0, 5), // Return first 5 errors
      },
    });
  } catch (error) {
    console.error('[DISCOVER/IMPORT] Error:', error);
    return NextResponse.json(
      { error: 'Failed to import activities' },
      { status: 500 }
    );
  }
}

