import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import {
  generateEmbedding,
  cosineSimilarity,
  buildActivityText,
  buildDestinationText,
} from '@/lib/ai/embeddings';
import { z } from 'zod';
import { ActivityCategory, PriceRange } from '@prisma/client';
import { logError } from '@/lib/logger';
import { captureException, addBreadcrumb } from '@/lib/sentry';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const semanticSearchSchema = z.object({
  query: z.string().min(1).max(500),
  type: z.enum(['activities', 'destinations', 'all']).optional().default('all'),
  limit: z.number().min(1).max(50).optional().default(10),
  filters: z
    .object({
      category: z.nativeEnum(ActivityCategory).optional(),
      priceRange: z.nativeEnum(PriceRange).optional(),
      minRating: z.number().optional(),
    })
    .optional(),
});

// Cache for activity embeddings (in production, use Redis or similar)
const embeddingCache = new Map<string, number[]>();

// ---------------------------------------------------------------------------
// Shared search logic — used by both POST and GET handlers
// ---------------------------------------------------------------------------

async function runSemanticSearch(
  query: string,
  type: 'activities' | 'destinations' | 'all',
  limit: number,
  filters?: {
    category?: ActivityCategory;
    priceRange?: PriceRange;
    minRating?: number;
  }
): Promise<{
  activities?: { id: string; name: string; score: number; metadata: Record<string, unknown> }[];
  destinations?: { id: string; city: string; country: string; score: number; metadata: Record<string, unknown> }[];
}> {
  const queryEmbedding = await generateEmbedding(query);

  const results: {
    activities?: { id: string; name: string; score: number; metadata: Record<string, unknown> }[];
    destinations?: {
      id: string;
      city: string;
      country: string;
      score: number;
      metadata: Record<string, unknown>;
    }[];
  } = {};

  // ------------------------------------------------------------------
  // Activities branch
  // ------------------------------------------------------------------
  if (type === 'all' || type === 'activities') {
    const activities = await prisma.activity.findMany({
      where: {
        isPublic: true,
        ...(filters?.category && { category: filters.category }),
        ...(filters?.priceRange && { priceRange: filters.priceRange }),
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
            destination: true,
          },
        },
        _count: {
          select: { ratings: true },
        },
      },
      take: 100,
    });

    const scoredActivities = await Promise.all(
      activities.map(async (activity) => {
        let activityEmbedding = embeddingCache.get(activity.id);

        if (!activityEmbedding) {
          const location = activity.location as { address?: string; city?: string } | null;
          const text = buildActivityText({
            name: activity.name,
            description: activity.description,
            category: activity.category ?? undefined,
            location: location ? { address: location.address, city: location.city } : undefined,
          });
          activityEmbedding = await generateEmbedding(text);
          embeddingCache.set(activity.id, activityEmbedding);
        }

        const score = cosineSimilarity(queryEmbedding, activityEmbedding);

        return {
          id: activity.id,
          name: activity.name,
          score,
          metadata: {
            description: activity.description,
            category: activity.category,
            cost: activity.cost,
            priceRange: activity.priceRange,
            location: activity.location,
            ratingCount: activity._count.ratings,
          },
        };
      })
    );

    results.activities = scoredActivities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter((a) => a.score > 0.5);
  }

  // ------------------------------------------------------------------
  // Destinations branch
  // ------------------------------------------------------------------
  if (type === 'all' || type === 'destinations') {
    try {
      const destinations = await prisma.destinationCache.findMany({
        select: {
          id: true,
          city: true,
          country: true,
          description: true,
          highlights: true,
          topCategories: true,
          activityCount: true,
          averageRating: true,
          bestTimeToVisit: true,
          averageBudget: true,
        },
        take: 100,
      });

      const scoredDestinations = await Promise.all(
        destinations.map(async (dest) => {
          const cacheKey = `dest:${dest.id}`;
          let destEmbedding = embeddingCache.get(cacheKey);

          if (!destEmbedding) {
            const highlights = dest.highlights as string[] | null;
            const text = buildDestinationText({
              city: dest.city,
              country: dest.country,
              description: dest.description ?? undefined,
              attractions: highlights ?? undefined,
              vibes: dest.topCategories,
            });
            destEmbedding = await generateEmbedding(text);
            embeddingCache.set(cacheKey, destEmbedding);
          }

          const score = cosineSimilarity(queryEmbedding, destEmbedding);

          return {
            id: dest.id,
            city: dest.city,
            country: dest.country,
            score,
            metadata: {
              description: dest.description,
              highlights: dest.highlights,
              topCategories: dest.topCategories,
              activityCount: dest.activityCount,
              averageRating: dest.averageRating,
              bestTimeToVisit: dest.bestTimeToVisit,
              averageBudget: dest.averageBudget,
            },
          };
        })
      );

      results.destinations = scoredDestinations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .filter((d) => d.score > 0.5);
    } catch (destError) {
      logError('AI_SEMANTIC_SEARCH_DESTINATIONS', destError);
      results.destinations = [];
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// POST /api/ai/search
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(aiRateLimiter, session.user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await req.json();
    const validationResult = semanticSearchSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { query, type, limit, filters } = validationResult.data;

    addBreadcrumb({ message: 'Starting AI semantic search', category: 'ai', level: 'info' });
    const results = await runSemanticSearch(query, type, limit, filters);

    const totalResults =
      (results.activities?.length ?? 0) + (results.destinations?.length ?? 0);

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        query,
        type,
        totalResults,
      },
    });
  } catch (error) {
    logError('AI_SEMANTIC_SEARCH', error);
    captureException(error, { tags: { route: '/api/ai/search' } });
    return NextResponse.json(
      { success: false, error: 'Semantic search failed' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/ai/search?q=<query>&limit=<n>&type=<type>
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const limitParam = searchParams.get('limit');
    const typeParam = searchParams.get('type');

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(aiRateLimiter, session.user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const rawBody = {
      query,
      ...(limitParam !== null && { limit: parseInt(limitParam, 10) }),
      ...(typeParam !== null && { type: typeParam }),
    };

    const validationResult = semanticSearchSchema.safeParse(rawBody);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { query: validQuery, type, limit, filters } = validationResult.data;

    addBreadcrumb({ message: 'Starting AI semantic search', category: 'ai', level: 'info' });
    const results = await runSemanticSearch(validQuery, type, limit, filters);

    const totalResults =
      (results.activities?.length ?? 0) + (results.destinations?.length ?? 0);

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        query: validQuery,
        type,
        totalResults,
      },
    });
  } catch (error) {
    logError('AI_SEMANTIC_SEARCH_GET', error);
    captureException(error, { tags: { route: '/api/ai/search' } });
    return NextResponse.json(
      { success: false, error: 'Semantic search failed' },
      { status: 500 }
    );
  }
}
