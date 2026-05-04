/**
 * @module api/subcrews/[id]/commit
 * @description V1 Phase 3 — Journey C "Commit" endpoint.
 *
 * Called by a SubCrew member from the per-event privacy picker. Atomically:
 *   1. Verifies caller is a member of the SubCrew.
 *   2. Validates the body — Intent must belong to caller and currently be
 *      INTERESTED.
 *   3. Flips the Intent state INTERESTED → COMMITTED.
 *   4. Stamps SubCrewMember.committedAt.
 *   5. Writes a HeatmapContribution via `buildInterestContributionData`. The
 *      cell resolves from `Intent.venueId` first; if the Intent is
 *      cityArea-only the writer falls back to the neighborhood centroid so
 *      the contribution still surfaces in the Interest heatmap (Phase 4a).
 *
 * Privacy defaults (per the plan / R4):
 *   socialScope    — NOBODY
 *   granularity    — BLOCK
 *   identity       — KNOWN  (Crew default per R20)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import {
  HeatmapGranularityMode,
  HeatmapIdentityMode,
  HeatmapSocialScope,
  type Prisma,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { buildInterestContributionData } from '@/lib/heatmap/contribution-writer';

type RouteParams = { params: { id: string } };

const commitSchema = z.object({
  intentId: z.string().cuid(),
  socialScope: z.nativeEnum(HeatmapSocialScope).default('NOBODY'),
  granularity: z.nativeEnum(HeatmapGranularityMode).default('BLOCK'),
  identityMode: z.nativeEnum(HeatmapIdentityMode).default('KNOWN'),
});

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `subcrew-commit:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const { id: subCrewId } = context.params;
    if (!subCrewId) {
      return NextResponse.json({ success: false, error: 'SubCrew id required' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = commitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const callerId = session.user.id;
    const { intentId, socialScope, granularity, identityMode } = parsed.data;

    const member = await prisma.subCrewMember.findFirst({
      where: { subCrewId, userId: callerId },
      select: { id: true, committedAt: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (member.committedAt) {
      return NextResponse.json(
        { success: false, error: 'Already committed' },
        { status: 409 },
      );
    }

    const intent = await prisma.intent.findUnique({
      where: { id: intentId },
      select: {
        id: true,
        userId: true,
        state: true,
        expiresAt: true,
        topicId: true,
        windowPreset: true,
        cityArea: true,
        venueId: true,
      },
    });
    if (!intent || intent.userId !== callerId) {
      return NextResponse.json({ success: false, error: 'Intent not found' }, { status: 404 });
    }
    if (intent.state !== 'INTERESTED') {
      return NextResponse.json(
        { success: false, error: 'Intent is not in INTERESTED state' },
        { status: 409 },
      );
    }

    let venueLatLng: { latitude: number | null; longitude: number | null } | null = null;
    if (intent.venueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: intent.venueId },
        select: { latitude: true, longitude: true },
      });
      if (venue) {
        venueLatLng = { latitude: venue.latitude, longitude: venue.longitude };
      }
    }

    const contributionData = buildInterestContributionData({
      userId: callerId,
      intent: {
        id: intent.id,
        venueId: intent.venueId,
        cityArea: intent.cityArea,
        topicId: intent.topicId,
        windowPreset: intent.windowPreset,
        expiresAt: intent.expiresAt,
      },
      venueLatLng,
      socialScope,
      granularity,
      identityMode,
    });

    const now = new Date();

    // Single transaction so the state flip + per-event stamp + contribution
    // either all land or none of them do. Keeps the ship-criteria invariant
    // "Intent state flips, privacy captured" atomic.
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.intent.update({
        where: { id: intentId },
        data: { state: 'COMMITTED' },
      }),
      prisma.subCrewMember.update({
        where: { id: member.id },
        data: { committedAt: now },
      }),
    ];

    if (contributionData) {
      writes.push(prisma.heatmapContribution.create({ data: contributionData }));
    }

    const results = await prisma.$transaction(writes);
    let contributionId: string | null = null;
    if (contributionData && results.length === 3) {
      const created = results[2] as { id?: string };
      contributionId = created.id ?? null;
    }

    apiLogger.info(
      {
        subCrewId,
        intentId,
        callerId,
        contributionWritten: contributionId !== null,
        socialScope,
        granularity,
        identityMode,
      },
      '[SUBCREW_COMMIT] Intent committed',
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          subCrewId,
          intentId,
          memberId: member.id,
          committedAt: now,
          heatmapContributionId: contributionId,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    captureException(error, { route: 'api/subcrews/[id]/commit', method: 'POST' });
    apiLogger.error({ error }, '[SUBCREW_COMMIT] Failed to commit');
    return NextResponse.json(
      { success: false, error: 'Failed to commit' },
      { status: 500 },
    );
  }
}
