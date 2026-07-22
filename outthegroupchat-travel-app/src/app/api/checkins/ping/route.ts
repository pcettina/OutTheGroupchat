import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ============================================
// VALIDATION
// ============================================

const pingSchema = z.object({
  targetUserId: z.string().min(1).optional(),
});

// ============================================
// POST /api/checkins/ping — ping nearby active Crew
// ============================================

/**
 * POST /api/checkins/ping
 *
 * Pings the caller's accepted Crew members who currently have an active
 * check-in (`activeUntil > now()`) — an out-and-about nudge that says
 * "I'm around, let's meet up." Notification recipients are computed the same
 * way the crew check-in feed resolves visible members (accepted Crew, both
 * directions), minus anyone in a mutual block relationship with the caller.
 *
 * "Nearby" here means active-checked-in Crew. When the caller has an active
 * check-in of their own we narrow to the same city (and venue, when present)
 * so the ping targets people who are genuinely out in the same place;
 * otherwise it falls back to all active Crew check-ins. There is no distance
 * math — the codebase has no geo helper.
 *
 * Body (optional): `{ targetUserId?: string }`. When provided the ping is
 * restricted to that single user, who must still be an accepted, non-blocked
 * Crew member with an active check-in — otherwise the request is rejected so a
 * caller cannot ping an arbitrary user.
 *
 * Responds `{ success: true, data: { pinged } }` (200) with the number of
 * distinct users notified; `pinged: 0` when nobody is eligible.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `checkin-ping:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const callerId = session.user.id;

    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      // Empty body is valid — ping all eligible active Crew.
      rawBody = {};
    }

    const parsed = pingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }
    const { targetUserId } = parsed.data;

    // Resolve accepted Crew partner IDs (both directions), matching the feed route.
    const crewRows = await prisma.crew.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: callerId }, { userBId: callerId }],
      },
      select: { userAId: true, userBId: true },
    });
    const crewPartnerIds = crewRows.map((row) =>
      row.userAId === callerId ? row.userBId : row.userAId
    );

    // Mutual block enforcement — exclude anyone the caller has blocked or who
    // has blocked the caller.
    const blocks = await prisma.userBlock.findMany({
      where: { OR: [{ blockerId: callerId }, { blockedId: callerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const hiddenIds = new Set(
      (blocks ?? []).flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== callerId)
    );

    const eligiblePartnerIds = crewPartnerIds.filter((id) => !hiddenIds.has(id));

    if (eligiblePartnerIds.length === 0) {
      logger.info({ callerId }, '[CHECKIN_PING_POST] No eligible Crew to ping');
      return NextResponse.json({ success: true, data: { pinged: 0 } });
    }

    const now = new Date();

    // Optionally narrow to the caller's own most recent active check-in scope
    // (same city, and same venue when present). Nice-to-have — falls back to
    // all active Crew check-ins when the caller has no active check-in.
    const callerActiveCheckIn = await prisma.checkIn.findFirst({
      where: { userId: callerId, activeUntil: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { cityId: true, venueId: true },
    });

    const targetUserIds = targetUserId ? [targetUserId] : eligiblePartnerIds;

    // Guard: an explicit target must be an accepted, non-blocked Crew member.
    if (targetUserId && !eligiblePartnerIds.includes(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'User is not an accepted Crew member' },
        { status: 400 }
      );
    }

    // Find target users who currently have an active check-in.
    const activeCheckIns = await prisma.checkIn.findMany({
      where: {
        userId: { in: targetUserIds },
        activeUntil: { gt: now },
        ...(callerActiveCheckIn?.cityId
          ? { cityId: callerActiveCheckIn.cityId }
          : {}),
        ...(callerActiveCheckIn?.venueId
          ? { venueId: callerActiveCheckIn.venueId }
          : {}),
      },
      select: { userId: true },
    });

    const activeTargetIds = Array.from(new Set(activeCheckIns.map((c) => c.userId)));

    // Explicit target that isn't currently checked in nearby → 404.
    if (targetUserId && activeTargetIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User does not have an active check-in nearby' },
        { status: 404 }
      );
    }

    if (activeTargetIds.length === 0) {
      logger.info({ callerId }, '[CHECKIN_PING_POST] No active Crew to ping');
      return NextResponse.json({ success: true, data: { pinged: 0 } });
    }

    // Fetch the caller's name for the notification message.
    const caller = await prisma.user.findUnique({
      where: { id: callerId },
      select: { name: true },
    });
    const callerName = caller?.name ?? 'Someone in your Crew';

    await prisma.notification.createMany({
      data: activeTargetIds.map((targetId) => ({
        userId: targetId,
        type: 'CREW_CHECKED_IN_NEARBY' as const,
        title: `${callerName} pinged you`,
        message: "They're nearby and want to meet up.",
        data: { kind: 'PING', fromUserId: callerId },
      })),
      skipDuplicates: true,
    });

    logger.info(
      { callerId, pinged: activeTargetIds.length },
      '[CHECKIN_PING_POST] Crew pinged'
    );

    return NextResponse.json({ success: true, data: { pinged: activeTargetIds.length } });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CHECKIN_PING_POST] Failed to ping nearby Crew');
    return NextResponse.json(
      { success: false, error: 'Failed to ping nearby Crew' },
      { status: 500 }
    );
  }
}
