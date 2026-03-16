import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { z } from 'zod';
import type { JsonValue } from '@prisma/client/runtime/library';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

const searchQuerySchema = z.object({
  q: z.string().max(200).default(''),
  type: z.enum(['all', 'trips', 'activities', 'users']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Global search across trips, activities, and users
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parseResult = searchQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { q: rawQuery, type, limit } = parseResult.data;
    const query = rawQuery.toLowerCase();

    if (!query || query.length < 2) {
      return NextResponse.json({
        success: true,
        data: { trips: [], activities: [], users: [] },
      });
    }

    type TripResult = {
      id: string;
      title: string;
      description: string | null;
      destination: JsonValue;
      startDate: Date | null;
      endDate: Date | null;
      status: string;
      isPublic: boolean;
      owner: { id: string; name: string | null; image: string | null };
      _count: { members: number };
    };

    type ActivityResult = {
      id: string;
      name: string;
      description: string | null;
      category: string;
      location: JsonValue;
      cost: number | null;
      priceRange: string | null;
      trip: { id: string; title: string; destination: JsonValue };
      _count: { savedBy: number; ratings: number };
    };

    type UserResult = {
      id: string;
      name: string | null;
      image: string | null;
      city: string | null;
      bio: string | null;
      _count: { followers: number; ownedTrips: number };
    };

    const results: {
      trips?: TripResult[];
      activities?: ActivityResult[];
      users?: UserResult[];
    } = {};

    // Search trips
    if (type === 'all' || type === 'trips') {
      const trips = await prisma.trip.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          AND: {
            OR: [
              { isPublic: true },
              { ownerId: session.user.id },
              { members: { some: { userId: session.user.id } } },
            ],
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          destination: true,
          startDate: true,
          endDate: true,
          status: true,
          isPublic: true,
          owner: {
            select: { id: true, name: true, image: true },
          },
          _count: {
            select: { members: true },
          },
        },
        take: limit,
      });
      results.trips = trips;
    }

    // Search activities
    if (type === 'all' || type === 'activities') {
      const activities = await prisma.activity.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          isPublic: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          location: true,
          cost: true,
          priceRange: true,
          trip: {
            select: {
              id: true,
              title: true,
              destination: true,
            },
          },
          _count: {
            select: { savedBy: true, ratings: true },
          },
        },
        take: limit,
      });
      results.activities = activities;
    }

    // Search users - email removed for privacy (prevents user enumeration attacks)
    if (type === 'all' || type === 'users') {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          image: true,
          city: true,
          bio: true,
          _count: {
            select: { followers: true, ownedTrips: true },
          },
        },
        take: limit,
      });
      results.users = users;
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    logError('SEARCH_GET', error);
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    );
  }
}

