import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  searchSchema,
  inspirationPostSchema,
  type SearchInput,
  type TripTemplate,
} from './types';
import {
  tripTemplates,
  popularDestinations,
  generateSuggestedItinerary,
} from './templates';

function filterTemplates(
  templates: TripTemplate[],
  input: Pick<SearchInput, 'query' | 'destination' | 'tripType' | 'sortBy'>
): TripTemplate[] {
  const { query, destination, tripType, sortBy } = input;
  let filtered = templates;

  if (query) {
    const queryLower = query.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(queryLower) ||
        t.description.toLowerCase().includes(queryLower) ||
        t.destination.city.toLowerCase().includes(queryLower) ||
        t.tags.some((tag) => tag.includes(queryLower))
    );
  }

  if (destination) {
    filtered = filtered.filter((t) =>
      t.destination.city.toLowerCase().includes(destination.toLowerCase())
    );
  }

  if (tripType) {
    filtered = filtered.filter((t) => t.tags.includes(tripType));
  }

  if (sortBy === 'popular') {
    filtered = [...filtered].sort((a, b) => b.usageCount - a.usageCount);
  } else if (sortBy === 'rating') {
    filtered = [...filtered].sort((a, b) => b.rating - a.rating);
  }

  return filtered;
}

export async function handleInspirationGet(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const validation = searchSchema.safeParse(Object.fromEntries(searchParams));
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { query, destination, tripType, sortBy, page, limit } = validation.data;
    const skip = (page - 1) * limit;

    const whereClause: Record<string, unknown> = {
      isPublic: true,
      status: { in: ['COMPLETED', 'IN_PROGRESS', 'BOOKED'] },
    };

    if (destination) {
      whereClause.destination = {
        path: ['city'],
        string_contains: destination,
      };
    }

    const [trips, totalCount] = await Promise.all([
      prisma.trip.findMany({
        where: whereClause,
        include: {
          owner: { select: { name: true, image: true } },
          members: { select: { id: true } },
          activities: {
            where: { isPublic: true },
            take: 3,
          },
          _count: { select: { activities: true } },
        },
        orderBy:
          sortBy === 'recent'
            ? { createdAt: 'desc' }
            : sortBy === 'popular'
              ? { viewCount: 'desc' }
              : { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.trip.count({ where: whereClause }),
    ]);

    const trendingActivities = await prisma.activity.findMany({
      where: { isPublic: true },
      include: {
        ratings: true,
        _count: { select: { savedBy: true, comments: true } },
        trip: {
          select: {
            destination: true,
          },
        },
      },
      orderBy: [{ shareCount: 'desc' }],
      take: 8,
    });

    const filteredTemplates = filterTemplates(tripTemplates, {
      query,
      destination,
      tripType,
      sortBy,
    });

    return NextResponse.json({
      success: true,
      data: {
        trips: trips.map((trip) => ({
          id: trip.id,
          title: trip.title,
          description: trip.description,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          memberCount: trip.members.length,
          activityCount: trip._count.activities,
          activities: trip.activities.map((a) => ({
            name: a.name,
            category: a.category,
          })),
          owner: trip.owner,
          status: trip.status,
        })),
        totalTrips: totalCount,
        templates: filteredTemplates,
        destinations: popularDestinations,
        trending: trendingActivities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          description: activity.description,
          category: activity.category,
          destination: (activity.trip.destination as { city: string }).city,
          avgRating:
            activity.ratings.length > 0
              ? activity.ratings.reduce((sum, r) => sum + r.score, 0) / activity.ratings.length
              : null,
          saveCount: activity._count.savedBy,
          commentCount: activity._count.comments,
        })),
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: skip + trips.length < totalCount,
        },
      },
    });
  } catch (error) {
    logger.error({ error }, '[INSPIRATION_GET] Failed to fetch inspiration');
    return NextResponse.json(
      { error: 'Failed to fetch inspiration' },
      { status: 500 }
    );
  }
}

export async function handleInspirationPost(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsedBody = inspirationPostSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { templateId, action } = parsedBody.data;

    if (action === 'get-template') {
      const template = tripTemplates.find((t) => t.id === templateId);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: {
          ...template,
          suggestedItinerary: generateSuggestedItinerary(template),
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error({ error }, '[INSPIRATION_POST] Failed to process request');
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
