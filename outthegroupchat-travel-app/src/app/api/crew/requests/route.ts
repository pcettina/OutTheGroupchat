import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const userPreviewSelect = {
  id: true,
  name: true,
  image: true,
  city: true,
  crewLabel: true,
} as const;

/**
 * GET /api/crew/requests
 * Return pending Crew requests split into `incoming` (where the caller is
 * NOT the requestedBy) and `sent` (where the caller IS the requestedBy).
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `crew-requests:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const userId = session.user.id;

    const pending = await prisma.crew.findMany({
      where: {
        status: 'PENDING',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: { select: userPreviewSelect },
        userB: { select: userPreviewSelect },
        requestedBy: { select: userPreviewSelect },
      },
      orderBy: { createdAt: 'desc' },
    });

    const incoming = pending.filter((crew) => crew.requestedById !== userId);
    const sent = pending.filter((crew) => crew.requestedById === userId);

    return NextResponse.json({
      success: true,
      data: {
        incoming,
        sent,
        incomingCount: incoming.length,
        sentCount: sent.length,
      },
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CREW_REQUESTS_GET] Failed to list crew requests');
    return NextResponse.json(
      { success: false, error: 'Failed to list Crew requests' },
      { status: 500 }
    );
  }
}
