/**
 * @module api/subcrews/emerging
 * @description SubCrews the caller can join — i.e. they are Crew of at least
 * one current member, are not themselves a member, and the SubCrew is still
 * within its window. Powers the feed "Crew aligned around X — I'm in?" card.
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
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const subCrewSelect = {
  id: true,
  topicId: true,
  windowPreset: true,
  startAt: true,
  endAt: true,
  cityArea: true,
  createdAt: true,
  topic: { select: { id: true, slug: true, displayName: true } },
  members: {
    select: {
      id: true,
      userId: true,
      joinMode: true,
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

    const rl = await checkRateLimit(apiRateLimiter, `subcrew-emerging:${session.user.id}`);
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

    const { limit } = parsed.data;
    const callerId = session.user.id;

    // Resolve caller's accepted Crew partners.
    const crewRows = await prisma.crew.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: callerId }, { userBId: callerId }],
      },
      select: { userAId: true, userBId: true },
    });

    const crewIds = crewRows.map((row) =>
      row.userAId === callerId ? row.userBId : row.userAId,
    );

    if (crewIds.length === 0) {
      return NextResponse.json({ success: true, data: { subCrews: [] } });
    }

    const subCrews = await prisma.subCrew.findMany({
      where: {
        endAt: { gt: new Date() },
        // At least one Crew partner is a member …
        members: { some: { userId: { in: crewIds } } },
        // … and the caller is NOT already a member.
        NOT: { members: { some: { userId: callerId } } },
      },
      select: subCrewSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    apiLogger.info(
      { callerId, count: subCrews.length },
      '[SUBCREW_EMERGING] Listed joinable subcrews',
    );

    return NextResponse.json({ success: true, data: { subCrews } });
  } catch (error) {
    captureException(error, { route: 'api/subcrews/emerging', method: 'GET' });
    apiLogger.error({ error }, '[SUBCREW_EMERGING] Failed to list emerging subcrews');
    return NextResponse.json(
      { success: false, error: 'Failed to list emerging subcrews' },
      { status: 500 },
    );
  }
}
