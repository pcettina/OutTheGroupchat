import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { generateEmbedding, cosineSimilarity, buildActivityText, buildDestinationText } from '@/lib/ai/embeddings';
import { z } from 'zod';
import { ActivityCategory, PriceRange } from '@prisma/client';
import { logError } from '@/lib/logger';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const semanticSearchSchema = z.object({
  query: z.string().min(1).max(500),
  type: z.enum(['activities', 'destinations', 'all']).optional().default('all'),
  limit: z.number().min(1).max(50).optional().default(10),
  filters: z.object({
    category: z.nativeEnum(ActivityCategory).optional(),
    priceRange: z.nativeEnum(PriceRange).optional(),
    minRating: z.number().optional(),
  }).optional(),
});

// Cache for activity embeddings (in production, use Redis or similar)
const embeddingCache = new Map<string, number[]>();

// Cache for destination embeddings keyed by destination string
const destinationCache = new Map<string, number[]>();

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit by authenticated user ID
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

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    const results: {
      activities?: { id: string; name: string; score: number; metadata: Record<string, unknown> }[];
      destinations?: { destination: string; score: number; tripCount: number }[];
    } = {};

    if (type === 'all' || type === 'activities') {
      // Fetch activities with basic info
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
        take: 100, // Limit for performance
      });

      // Calculate similarity scores
      const scoredActivities = await Promise.all(
        activities.map(async (activity) => {
          // Check cache first
          let activityEmbedding = embeddingCache.get(activity.id);
          
          if (!activityEmbedding) {
            const location = activity.location as { address?: string } | null;
            const text = buildActivityText({
              name: activity.name,
              description: activity.description,
              category: activity.category || undefined,
              location: location ? { address: location.address } : undefined,
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

      // Sort by score and take top results
      results.activities = scoredActivities
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .filter(a => a.score > 0.5); // Only return reasonably relevant results
    }

    if (type === 'all' || type === 'destinations') {
      // Fetch distinct public trip destinations
      const trips = await prisma.trip.findMany({
        where: { isPublic: true },
        select: { destination: true, description: true, id: true },
        distinct: ['destination'],
      });

      // Group by destination string to count trips per destination
      const destinationTripCounts = new Map<string, number>();
      for (const trip of trips) {
        const dest = trip.destination as { city?: string; country?: string } | null;
        const destKey = dest ? `${dest.city ?? ''} ${dest.country ?? ''}`.trim() : '';
        if (destKey) {
          destinationTripCounts.set(destKey, (destinationTripCounts.get(destKey) ?? 0) + 1);
        }
      }

      // Score each unique destination against the query
      const scoredDestinations = await Promise.all(
        Array.from(destinationTripCounts.keys()).map(async (destKey) => {
          let destEmbedding = destinationCache.get(destKey);

          if (!destEmbedding) {
            const parts = destKey.split(' ');
            const city = parts[0] ?? destKey;
            const country = parts.slice(1).join(' ') || city;
            const text = buildDestinationText({ city, country });
            destEmbedding = await generateEmbedding(text);
            destinationCache.set(destKey, destEmbedding);
          }

          const score = cosineSimilarity(queryEmbedding, destEmbedding);

          return {
            destination: destKey,
            score,
            tripCount: destinationTripCounts.get(destKey) ?? 1,
          };
        })
      );

      results.destinations = scoredDestinations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .filter(d => d.score > 0.5);
    }

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        query,
        type,
        totalResults: (results.activities?.length ?? 0) + (results.destinations?.length ?? 0),
      },
    });
  } catch (error) {
    logError('AI_SEMANTIC_SEARCH', error);
    return NextResponse.json(
      { success: false, error: 'Semantic search failed' },
      { status: 500 }
    );
  }
}

// GET endpoint for simple semantic search
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '10');

  if (!query) {
    return NextResponse.json(
      { success: false, error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  // Forward to POST handler
  const fakeReq = new Request(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify({ query, limit }),
  });

  return POST(fakeReq);
}

