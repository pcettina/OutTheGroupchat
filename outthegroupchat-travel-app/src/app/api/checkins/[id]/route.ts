import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

type RouteParams = { params: { id: string } };

const userSelect = { id: true, name: true, image: true } as const;
const venueSelect = { id: true, name: true, city: true, category: true } as const;

/**
 * GET /api/checkins/[id]
 * Fetch a single check-in by ID, gated by visibility:
 * - PUBLIC: any authenticated user
 * - CREW: only accepted Crew members of the poster (or the poster themselves)
 * - PRIVATE: only the poster
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `checkin-detail:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const { id } = params;
    const callerId = session.user.id;

    const checkIn = await prisma.checkIn.findUnique({
      where: { id },
      include: { user: { select: userSelect }, venue: { select: venueSelect } },
    });

    if (!checkIn) {
      return NextResponse.json({ success: false, error: 'Check-in not found' }, { status: 404 });
    }

    if (checkIn.visibility === 'PUBLIC' || checkIn.userId === callerId) {
      return NextResponse.json({ success: true, data: checkIn });
    }

    if (checkIn.visibility === 'CREW') {
      const crewRow = await prisma.crew.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { userAId: callerId, userBId: checkIn.userId },
            { userAId: checkIn.userId, userBId: callerId },
          ],
        },
      });
      if (crewRow) {
        return NextResponse.json({ success: true, data: checkIn });
      }
    }

    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CHECKIN_DETAIL_GET] Failed to fetch check-in');
    return NextResponse.json({ success: false, error: 'Failed to fetch check-in' }, { status: 500 });
  }
}

/**
 * DELETE /api/checkins/[id]
 * Cancel (delete) the caller's own check-in.
 * Only the user who created the check-in may delete it.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `checkins-delete:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const checkIn = await prisma.checkIn.findUnique({ where: { id } });
    if (!checkIn) {
      return NextResponse.json(
        { success: false, error: 'Check-in not found' },
        { status: 404 }
      );
    }

    if (checkIn.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await prisma.checkIn.delete({ where: { id } });

    logger.info({ checkInId: id, userId }, '[CHECKINS_DELETE] Check-in cancelled');

    return NextResponse.json({ success: true, message: 'Check-in cancelled' });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CHECKINS_DELETE] Failed to delete check-in');
    return NextResponse.json(
      { success: false, error: 'Failed to cancel check-in' },
      { status: 500 }
    );
  }
}
