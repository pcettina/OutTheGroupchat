import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

const createActivitySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum([
    'FOOD', 'CULTURE', 'SHOPPING', 'NATURE', 'ENTERTAINMENT',
    'SPORTS', 'NIGHTLIFE', 'TRANSPORTATION', 'ACCOMMODATION', 'OTHER'
  ]),
  location: z.object({
    address: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    placeId: z.string().optional(),
    nearestTransit: z.array(z.object({
      type: z.enum(['train', 'bus', 'subway']),
      name: z.string(),
      distance: z.number(),
      directions: z.string().optional(),
    })).optional(),
  }).optional(),
  date: z.string().transform(str => new Date(str)).optional(),
  startTime: z.string().transform(str => new Date(str)).optional(),
  endTime: z.string().transform(str => new Date(str)).optional(),
  duration: z.number().optional(),
  cost: z.number().optional(),
  currency: z.string().default('USD'),
  priceRange: z.enum(['FREE', 'BUDGET', 'MODERATE', 'EXPENSIVE', 'LUXURY']).optional(),
  costDetails: z.object({
    basePrice: z.number(),
    currency: z.string(),
    includedItems: z.array(z.string()).optional(),
    additionalCosts: z.array(z.object({
      item: z.string(),
      cost: z.number(),
    })).optional(),
  }).optional(),
  bookingStatus: z.enum(['NOT_NEEDED', 'RECOMMENDED', 'REQUIRED', 'BOOKED', 'CONFIRMED']).optional(),
  bookingUrl: z.string().url().optional(),
  requirements: z.object({
    minimumAge: z.number().optional(),
    physicalLevel: z.enum(['easy', 'moderate', 'challenging']).optional(),
    requiredItems: z.array(z.string()).optional(),
    recommendedItems: z.array(z.string()).optional(),
    accessibility: z.object({
      wheelchairAccessible: z.boolean(),
      familyFriendly: z.boolean(),
      petFriendly: z.boolean(),
    }).optional(),
  }).optional(),
  externalLinks: z.object({
    websiteUrl: z.string().url().optional(),
    bookingUrl: z.string().url().optional(),
    ticketmasterUrl: z.string().url().optional(),
    googleMapsUrl: z.string().url().optional(),
  }).optional(),
  isPublic: z.boolean().default(false),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = await params;
    const { searchParams } = new URL(req.url);
    
    const category = searchParams.get('category');
    const status = searchParams.get('status');

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

    const activities = await prisma.activity.findMany({
      where: {
        tripId,
        ...(category ? { category: category as any } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: {
        _count: {
          select: {
            comments: true,
            ratings: true,
            savedBy: true,
          },
        },
      },
      orderBy: [
        { date: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Calculate average ratings
    const activitiesWithRatings = await Promise.all(
      activities.map(async (activity) => {
        const ratings = await prisma.activityRating.aggregate({
          where: { activityId: activity.id },
          _avg: { score: true },
        });
        return {
          ...activity,
          averageRating: ratings._avg.score,
        };
      })
    );

    return NextResponse.json({ success: true, data: activitiesWithRatings });
  } catch (error) {
    console.error('[ACTIVITIES_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { tripId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is owner or member
    const [trip, isMember] = await Promise.all([
      prisma.trip.findUnique({
        where: { id: tripId },
        select: { ownerId: true },
      }),
      prisma.tripMember.findFirst({
        where: { tripId, userId: session.user.id },
      }),
    ]);

    if (!trip) {
      return NextResponse.json(
        { success: false, error: 'Trip not found' },
        { status: 404 }
      );
    }

    const isOwner = trip.ownerId === session.user.id;
    if (!isOwner && !isMember) {
      return NextResponse.json(
        { success: false, error: 'Not a member of this trip' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validationResult = createActivitySchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const activity = await prisma.activity.create({
      data: {
        tripId,
        name: data.name,
        description: data.description,
        category: data.category,
        status: 'SUGGESTED',
        location: data.location as any,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        cost: data.cost,
        currency: data.currency,
        priceRange: data.priceRange,
        costDetails: data.costDetails as any,
        bookingStatus: data.bookingStatus || 'NOT_NEEDED',
        bookingUrl: data.bookingUrl,
        requirements: data.requirements as any,
        externalLinks: data.externalLinks as any,
        isPublic: data.isPublic,
      },
      include: {
        _count: {
          select: {
            comments: true,
            ratings: true,
            savedBy: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: activity }, { status: 201 });
  } catch (error) {
    console.error('[ACTIVITIES_POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create activity' },
      { status: 500 }
    );
  }
}

