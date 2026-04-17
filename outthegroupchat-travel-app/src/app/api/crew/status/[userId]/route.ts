import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

type RouteParams = { params: { userId: string } };

/**
 * GET /api/crew/status/[userId]
 * Returns the Crew relationship between the authenticated caller and userId.
 * Used by `<CrewButton>` to render the correct button state on profile pages.
 *
 * Response shape:
 *   { success, data: {
 *     status: CrewStatus | 'NOT_IN_CREW' | 'SELF',
 *     crewId: string | null,
 *     iAmRequester: boolean
 *   }}
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `crew-status:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const me = session.user.id;
    const { userId } = params;

    if (me === userId) {
      return NextResponse.json({
        success: true,
        data: { status: 'SELF' as const, crewId: null, iAmRequester: false },
      });
    }

    const [userAId, userBId] = me < userId ? [me, userId] : [userId, me];
    const row = await prisma.crew.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    if (!row) {
      return NextResponse.json({
        success: true,
        data: { status: 'NOT_IN_CREW' as const, crewId: null, iAmRequester: false },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: row.status,
        crewId: row.id,
        iAmRequester: row.requestedById === me,
      },
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CREW_STATUS_GET] Failed to fetch crew status');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Crew status' },
      { status: 500 }
    );
  }
}
