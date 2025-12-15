import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { generateEmbedding, cosineSimilarity, buildActivityText } from '@/lib/ai/embeddings';
import { z } from 'zod';
import { ActivityCategory, PriceRange } from '@prisma/client';

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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        query,
        type,
        totalResults: results.activities?.length || 0,
      },
    });
  } catch (error) {
    console.error('[AI_SEMANTIC_SEARCH]', error);
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

