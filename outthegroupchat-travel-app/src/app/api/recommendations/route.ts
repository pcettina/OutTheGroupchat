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
 *   4. Score each result: `rating × hotnessBoost`. The hotness boost is the
 *      real V1 Phase 4 signal: it is derived from recent `HeatmapContribution`
 *      rows in the venue's anonymized cell (see `lib/hotness/score`), weighted
 *      toward the viewer's Crew when `weightByCrew` is enabled (R10).
 *   5. Sort by score desc, take top `limit`.
 *
 * Falls back to DB venues (matching cityArea) when Google Places is
 * unavailable or the API key isn't set.
 *
 * The contribution set + the viewer's Crew ids feed `computeHotnessBoost`. The
 * contribution query (one query, not N+1 per venue) is cached in-memory per
 * `(topicId, cityArea)` for `BOOST_CACHE_TTL_MS`; Crew ids are resolved per
 * request (cheap, and viewer-specific so not part of the shared cache key).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { HeatmapContributionType } from '@prisma/client';
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
import {
  computeHotnessBoost,
  HOTNESS_CONFIG,
  type HotnessContributionRow,
} from '@/lib/hotness/score';
import { NYC_NEIGHBORHOODS } from '@/lib/intent/neighborhoods';

/** TTL for the per-`(topicId, cityArea)` contribution cache (5 minutes). */
const BOOST_CACHE_TTL_MS = 5 * 60 * 1000;

interface ContributionCacheEntry {
  rows: HotnessContributionRow[];
  expiresAt: number;
}

/**
 * Module-level cache of recent contribution rows keyed by `(topicId, cityArea)`.
 * Persists across requests within a single server instance; entries expire after
 * `BOOST_CACHE_TTL_MS`. Keyed only by query-shaping params (not the viewer) so
 * the same recent-contribution snapshot is shared across viewers — Crew-weight
 * is applied per request from the viewer's own Crew ids, not cached.
 */
const contributionCache = new Map<string, ContributionCacheEntry>();

function contributionCacheKey(topicId: string, cityArea: string | undefined): string {
  return `${topicId}::${cityArea ?? ''}`;
}

/**
 * Fetch recent INTEREST/PRESENCE contributions within the rolling window,
 * optionally scoped to `topicId`. Returns the minimal `HotnessContributionRow`
 * slice `computeHotnessBoost` needs. Cached per `(topicId, cityArea)` for
 * `BOOST_CACHE_TTL_MS`. One query per cache-miss — never N+1 per venue.
 */
async function getRecentContributions(
  topicId: string,
  cityArea: string | undefined,
  now: Date,
): Promise<HotnessContributionRow[]> {
  const key = contributionCacheKey(topicId, cityArea);
  const cached = contributionCache.get(key);
  if (cached && cached.expiresAt > now.getTime()) {
    return cached.rows;
  }

  const cutoff = new Date(now.getTime() - HOTNESS_CONFIG.rollingWindowHours * 60 * 60 * 1000);
  const rows = await prisma.heatmapContribution.findMany({
    where: {
      type: { in: [HeatmapContributionType.INTEREST, HeatmapContributionType.PRESENCE] },
      createdAt: { gte: cutoff },
      ...(topicId ? { topicId } : {}),
    },
    select: {
      userId: true,
      type: true,
      cellLat: true,
      cellLng: true,
      createdAt: true,
    },
  });

  contributionCache.set(key, { rows, expiresAt: now.getTime() + BOOST_CACHE_TTL_MS });
  return rows;
}

/**
 * Resolve the viewer's accepted-Crew partner user ids (same ACCEPTED-edge
 * pattern used by `lib/heatmap/aggregate`). Used as `viewerCrewIds` so
 * `weightByCrew` can boost Crew-authored contributions (R10).
 */
async function getViewerCrewIds(viewerId: string): Promise<string[]> {
  const rows = await prisma.crew.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: viewerId }, { userBId: viewerId }],
    },
    select: { userAId: true, userBId: true },
  });
  return rows.map((r) => (r.userAId === viewerId ? r.userBId : r.userAId));
}

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
  /**
   * Hotness multiplier applied to the base score. Derived from recent
   * `HeatmapContribution` density in the venue's cell (see lib/hotness/score);
   * `1.0` when the venue's cell has no recent contributions, up to `MAX_BOOST`.
   */
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
    const now = new Date();

    const categories = await getPlacesCategoriesForTopic(topicId, prisma);
    const cityAreaDisplay = cityArea
      ? NYC_NEIGHBORHOODS.find((n) => n.slug === cityArea)?.displayName ?? cityArea
      : null;

    // Load the hotness inputs once: recent contributions (cached per
    // topic+area) and the viewer's Crew ids (for the weight-by-Crew filter).
    // The same `contributions` array is passed to every venue's boost call —
    // computeHotnessBoost filters to each venue's cell internally (no N+1).
    const [contributions, viewerCrewIds] = await Promise.all([
      getRecentContributions(topicId, cityArea, now),
      weightByCrew ? getViewerCrewIds(callerId) : Promise.resolve<string[]>([]),
    ]);

    const boostFor = (venue: { latitude: number | null; longitude: number | null }): number =>
      computeHotnessBoost({ venue, contributions, weightByCrew, viewerCrewIds, now });

    // Try Google Places first.
    const query = buildPlacesQuery(categories, cityAreaDisplay);
    const placesResults = await searchPlaces({ query }).catch(() => []);

    let recommendations: RecommendedVenue[];

    if (placesResults.length > 0) {
      recommendations = placesResults.map((p) => {
        const mapped = mapPlaceToVenue(p);
        const baseScore = p.rating ?? 3.5; // mid-range fallback when Google omits a rating
        const boost = boostFor(mapped);
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
        const boost = boostFor(v);
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
        weightByCrew,
        categoriesCount: categories.length,
        contributionsConsidered: contributions.length,
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
    captureException(error, { route: '/api/recommendations', method: 'GET' });
    apiLogger.error({ error }, '[RECOMMENDATIONS] Failed to compute recommendations');
    return NextResponse.json(
      { success: false, error: 'Failed to compute recommendations' },
      { status: 500 },
    );
  }
}
