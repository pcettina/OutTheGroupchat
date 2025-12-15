import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { Prisma, TripStatus } from '@prisma/client';
import { logError } from '@/lib/logger';

// Route segment config - limit request body size to prevent memory exhaustion
export const maxDuration = 30; // seconds
export const dynamic = 'force-dynamic';

// Validation schema for trip creation
const createTripSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  destination: z.object({
    city: z.string().min(1),
    country: z.string().min(1),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    timezone: z.string().optional(),
  }),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  budget: z.object({
    total: z.number().optional(),
    currency: z.string().default('USD'),
    breakdown: z.object({
      accommodation: z.number(),
      food: z.number(),
      activities: z.number(),
      transport: z.number(),
    }).optional(),
  }).optional(),
  isPublic: z.boolean().default(false),
});

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const includePublic = searchParams.get('public') === 'true';

    // Validate status if provided
    const validatedStatus = status && Object.values(TripStatus).includes(status as TripStatus) 
      ? (status as TripStatus) 
      : undefined;

    const trips = await prisma.trip.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } },
          ...(includePublic ? [{ isPublic: true }] : []),
        ],
        ...(validatedStatus ? { status: validatedStatus } : {}),
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
        _count: {
          select: {
            members: true,
            activities: true,
          },
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return NextResponse.json({ success: true, data: trips });
  } catch (error) {
    logError('TRIPS_GET', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trips' },
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
    
    // Validate request body
    const validationResult = createTripSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation failed', 
          details: validationResult.error.flatten() 
        },
        { status: 400 }
      );
    }

    const { title, description, destination, startDate, endDate, budget, isPublic } = validationResult.data;

    // Create trip with owner as first member
    // Use Prisma.InputJsonValue for proper type safety with JSON fields
    const trip = await prisma.trip.create({
      data: {
        title,
        description,
        destination: destination as Prisma.InputJsonValue,
        startDate,
        endDate,
        budget: budget as Prisma.InputJsonValue,
        isPublic,
        ownerId: session.user.id,
        status: 'PLANNING',
        members: {
          create: {
            userId: session.user.id,
            role: 'OWNER',
          },
        },
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

    return NextResponse.json({ success: true, data: trip }, { status: 201 });
  } catch (error) {
    logError('TRIPS_POST', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create trip' },
      { status: 500 }
    );
  }
}
