import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { z } from 'zod';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

const searchQuerySchema = z.object({
  q: z.string().max(200).default(''),
  type: z.enum(['all', 'people', 'meetups', 'venues']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Global search across people, meetups, and venues (people-first ordering)
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
        data: { users: [], meetups: [], venues: [] },
      });
    }

    type UserResult = {
      id: string;
      name: string | null;
      image: string | null;
      city: string | null;
      bio: string | null;
      _count: { followers: number; ownedTrips: number };
    };

    type MeetupResult = {
      id: string;
      title: string;
      scheduledAt: Date;
      venue: { name: string } | null;
    };

    type VenueResult = {
      id: string;
      name: string;
      address: string | null;
      city: string;
      category: string;
    };

    const results: {
      users?: UserResult[];
      meetups?: MeetupResult[];
      venues?: VenueResult[];
    } = {};

    // Search users - email excluded for privacy (prevents user enumeration attacks)
    // 'people' is the canonical type; 'all' also includes users with people-first ordering
    if (type === 'all' || type === 'people') {
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

    // Search meetups
    if (type === 'all' || type === 'meetups') {
      const meetups = await prisma.meetup.findMany({
        where: {
          title: { contains: query, mode: 'insensitive' },
        },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          venue: {
            select: { name: true },
          },
        },
        take: limit,
      });
      results.meetups = meetups;
    }

    // Search venues
    if (type === 'all' || type === 'venues') {
      const venues = await prisma.venue.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          category: true,
        },
        take: limit,
      });
      results.venues = venues;
    }

    // For 'all' type, enforce people-first key ordering
    if (type === 'all') {
      const ordered: {
        users?: UserResult[];
        meetups?: MeetupResult[];
        venues?: VenueResult[];
      } = {
        users: results.users,
        meetups: results.meetups,
        venues: results.venues,
      };
      return NextResponse.json({ success: true, data: ordered });
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
