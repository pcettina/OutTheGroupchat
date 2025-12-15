import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';

// Global search across trips, activities, and users
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.toLowerCase() || '';
    const type = searchParams.get('type') || 'all'; // 'all', 'trips', 'activities', 'users'
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query || query.length < 2) {
      return NextResponse.json({
        success: true,
        data: { trips: [], activities: [], users: [] },
      });
    }

    const results: {
      trips?: any[];
      activities?: any[];
      users?: any[];
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

