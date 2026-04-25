/**
 * @module api/subcrews/[id]
 * @description GET a single SubCrew + its members.
 *
 * Visibility (R2 — Crew tier):
 *   - Members can always read.
 *   - Crew of any current member can read (so the "I'm in" CTA is reachable).
 *   - Anyone else: 404 (don't leak existence).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
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
    captureException(error);
    apiLogger.error({ error }, '[SUBCREW_GET] Failed to fetch subcrew');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subcrew' },
      { status: 500 },
    );
  }
}
