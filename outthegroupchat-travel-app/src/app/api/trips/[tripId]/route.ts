import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

// Validation schema for trip updates
const updateTripSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  destination: z.object({
    city: z.string(),
    country: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    timezone: z.string().optional(),
  }).optional(),
  startDate: z.string().transform((str) => new Date(str)).optional(),
  endDate: z.string().transform((str) => new Date(str)).optional(),
  budget: z.object({
    total: z.number().optional(),
    currency: z.string(),
    breakdown: z.object({
      accommodation: z.number(),
      food: z.number(),
      activities: z.number(),
      transport: z.number(),
    }).optional(),
  }).optional(),
  status: z.enum(['PLANNING', 'INVITING', 'SURVEYING', 'VOTING', 'BOOKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  isPublic: z.boolean().optional(),
});

async function isTripMember(tripId: string, userId: string): Promise<boolean> {
  const membership = await prisma.tripMember.findFirst({
    where: {
      tripId,
      userId,
    },
  });
  return !!membership;
}

async function isTripOwner(tripId: string, userId: string): Promise<boolean> {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      ownerId: userId,
    },
  });
  return !!trip;
}

export async function GET(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                city: true,
              },
            },
          },
        },
        activities: {
          orderBy: { date: 'asc' },
          include: {
            _count: {
              select: {
                comments: true,
                ratings: true,
                savedBy: true,
              },
            },
          },
        },
        survey: {
          include: {
            _count: {
              select: {
                responses: true,
              },
            },
          },
        },
        itinerary: {
          orderBy: { dayNumber: 'asc' },
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: {
                activity: true,
              },
            },
          },
        },
        invitations: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            activities: true,
          },
        },
      },
    });

    if (!trip) {
      return NextResponse.json(
        { success: false, error: 'Trip not found' },
        { status: 404 }
      );
    }

    // Check access
    const hasAccess = 
      trip.isPublic || 
      (session?.user?.id && (
        trip.ownerId === session.user.id ||
        trip.members.some(m => m.userId === session.user.id)
      ));

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Increment view count for public trips
    if (trip.isPublic && session?.user?.id !== trip.ownerId) {
      await prisma.trip.update({
        where: { id: tripId },
        data: { viewCount: { increment: 1 } },
      });
    }

    return NextResponse.json({ success: true, data: trip });
  } catch (error) {
    console.error('[TRIP_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trip' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
        { success: false, error: 'Not authorized to edit this trip' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validationResult = updateTripSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    const trip = await prisma.trip.update({
      where: { id: tripId },
      data: {
        ...(updateData.title && { title: updateData.title }),
        ...(updateData.description !== undefined && { description: updateData.description }),
        ...(updateData.destination && { destination: updateData.destination as any }),
        ...(updateData.startDate && { startDate: updateData.startDate }),
        ...(updateData.endDate && { endDate: updateData.endDate }),
        ...(updateData.budget && { budget: updateData.budget as any }),
        ...(updateData.status && { status: updateData.status }),
        ...(updateData.isPublic !== undefined && { isPublic: updateData.isPublic }),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: trip });
  } catch (error) {
    console.error('[TRIP_PATCH]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update trip' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { tripId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only owner can delete
    const isOwner = await isTripOwner(tripId, session.user.id);
    if (!isOwner) {
      return NextResponse.json(
        { success: false, error: 'Only the trip owner can delete this trip' },
        { status: 403 }
      );
    }

    await prisma.trip.delete({
      where: { id: tripId },
    });

    return NextResponse.json({ success: true, message: 'Trip deleted successfully' });
  } catch (error) {
    console.error('[TRIP_DELETE]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete trip' },
      { status: 500 }
    );
  }
}

