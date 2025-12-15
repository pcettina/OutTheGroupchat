import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  preferences: z.object({
    travelStyle: z.enum(['adventure', 'relaxation', 'cultural', 'family', 'solo']).optional(),
    interests: z.array(z.string()).optional(),
    budgetRange: z.object({
      min: z.number(),
      max: z.number(),
      currency: z.string(),
    }).optional(),
    currency: z.string().optional(),
    language: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
});

// Get current user profile
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
        city: true,
        phone: true,
        preferences: true,
        createdAt: true,
        lastActive: true,
        _count: {
          select: {
            followers: true,
            following: true,
            ownedTrips: true,
            tripMemberships: true,
            savedActivities: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get recent trips
    const recentTrips = await prisma.trip.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } },
        ],
      },
      select: {
        id: true,
        title: true,
        destination: true,
        startDate: true,
        endDate: true,
        status: true,
      },
      orderBy: { startDate: 'desc' },
      take: 5,
    });

    // Get saved activities
    const savedActivities = await prisma.savedActivity.findMany({
      where: { userId: session.user.id },
      include: {
        activity: {
          select: {
            id: true,
            name: true,
            category: true,
            location: true,
            cost: true,
          },
        },
      },
      orderBy: { savedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        recentTrips,
        savedActivities: savedActivities.map(s => s.activity),
      },
    });
  } catch (error) {
    console.error('[USER_ME_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

// Update current user profile
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validationResult = updateProfileSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { name, bio, city, phone, preferences } = validationResult.data;

    // Get current preferences to merge
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferences: true },
    });

    const mergedPreferences = preferences
      ? { ...(currentUser?.preferences as object || {}), ...preferences }
      : undefined;

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(name && { name }),
        ...(bio !== undefined && { bio }),
        ...(city !== undefined && { city }),
        ...(phone !== undefined && { phone }),
        ...(mergedPreferences && { preferences: mergedPreferences }),
        lastActive: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
        city: true,
        phone: true,
        preferences: true,
      },
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('[USER_ME_PATCH]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

