/**
 * @module api/subcrews/[id]/join
 * @description "I'm in" — appends the caller to a SubCrew with
 * `joinMode = JOINED_VIA_IM_IN`. Per R21, joining is open to any Crew of an
 * existing member; no approval needed.
 *
 * Validation:
 *   - Caller must not already be a member.
 *   - Caller must be Crew of at least one current member.
 *   - Caller's matching live INTERESTED Intent (same topic, adjacent preset)
 *     is auto-attached when present; otherwise the join still proceeds with
 *     `intentId = null` (R21: "open — no approval needed").
 *
 * Side effects:
 *   - Fires SUBCREW_JOINED notifications to all existing members.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { adjacentPresets } from '@/lib/subcrew/window-adjacency';

type RouteParams = { params: { id: string } };

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `subcrew-join:${session.user.id}`);
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
      select: {
        id: true,
        topicId: true,
        windowPreset: true,
        members: { select: { userId: true } },
      },
    });

    if (!subCrew) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const memberIds = subCrew.members.map((m) => m.userId);
    if (memberIds.includes(callerId)) {
      return NextResponse.json(
        { success: false, error: 'Already a member' },
        { status: 409 },
      );
    }

    // Visibility/join-eligibility = Crew of any current member.
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

    if (!crewLink) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Best-effort attach of the caller's existing matching Intent.
    const matchingIntent = await prisma.intent.findFirst({
      where: {
        userId: callerId,
        topicId: subCrew.topicId,
        windowPreset: { in: adjacentPresets(subCrew.windowPreset) },
        state: 'INTERESTED',
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    const member = await prisma.subCrewMember.create({
      data: {
        subCrewId: subCrew.id,
        userId: callerId,
        intentId: matchingIntent?.id ?? null,
        joinMode: 'JOINED_VIA_IM_IN',
      },
      select: { id: true, joinedAt: true },
    });

    // Notify existing members.
    const callerName = session.user.name ?? 'Someone in your Crew';
    await prisma.notification.createMany({
      data: memberIds.map((mid) => ({
        userId: mid,
        type: 'SUBCREW_JOINED' as const,
        title: 'Someone joined your SubCrew',
        message: `${callerName} tapped "I'm in".`,
        data: { subCrewId: subCrew.id, joinerUserId: callerId } as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });

    apiLogger.info(
      { subCrewId: subCrew.id, callerId, attachedIntentId: matchingIntent?.id ?? null },
      '[SUBCREW_JOIN] Member added',
    );

    return NextResponse.json(
      { success: true, data: { memberId: member.id, joinedAt: member.joinedAt } },
      { status: 201 },
    );
  } catch (error) {
    captureException(error, { route: 'api/subcrews/[id]/join', method: 'POST' });
    apiLogger.error({ error }, '[SUBCREW_JOIN] Failed to join subcrew');
    return NextResponse.json(
      { success: false, error: 'Failed to join subcrew' },
      { status: 500 },
    );
  }
}
