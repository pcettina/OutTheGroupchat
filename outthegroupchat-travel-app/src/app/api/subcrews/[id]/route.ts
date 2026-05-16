/**
 * @module api/subcrews/[id]
 * @description GET + PATCH a single SubCrew.
 *
 * Visibility (R2 — Crew tier):
 *   - Members can always read.
 *   - Crew of any current member can read (so the "I'm in" CTA is reachable).
 *   - Anyone else: 404 (don't leak existence).
 *
 * Edit (PATCH): SEED members only. Phase 3 — used to freeze startAt/endAt
 * (per the V1 plan: "the seed manually sets a time") and bind a venue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

type RouteParams = { params: { id: string } };

const subCrewSelect = {
  id: true,
  topicId: true,
  windowPreset: true,
  startAt: true,
  endAt: true,
  cityArea: true,
  venueId: true,
  meetupId: true,
  createdAt: true,
  topic: { select: { id: true, slug: true, displayName: true } },
  members: {
    select: {
      id: true,
      userId: true,
      joinMode: true,
      joinedAt: true,
      intentId: true,
      user: { select: { id: true, name: true, image: true } },
    },
  },
} as const;

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `subcrew-get:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const { id } = context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'SubCrew id required' }, { status: 400 });
    }

    const callerId = session.user.id;

    const subCrew = await prisma.subCrew.findUnique({
      where: { id },
      select: subCrewSelect,
    });

    if (!subCrew) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const memberIds = subCrew.members.map((m) => m.userId);
    const isMember = memberIds.includes(callerId);

    let canSee = isMember;
    if (!canSee) {
      const crewLink = await prisma.crew.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { userAId: callerId, userBId: { in: memberIds } },
            { userBId: callerId, userAId: { in: memberIds } },
          ],
        },
        select: { id: true },
      });
      canSee = crewLink !== null;
    }

    if (!canSee) {
      // 404 not 403 — don't leak existence to non-Crew viewers.
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { subCrew, viewerIsMember: isMember },
    });
  } catch (error) {
    captureException(error, { route: 'api/subcrews/[id]', method: 'GET' });
    apiLogger.error({ error }, '[SUBCREW_GET] Failed to fetch subcrew');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subcrew' },
      { status: 500 },
    );
  }
}

const patchSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),
    venueId: z.string().cuid().nullable().optional(),
    cityArea: z.string().min(1).max(100).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'At least one field to update is required',
  });

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `subcrew-patch:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const { id } = context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'SubCrew id required' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Seed-only: confirm caller is a SEED member.
    const seedMembership = await prisma.subCrewMember.findFirst({
      where: { subCrewId: id, userId: session.user.id, joinMode: 'SEED' },
      select: { id: true },
    });
    if (!seedMembership) {
      // 404 (not 403) keeps existence non-leaking to outsiders.
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.startAt !== undefined) updateData.startAt = new Date(data.startAt);
    if (data.endAt !== undefined) updateData.endAt = new Date(data.endAt);
    if (data.venueId !== undefined) updateData.venueId = data.venueId;
    if (data.cityArea !== undefined) updateData.cityArea = data.cityArea;

    if (
      typeof updateData.startAt === 'object' &&
      typeof updateData.endAt === 'object' &&
      updateData.startAt instanceof Date &&
      updateData.endAt instanceof Date &&
      updateData.endAt.getTime() <= updateData.startAt.getTime()
    ) {
      return NextResponse.json(
        { success: false, error: 'endAt must be after startAt' },
        { status: 400 },
      );
    }

    const updated = await prisma.subCrew.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        venueId: true,
        cityArea: true,
      },
    });

    apiLogger.info(
      { subCrewId: id, callerId: session.user.id, fields: Object.keys(updateData) },
      '[SUBCREW_PATCH] SubCrew updated by seed',
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    captureException(error, { route: 'api/subcrews/[id]', method: 'PATCH' });
    apiLogger.error({ error }, '[SUBCREW_PATCH] Failed to update subcrew');
    return NextResponse.json(
      { success: false, error: 'Failed to update subcrew' },
      { status: 500 },
    );
  }
}
