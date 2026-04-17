import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const userPreviewSelect = {
  id: true,
  name: true,
  image: true,
  city: true,
  crewLabel: true,
} as const;

/**
 * GET /api/crew
 * List the authenticated user's accepted Crew.
 * Each row is returned with userA, userB, and requestedBy previews so the UI
 * can render "the other user" from the caller's perspective.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `crew-list:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { page, pageSize } = parsed.data;
    const userId = session.user.id;

    const where = {
      status: 'ACCEPTED' as const,
      OR: [{ userAId: userId }, { userBId: userId }],
    };

    const [crews, total] = await Promise.all([
      prisma.crew.findMany({
        where,
        include: {
          userA: { select: userPreviewSelect },
          userB: { select: userPreviewSelect },
          requestedBy: { select: userPreviewSelect },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.crew.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: crews,
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      },
    });
  } catch (error) {
    captureException(error);
    logger.error({ error }, '[CREW_GET] Failed to list crew');
    return NextResponse.json(
      { success: false, error: 'Failed to list Crew' },
      { status: 500 }
    );
  }
}
