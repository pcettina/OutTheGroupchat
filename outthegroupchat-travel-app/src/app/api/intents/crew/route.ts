/**
 * @module api/intents/crew
 * @description GET live Intents from the caller's accepted Crew (R2 — Crew tier).
 *
 * Visibility scope: caller sees Intents whose userId is in their ACCEPTED Crew
 * set, are not expired, and are still INTERESTED. COMMITTED Intents are filtered
 * by default — they're privacy-tagged per R20 and surface through the per-event
 * heatmap (Phase 4), not the Crew feed.
 *
 * Query params:
 *   topicId    — optional, narrow to one Topic
 *   limit      — default 50, max 100
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
  topicId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const intentSelect = {
  id: true,
  userId: true,
  topicId: true,
  windowPreset: true,
  startAt: true,
  endAt: true,
  dayOffset: true,
  state: true,
  cityArea: true,
  venueId: true,
  expiresAt: true,
  createdAt: true,
  user: { select: { id: true, name: true, image: true } },
  topic: { select: { id: true, slug: true, displayName: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `intent-crew:${session.user.id}`);
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

    const { topicId, limit } = parsed.data;
    const callerId = session.user.id;

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
      return NextResponse.json({ success: true, data: { intents: [] } });
    }

    const intents = await prisma.intent.findMany({
      where: {
        userId: { in: crewIds },
        state: 'INTERESTED',
        expiresAt: { gt: new Date() },
        ...(topicId ? { topicId } : {}),
      },
      select: intentSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    apiLogger.info(
      { callerId, crewCount: crewIds.length, count: intents.length },
      '[INTENT_GET_CREW] Listed crew intents',
    );

    return NextResponse.json({ success: true, data: { intents } });
  } catch (error) {
    captureException(error, { route: '/api/intents/crew', method: 'GET' });
    apiLogger.error({ error }, '[INTENT_GET_CREW] Failed to list crew intents');
    return NextResponse.json(
      { success: false, error: 'Failed to list crew intents' },
      { status: 500 },
    );
  }
}
