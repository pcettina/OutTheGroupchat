import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { Prisma, TripStatus } from '@prisma/client';
import { logError } from '@/lib/logger';
import { processInvitations } from '@/lib/invitations';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

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
  memberEmails: z.array(z.string().email()).optional().default([]),
  coverImage: z.string().url().optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(apiRateLimiter, session.user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
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
    captureException(error);
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

    const rateLimitResult = await checkRateLimit(apiRateLimiter, session.user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
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

    const { title, description, destination, startDate, endDate, budget, isPublic, memberEmails, coverImage } = validationResult.data;

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
        coverImage: coverImage || undefined,
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

    // Process member invitations if any emails were provided
    let invitationResults = null;
    if (memberEmails.length > 0) {
      invitationResults = await processInvitations({
        tripId: trip.id,
        tripTitle: title,
        emails: memberEmails,
        inviterId: session.user.id,
        inviterName: session.user.name || 'Someone',
      });
    }

    return NextResponse.json(
      { success: true, data: trip, invitations: invitationResults },
      { status: 201 }
    );
  } catch (error) {
    captureException(error);
    logError('TRIPS_POST', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create trip' },
      { status: 500 }
    );
  }
}
