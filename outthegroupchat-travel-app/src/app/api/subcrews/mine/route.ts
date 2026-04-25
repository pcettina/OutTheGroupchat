/**
 * @module api/subcrews/mine
 * @description GET caller's live SubCrews — those they are a member of,
 * within the SubCrew's window (endAt > now). Used by /intents and the feed
 * to surface the "alignment" cards the user is currently part of.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const querySchema = z.object({
  includeExpired: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

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
      user: { select: { id: true, name: true, image: true } },
    },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `subcrew-mine:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { includeExpired, limit } = parsed.data;
    const callerId = session.user.id;

    const subCrews = await prisma.subCrew.findMany({
      where: {
        members: { some: { userId: callerId } },
        ...(includeExpired ? {} : { endAt: { gt: new Date() } }),
      },
      select: subCrewSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    apiLogger.info(
      { callerId, count: subCrews.length },
      '[SUBCREW_GET_MINE] Listed own subcrews',
    );

    return NextResponse.json({ success: true, data: { subCrews } });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[SUBCREW_GET_MINE] Failed to list subcrews');
    return NextResponse.json(
      { success: false, error: 'Failed to list subcrews' },
      { status: 500 },
    );
  }
}
