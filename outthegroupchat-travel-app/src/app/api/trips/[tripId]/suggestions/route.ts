import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { searchEvents } from '@/lib/api/ticketmaster';
import { searchPlaces } from '@/lib/api/places';
import { calculateDailyCosts } from '@/lib/utils/costs';

export async function GET(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const trip = await prisma.trip.findUnique({
      where: {
        id: params.tripId,
      },
      include: {
        members: true,
      },
    });

    if (!trip) {
      return new NextResponse('Trip not found', { status: 404 });
    }

    // Check if user is authorized to view this trip
    if (
      trip.ownerId !== session.user.id &&
      !trip.members.some((member) => member.id === session.user.id)
    ) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Format dates for API calls
    const startDate = new Date(trip.startDate);
    const endDate = new Date(trip.endDate);
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];

    // Get destination city from trip
    const destination = trip.destination as { city?: string; country?: string } | null;
    const cityName = destination?.city || 'Unknown';

    // Fetch events and places in parallel
    const [events, attractions, restaurants] = await Promise.all([
      searchEvents({
        city: cityName,
        startDateTime: formattedStartDate,
        endDateTime: formattedEndDate,
      }),
      searchPlaces({
        query: `attractions in ${cityName}`,
        type: 'tourist_attraction',
      }),
      searchPlaces({
        query: `restaurants in ${cityName}`,
        type: 'restaurant',
      }),
    ]);

    // Calculate daily costs
    const dailyCosts = calculateDailyCosts('moderate');

    return NextResponse.json({
      trip,
      suggestions: {
        events,
        attractions,
        restaurants,
      },
      costs: {
        daily: dailyCosts,
        total: dailyCosts.total * Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
    });
  } catch (error) {
    console.error('[TRIP_SUGGESTIONS]', error);
    return new NextResponse('Internal error', { status: 500 });
  }
} 