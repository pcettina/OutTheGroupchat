import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { searchFlights, getAirportCode } from '@/lib/api/flights';
import { logger } from '@/lib/logger';

const paramsSchema = z.object({
  tripId: z.string().cuid(),
});

export async function GET(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { tripId } = parsed.data;

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const trip = await prisma.trip.findUnique({
      where: {
        id: tripId,
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
      !trip.members.some((member) => member.userId === session.user.id)
    ) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get the origin city from the user's profile or a default
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { city: true },
    });

    const originCity = user?.city || 'New York'; // Default to New York if no city is set
    const destination = trip.destination as { city?: string; country?: string } | null;
    const destinationCity = destination?.city || 'Unknown';

    // Get airport codes for origin and destination cities
    const [originCode, destinationCode] = await Promise.all([
      getAirportCode(originCity),
      getAirportCode(destinationCity),
    ]);

    if (!originCode || !destinationCode) {
      return new NextResponse('Could not find airport codes for the cities', {
        status: 400,
      });
    }

    // Search for flights
    const flights = await searchFlights({
      originLocationCode: originCode,
      destinationLocationCode: destinationCode,
      departureDate: trip.startDate.toISOString().split('T')[0],
      returnDate: trip.endDate.toISOString().split('T')[0],
      adults: trip.members.length || 1,
      nonStop: true,
      max: 5,
    });

    return NextResponse.json({
      flights,
      origin: {
        city: originCity,
        code: originCode,
      },
      destination: {
        city: destinationCity,
        code: destinationCode,
      },
    });
  } catch (error) {
    logger.error({ error }, '[FLIGHT_SUGGESTIONS] Internal error');
    return new NextResponse('Internal error', { status: 500 });
  }
} 