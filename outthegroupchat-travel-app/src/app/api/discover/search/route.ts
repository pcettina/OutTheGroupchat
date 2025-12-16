import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';

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

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const city = searchParams.get('city') || '';
    const country = searchParams.get('country') || '';
    const category = searchParams.get('category') || '';
    const source = searchParams.get('source') || ''; // 'internal', 'external', or '' for both
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const offset = parseInt(searchParams.get('offset') || '0');

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
        console.log('[DISCOVER/SEARCH] ExternalActivity table not available yet');
      }
    }

    results.total = results.internal.length + results.external.length;

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('[DISCOVER/SEARCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to search activities' },
      { status: 500 }
    );
  }
}

