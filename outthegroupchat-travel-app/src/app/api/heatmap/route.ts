/**
 * @module api/heatmap
 * @description V1 Phase 4 — Journey D "See where people are."
 *
 * GET /api/heatmap
 *   Returns aggregated heatmap data for the authenticated viewer:
 *     - `cells` — anonymized density buckets at the viewer's permitted
 *       granularity (R4), with the R14 anonymous N>=3 floor enforced.
 *     - `venueMarkers` — discrete venue pins for contributions whose source
 *       Intent (or CheckIn) carries a `venueId`. The frontend shows these
 *       only when the viewer zooms in past z=15 per R22.
 *
 * Query params:
 *   type           interest | presence       (required)
 *   tier           crew                      (required; `fof` reserved for 4b)
 *   cityArea       neighborhood slug         (optional filter)
 *   topicId        cuid                      (optional filter)
 *   windowPreset   enum                      (optional filter)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { WindowPreset } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { aggregateContributions } from '@/lib/heatmap/aggregate';
import { isNeighborhoodSlug } from '@/lib/intent/neighborhoods';

const heatmapQuerySchema = z.object({
  type: z.enum(['interest', 'presence']),
  tier: z.enum(['crew', 'fof']),
  cityArea: z.string().min(1).max(100).optional(),
  topicId: z.string().cuid().optional(),
  windowPreset: z.nativeEnum(WindowPreset).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `heatmap-read:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const url = new URL(request.url);
    const parsed = heatmapQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, tier, cityArea, topicId, windowPreset } = parsed.data;

    if (cityArea && !isNeighborhoodSlug(cityArea)) {
      return NextResponse.json(
        { success: false, error: 'Unknown cityArea' },
        { status: 400 },
      );
    }

    if (tier === 'fof') {
      return NextResponse.json(
        {
          success: false,
          error: 'FoF tier ships in Phase 4b — use tier=crew for now',
        },
        { status: 400 },
      );
    }

    const result = await aggregateContributions({
      viewerId: session.user.id,
      type,
      tier: 'crew',
      cityArea,
      topicId,
      windowPreset,
    });

    apiLogger.info(
      {
        viewerId: session.user.id,
        type,
        tier,
        cellCount: result.cells.length,
        venueMarkerCount: result.venueMarkers.length,
      },
      '[HEATMAP_GET] Aggregated contributions',
    );

    return NextResponse.json({
      success: true,
      data: {
        type,
        tier,
        cells: result.cells,
        venueMarkers: result.venueMarkers,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[HEATMAP_GET] Failed to aggregate');
    return NextResponse.json(
      { success: false, error: 'Failed to load heatmap' },
      { status: 500 },
    );
  }
}
