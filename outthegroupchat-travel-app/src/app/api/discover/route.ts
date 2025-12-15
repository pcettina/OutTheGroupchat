import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { EventsService } from '@/services/events.service';
import { z } from 'zod';

const searchSchema = z.object({
  city: z.string().min(1),
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  type: z.enum(['events', 'places', 'restaurants', 'attractions', 'nightlife', 'all']).default('all'),
  categories: z.array(z.string()).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    
    const params = {
      city: searchParams.get('city') || '',
      startDate: searchParams.get('startDate') || new Date().toISOString(),
      endDate: searchParams.get('endDate') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      type: searchParams.get('type') || 'all',
      categories: searchParams.get('categories')?.split(','),
    };

    const validationResult = searchSchema.safeParse(params);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { city, startDate, endDate, type, categories } = validationResult.data;

    let data: any = {};

    switch (type) {
      case 'events':
        data.events = await EventsService.searchEvents({ city, startDate, endDate, categories });
        break;
      case 'places':
        data.places = await EventsService.searchPlaces({ city, type: 'all' });
        break;
      case 'restaurants':
        data.restaurants = await EventsService.searchPlaces({ city, type: 'restaurant' });
        break;
      case 'attractions':
        data.attractions = await EventsService.searchPlaces({ city, type: 'attraction' });
        break;
      case 'nightlife':
        data.nightlife = await EventsService.searchPlaces({ city, type: 'bar' });
        break;
      case 'all':
      default:
        data = await EventsService.getDestinationInfo(city, startDate, endDate);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[DISCOVER_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch discovery data' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { origin, destination, departureDate, returnDate, adults = 1 } = body;

    if (!origin || !destination || !departureDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const flights = await EventsService.searchFlights({
      origin,
      destination,
      departureDate: new Date(departureDate),
      returnDate: returnDate ? new Date(returnDate) : undefined,
      adults,
    });

    return NextResponse.json({ success: true, data: flights });
  } catch (error) {
    console.error('[DISCOVER_FLIGHTS_POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search flights' },
      { status: 500 }
    );
  }
}

