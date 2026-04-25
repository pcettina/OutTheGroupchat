/**
 * @module api/intents
 * @description V1 Phase 1 — Journey A "Signal intent" entry point.
 *
 * POST /api/intents
 *   Creates an INTERESTED Intent for the authenticated user. Runs
 *   `classifyIntentText(rawText)` to resolve a Topic. If the classifier returns
 *   no match the response carries `needsTopicPicker: true` so the UI can prompt
 *   the user to pick manually (a follow-up POST may include `topicId` directly).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { WindowPreset } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { classifyIntentText } from '@/lib/intent/topic-classifier';
import { resolveIntentWindow, MAX_DAY_OFFSET } from '@/lib/intent/window-preset';

const createIntentSchema = z
  .object({
    rawText: z.string().trim().min(1).max(280).optional(),
    topicId: z.string().cuid().optional(),
    windowPreset: z.nativeEnum(WindowPreset),
    dayOffset: z.number().int().min(0).max(MAX_DAY_OFFSET).default(0),
    startAt: z.string().datetime({ offset: true }).optional(),
    endAt: z.string().datetime({ offset: true }).optional(),
    cityArea: z.string().min(1).max(100).optional(),
    venueId: z.string().cuid().optional(),
  })
  .refine((d) => d.rawText !== undefined || d.topicId !== undefined, {
    message: 'Either rawText (for classification) or topicId (manual pick) is required',
    path: ['rawText'],
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
} as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `intent-create:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = createIntentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      rawText,
      topicId: explicitTopicId,
      windowPreset,
      dayOffset,
      startAt,
      endAt,
      cityArea,
      venueId,
    } = parsed.data;
    const callerId = session.user.id;

    let topicId = explicitTopicId ?? null;
    let matchedKeywords: string[] = [];

    if (!topicId && rawText) {
      const classification = await classifyIntentText(rawText, prisma);
      topicId = classification.topicId;
      matchedKeywords = classification.matchedKeywords;
    }

    if (!topicId) {
      return NextResponse.json(
        {
          success: false,
          needsTopicPicker: true,
          message: 'Could not infer a Topic — please pick one manually.',
        },
        { status: 422 },
      );
    }

    let window;
    try {
      window = resolveIntentWindow({
        preset: windowPreset,
        dayOffset,
        startAtOverride: startAt ? new Date(startAt) : null,
        endAtOverride: endAt ? new Date(endAt) : null,
      });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Invalid window' },
        { status: 400 },
      );
    }

    const intent = await prisma.intent.create({
      data: {
        userId: callerId,
        topicId,
        windowPreset,
        startAt: startAt ? window.startAt : null,
        endAt: endAt ? window.endAt : null,
        dayOffset,
        cityArea,
        venueId,
        rawText: rawText ?? null,
        expiresAt: window.expiresAt,
      },
      select: intentSelect,
    });

    apiLogger.info(
      { intentId: intent.id, userId: callerId, topicId, matchedKeywords },
      '[INTENT_POST] Intent created',
    );

    return NextResponse.json(
      { success: true, data: intent, matchedKeywords },
      { status: 201 },
    );
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[INTENT_POST] Failed to create intent');
    return NextResponse.json(
      { success: false, error: 'Failed to create intent' },
      { status: 500 },
    );
  }
}
