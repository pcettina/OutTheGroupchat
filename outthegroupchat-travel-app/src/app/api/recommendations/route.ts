/**
 * @module api/recommendations
 * @description V1 Phase 3 — venue recommendations for a SubCrew (Journey C).
 *
 * Pipeline:
 *   1. Resolve the Topic's Google Places categories from
 *      `getPlacesCategoriesForTopic` (R15).
 *   2. Build a text-search query from the categories + cityArea display name
 *      (e.g. `"bar in East Village"`).
 *   3. Call `searchPlaces` (Google Places Text Search) — same wrapper used
 *      by /api/venues/search.
 *   4. Score each result: `rating × hotnessBoost`. Phase 3 hotness is a
 *      stub returning 1.0; Phase 4 wires the real signal from
 *      HeatmapContribution rows.
 *   5. Sort by score desc, take top `limit`.
 *
 * Falls back to DB venues (matching cityArea) when Google Places is
 * unavailable or the API key isn't set.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import {
  getPlacesCategoriesForTopic,
  buildPlacesQuery,
} from '@/lib/intent/topic-places-map';
import { searchPlaces, mapPlaceToVenue } from '@/lib/api/places';
import { computeHotnessBoost } from '@/lib/hotness/score';
import { NYC_NEIGHBORHOODS } from '@/lib/intent/neighborhoods';

const querySchema = z.object({
  topicId: z.string().cuid(),
  cityArea: z.string().min(1).max(100).optional(),
  weightByCrew: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export interface RecommendedVenue {
  /** `gp_<place_id>` for Google Places hits, DB cuid for cached venues. */
  id: string;
  name: string;
  address: string | null;
  city: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  /** Source signal — useful for future ranking debug + UI badges. */
  source: 'google_places' | 'db';
  /** Google Places rating, when available. */
  rating: number | null;
  /** Final composite score (rating × hotnessBoost). */
  score: number;
  /** Hotness multiplier applied (1.0 in Phase 3 — see lib/hotness/score). */
  hotnessBoost: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `recs:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { topicId, cityArea, weightByCrew, limit } = parsed.data;
    const callerId = session.user.id;

    const categories = await getPlacesCategoriesForTopic(topicId, prisma);
    const cityAreaDisplay = cityArea
      ? NYC_NEIGHBORHOODS.find((n) => n.slug === cityArea)?.displayName ?? cityArea
      : null;

    // Try Google Places first.
    const query = buildPlacesQuery(categories, cityAreaDisplay);
    const placesResults = await searchPlaces({ query }).catch(() => []);

    let recommendations: RecommendedVenue[];

    if (placesResults.length > 0) {
      recommendations = placesResults.map((p) => {
        const mapped = mapPlaceToVenue(p);
        const baseScore = p.rating ?? 3.5; // mid-range fallback when Google omits a rating
        const boost = computeHotnessBoost(mapped.id, {
          viewerId: callerId,
          cityArea,
          weightByCrew,
        });
        return {
          id: mapped.id,
          name: mapped.name,
          address: mapped.address,
          city: mapped.city,
          category: String(mapped.category),
          latitude: mapped.latitude,
          longitude: mapped.longitude,
          imageUrl: mapped.imageUrl,
          source: 'google_places' as const,
          rating: p.rating ?? null,
          score: baseScore * boost,
          hotnessBoost: boost,
        };
      });
    } else {
      // DB fallback — match by cityArea if supplied.
      const dbVenues = await prisma.venue.findMany({
        where: cityArea
          ? {
              OR: [
                { city: { contains: cityAreaDisplay ?? cityArea, mode: 'insensitive' } },
                { address: { contains: cityAreaDisplay ?? cityArea, mode: 'insensitive' } },
              ],
            }
          : {},
        take: limit * 2,
      });
      recommendations = dbVenues.map((v) => {
        const boost = computeHotnessBoost(v.id, {
          viewerId: callerId,
          cityArea,
          weightByCrew,
        });
        return {
          id: v.id,
          name: v.name,
          address: v.address,
          city: v.city,
          category: String(v.category),
          latitude: v.latitude,
          longitude: v.longitude,
          imageUrl: v.imageUrl,
          source: 'db' as const,
          rating: null,
          score: 3.5 * boost,
          hotnessBoost: boost,
        };
      });
    }

    recommendations.sort((a, b) => b.score - a.score);
    const top = recommendations.slice(0, limit);

    apiLogger.info(
      {
        callerId,
        topicId,
        cityArea: cityArea ?? null,
        categoriesCount: categories.length,
        sourcedFromPlaces: placesResults.length > 0,
        returned: top.length,
      },
      '[RECOMMENDATIONS] Resolved venues',
    );

    return NextResponse.json({
      success: true,
      data: { recommendations: top, categoriesUsed: categories },
    });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error, route: '/api/recommendations', method: 'GET' }, '[RECOMMENDATIONS] Failed to compute recommendations');
    return NextResponse.json(
      { success: false, error: 'Failed to compute recommendations' },
      { status: 500 },
    );
  }
}
