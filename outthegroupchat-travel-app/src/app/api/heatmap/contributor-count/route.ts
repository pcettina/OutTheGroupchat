/**
 * @module api/heatmap/contributor-count
 * @description V1 Phase 4 — R14 anonymity probe for the 3-axis privacy picker.
 *
 * GET /api/heatmap/contributor-count
 *   Returns ONLY an aggregate integer: how many live ANONYMOUS contributions
 *   would share the cell the caller is about to write into, plus whether that
 *   clears the R14 N>=3 floor. No user ids, names, or rows are ever returned —
 *   the endpoint exists so the picker can disable "Anonymous" instead of
 *   silently promising anonymity the aggregator will drop.
 *
 * Query params:
 *   type         interest | presence           (required)
 *   granularity  BLOCK | DYNAMIC_CELL          (required — HIDDEN writes nothing)
 *   venueId      cuid                          (optional — preferred cell source)
 *   cityArea     neighborhood slug             (optional — centroid fallback)
 *
 * At least one of `venueId` / `cityArea` must be supplied; when neither
 * resolves to a cell the response reports `cellResolved: false` and
 * `meetsFloor: false` so the client fails safe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { HeatmapGranularityMode } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getAnonymousContributorCount } from '@/lib/heatmap/contributor-count';
import { isNeighborhoodSlug } from '@/lib/intent/neighborhoods';

const contributorCountQuerySchema = z
  .object({
    type: z.enum(['interest', 'presence']),
    granularity: z.enum([
      HeatmapGranularityMode.BLOCK,
      HeatmapGranularityMode.DYNAMIC_CELL,
    ]),
    venueId: z.string().cuid().optional(),
    cityArea: z.string().min(1).max(100).optional(),
  })
  .refine((v) => Boolean(v.venueId) || Boolean(v.cityArea), {
    message: 'Either venueId or cityArea is required',
  });

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(
      apiRateLimiter,
      `heatmap-contributor-count:${session.user.id}`,
    );
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const url = new URL(request.url);
    const parsed = contributorCountQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, granularity, venueId, cityArea } = parsed.data;

    if (cityArea && !isNeighborhoodSlug(cityArea)) {
      return NextResponse.json(
        { success: false, error: 'Unknown cityArea' },
        { status: 400 },
      );
    }

    const result = await getAnonymousContributorCount({
      type,
      granularity,
      venueId,
      cityArea,
    });

    apiLogger.info(
      {
        viewerId: session.user.id,
        type,
        granularity,
        cellResolved: result.cellResolved,
        meetsFloor: result.meetsFloor,
      },
      '[HEATMAP_CONTRIBUTOR_COUNT_GET] Probed anonymous floor',
    );

    return NextResponse.json({
      success: true,
      data: {
        count: result.count,
        floor: result.floor,
        meetsFloor: result.meetsFloor,
        cellResolved: result.cellResolved,
      },
    });
  } catch (error) {
    captureException(error, {
      route: '/api/heatmap/contributor-count',
      method: 'GET',
    });
    apiLogger.error(
      { error },
      '[HEATMAP_CONTRIBUTOR_COUNT_GET] Failed to probe anonymous floor',
    );
    return NextResponse.json(
      { success: false, error: 'Failed to check anonymity floor' },
      { status: 500 },
    );
  }
}
