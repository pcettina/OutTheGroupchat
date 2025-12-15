import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const itineraryItemSchema = z.object({
  order: z.number(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  activityId: z.string().optional(),
  customTitle: z.string().optional(),
  notes: z.string().optional(),
});

const itineraryDaySchema = z.object({
  dayNumber: z.number(),
  date: z.string().transform(str => new Date(str)),
  notes: z.string().optional(),
  items: z.array(itineraryItemSchema),
});

const updateItinerarySchema = z.object({
  days: z.array(itineraryDaySchema),
});

// Get trip itinerary
export async function GET(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    // Check access
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { isPublic: true, ownerId: true },
    });

    if (!trip) {
      return NextResponse.json(
        { success: false, error: 'Trip not found' },
        { status: 404 }
      );
    }

    const hasAccess = trip.isPublic || (session?.user?.id && (
      trip.ownerId === session.user.id ||
      await prisma.tripMember.findFirst({
        where: { tripId, userId: session.user.id },
      })
    ));

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const itinerary = await prisma.itineraryDay.findMany({
      where: { tripId },
      include: {
        items: {
          include: {
            activity: {
              include: {
                _count: {
                  select: {
                    comments: true,
                    ratings: true,
                  },
                },
              },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { dayNumber: 'asc' },
    });

    return NextResponse.json({ success: true, data: itinerary });
  } catch (error) {
    console.error('[ITINERARY_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch itinerary' },
      { status: 500 }
    );
  }
}

// Update trip itinerary
export async function PUT(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is owner or admin
    const membership = await prisma.tripMember.findFirst({
      where: {
        tripId,
        userId: session.user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to edit itinerary' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validationResult = updateItinerarySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { days } = validationResult.data;

    // Delete existing itinerary
    await prisma.itineraryItem.deleteMany({
      where: {
        itineraryDay: { tripId },
      },
    });
    await prisma.itineraryDay.deleteMany({
      where: { tripId },
    });

    // Create new itinerary
    for (const day of days) {
      const itineraryDay = await prisma.itineraryDay.create({
        data: {
          tripId,
          dayNumber: day.dayNumber,
          date: day.date,
          notes: day.notes,
        },
      });

      if (day.items.length > 0) {
        await prisma.itineraryItem.createMany({
          data: day.items.map(item => ({
            itineraryDayId: itineraryDay.id,
            order: item.order,
            startTime: item.startTime,
            endTime: item.endTime,
            activityId: item.activityId,
            customTitle: item.customTitle,
            notes: item.notes,
          })),
        });
      }
    }

    // Fetch updated itinerary
    const itinerary = await prisma.itineraryDay.findMany({
      where: { tripId },
      include: {
        items: {
          include: { activity: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { dayNumber: 'asc' },
    });

    return NextResponse.json({ success: true, data: itinerary });
  } catch (error) {
    console.error('[ITINERARY_PUT]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update itinerary' },
      { status: 500 }
    );
  }
}

