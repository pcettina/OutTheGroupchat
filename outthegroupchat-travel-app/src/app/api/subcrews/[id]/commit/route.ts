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
 *   5. Optionally writes a HeatmapContribution if the Intent has a venueId
 *      we can resolve to lat/lng. Privacy axes (R4 + R20) are captured on
 *      the contribution; per-relationship overrides land on
 *      CrewRelationshipSetting via the existing /settings/privacy surface
 *      (out of scope for this PR).
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
import { anonymizeCell } from '@/lib/subcrew/cell-anonymize';

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

    // Resolve venue lat/lng for an optional HeatmapContribution write.
    let venueLatLng: { latitude: number; longitude: number } | null = null;
    if (intent.venueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: intent.venueId },
        select: { latitude: true, longitude: true },
      });
      if (venue && venue.latitude !== null && venue.longitude !== null) {
        venueLatLng = { latitude: venue.latitude, longitude: venue.longitude };
      }
    }

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

    let contributionId: string | null = null;
    if (venueLatLng && granularity !== 'HIDDEN') {
      const cell = anonymizeCell(venueLatLng.latitude, venueLatLng.longitude, granularity);
      if (cell) {
        writes.push(
          prisma.heatmapContribution.create({
            data: {
              userId: callerId,
              type: 'INTEREST',
              sourceId: intent.id,
              cellLat: cell.cellLat,
              cellLng: cell.cellLng,
              cellPrecision: granularity,
              topicId: intent.topicId,
              windowPreset: intent.windowPreset,
              socialScope,
              identityMode,
              expiresAt: intent.expiresAt,
            },
          }),
        );
      }
    }

    const results = await prisma.$transaction(writes);
    if (results.length === 3) {
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
    captureException(error);
    apiLogger.error({ error }, '[SUBCREW_COMMIT] Failed to commit');
    return NextResponse.json(
      { success: false, error: 'Failed to commit' },
      { status: 500 },
    );
  }
}
