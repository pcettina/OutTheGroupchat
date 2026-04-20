import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

type RouteParams = { params: { id: string } };

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
