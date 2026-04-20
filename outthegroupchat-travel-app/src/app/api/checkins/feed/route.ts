import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ============================================
// HELPERS
// ============================================

const FEED_LIMIT = 50;

const userSelect = {
  id: true,
  name: true,
  image: true,
} as const;

const venueSelect = {
  id: true,
  name: true,
  city: true,
  category: true,
} as const;

// ============================================
// GET /api/checkins/feed — crew check-in feed
// ============================================

/**
 * GET /api/checkins/feed
 * Returns the active check-ins from the caller's accepted Crew members.
 * Only includes check-ins where activeUntil > now().
 * Ordered newest first, limited to 50 results.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `checkin-feed:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const callerId = session.user.id;

    // Resolve accepted Crew partner IDs
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

    const now = new Date();

    // Include: PUBLIC check-ins from anyone in crew, CREW check-ins (already scoped to crew), own PRIVATE
    const checkIns = await prisma.checkIn.findMany({
      where: {
        activeUntil: { gt: now },
        OR: [
          // Own check-ins (any visibility)
          { userId: callerId },
          // Crew member PUBLIC check-ins
          { userId: { in: crewPartnerIds }, visibility: 'PUBLIC' },
          // Crew member CREW check-ins (caller is a Crew member of poster by construction)
          { userId: { in: crewPartnerIds }, visibility: 'CREW' },
        ],
      },
      include: {
        user: { select: userSelect },
        venue: { select: venueSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: FEED_LIMIT,
    });

    logger.info(
      { callerId, crewCount: crewPartnerIds.length, resultCount: checkIns.length },
      '[CHECKIN_FEED_GET] Crew check-in feed retrieved'
    );

    return NextResponse.json({ success: true, data: checkIns });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CHECKIN_FEED_GET] Failed to retrieve check-in feed');
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve check-in feed' },
      { status: 500 }
    );
  }
}
