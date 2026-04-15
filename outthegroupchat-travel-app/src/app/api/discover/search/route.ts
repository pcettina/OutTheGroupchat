import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

const DiscoverSearchSchema = z.object({
  q: z.string().max(200).optional().default(''),
  city: z.string().max(100).optional().default(''),
  country: z.string().max(100).optional().default(''),
  category: z.string().max(100).optional().default(''),
  source: z.enum(['internal', 'external', '']).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Search for activities from both internal and external sources
export async function GET(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    const rateLimitResult = await checkRateLimit(apiRateLimiter, ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Auth guard — require an active session
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawParams = {
      q: searchParams.get('q') ?? undefined,
      city: searchParams.get('city') ?? undefined,
      country: searchParams.get('country') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      source: searchParams.get('source') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    };
    const parseResult = DiscoverSearchSchema.safeParse(rawParams);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parseResult.error.issues },
        { status: 400 }
      );
    }
    const { q: query, city, country, category, source, limit, offset } = parseResult.data;

    const results: {
      internal: unknown[];
      external: unknown[];
      total: number;
      query: {
        q: string;
        city: string;
        category: string;
        limit: number;
        offset: number;
      };
    } = {
      internal: [],
      external: [],
      total: 0,
      query: { q: query, city, category, limit, offset },
    };

    // Search internal activities (user-created)
    if (source !== 'external') {
      const internalWhere: Record<string, unknown> = {
        isPublic: true,
      };

      if (query) {
        internalWhere.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ];
      }

      if (category) {
        internalWhere.category = category.toUpperCase();
      }

      const internalActivities = await prisma.activity.findMany({
        where: internalWhere,
        include: {
          trip: {
            select: {
              title: true,
              destination: true,
            },
          },
          _count: {
            select: {
              savedBy: true,
              comments: true,
              ratings: true,
            },
          },
        },
        orderBy: [
          { shareCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
        skip: offset,
      });

      results.internal = internalActivities.map((activity) => ({
        id: activity.id,
        type: 'internal',
        name: activity.name,
        description: activity.description,
        category: activity.category,
        location: activity.location,
        cost: activity.cost,
        currency: activity.currency,
        priceRange: activity.priceRange,
        trip: activity.trip,
        engagement: {
          saves: activity._count.savedBy,
          comments: activity._count.comments,
          ratings: activity._count.ratings,
        },
        createdAt: activity.createdAt,
      }));
    }

    // Search external activities (from OpenTripMap, etc.)
    if (source !== 'internal') {
      const externalWhere: Record<string, unknown> = {};

      if (query) {
        externalWhere.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { searchText: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: [query.toLowerCase()] } },
        ];
      }

      if (city) {
        externalWhere.city = { contains: city, mode: 'insensitive' };
      }

      if (country) {
        externalWhere.country = { contains: country, mode: 'insensitive' };
      }

      if (category) {
        externalWhere.category = { contains: category, mode: 'insensitive' };
      }

      try {
        const externalActivities = await prisma.externalActivity.findMany({
          where: externalWhere,
          orderBy: [
            { popularity: 'desc' },
            { rating: 'desc' },
          ],
          take: limit,
          skip: offset,
        });

        results.external = externalActivities.map((activity) => ({
          id: activity.id,
          type: 'external',
          externalId: activity.externalId,
          source: activity.source,
          name: activity.name,
          description: activity.description,
          category: activity.category,
          tags: activity.tags,
          location: {
            latitude: activity.latitude,
            longitude: activity.longitude,
            address: activity.address,
            city: activity.city,
            country: activity.country,
          },
          rating: activity.rating,
          ratingCount: activity.ratingCount,
          priceLevel: activity.priceLevel,
          imageUrl: activity.imageUrl,
          thumbnailUrl: activity.thumbnailUrl,
          websiteUrl: activity.websiteUrl,
        }));
      } catch {
        // ExternalActivity table might not exist yet - that's okay
      }
    }

    results.total = results.internal.length + results.external.length;

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[DISCOVER/SEARCH] Failed to search activities');
    return NextResponse.json(
      { error: 'Failed to search activities' },
      { status: 500 }
    );
  }
}
