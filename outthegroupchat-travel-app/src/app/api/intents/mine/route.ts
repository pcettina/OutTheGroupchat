/**
 * @module api/intents/mine
 * @description GET caller's own live Intents (state in scope, not yet expired).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { IntentState } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

const querySchema = z.object({
  state: z.nativeEnum(IntentState).optional(),
  includeExpired: z.coerce.boolean().default(false),
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
  rawText: true,
  expiresAt: true,
  createdAt: true,
  topic: { select: { id: true, slug: true, displayName: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `intent-mine:${session.user.id}`);
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

    const { state, includeExpired, limit } = parsed.data;
    const callerId = session.user.id;

    const intents = await prisma.intent.findMany({
      where: {
        userId: callerId,
        ...(state ? { state } : {}),
        ...(includeExpired ? {} : { expiresAt: { gt: new Date() } }),
      },
      select: intentSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    apiLogger.info(
      { callerId, count: intents.length },
      '[INTENT_GET_MINE] Listed own intents',
    );

    return NextResponse.json({ success: true, data: { intents } });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[INTENT_GET_MINE] Failed to list intents');
    return NextResponse.json(
      { success: false, error: 'Failed to list intents' },
      { status: 500 },
    );
  }
}
