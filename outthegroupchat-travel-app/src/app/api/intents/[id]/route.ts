/**
 * @module api/intents/[id]
 * @description Per-Intent operations.
 *
 * PATCH  → edit window/cityArea/venueId, or transition INTERESTED → COMMITTED
 *          (Phase 3 will tie the COMMITTED transition to the 3-axis privacy
 *           picker; here we accept the state transition but persist no
 *           privacy metadata yet).
 * DELETE → owner-only manual expiry. Marks the Intent expired by setting
 *          `expiresAt` to the current instant; no row deletion (audit trail).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { IntentState, WindowPreset } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { resolveIntentWindow, MAX_DAY_OFFSET } from '@/lib/intent/window-preset';

const patchSchema = z
  .object({
    state: z.nativeEnum(IntentState).optional(),
    windowPreset: z.nativeEnum(WindowPreset).optional(),
    dayOffset: z.number().int().min(0).max(MAX_DAY_OFFSET).optional(),
    startAt: z.string().datetime({ offset: true }).nullable().optional(),
    endAt: z.string().datetime({ offset: true }).nullable().optional(),
    cityArea: z.string().min(1).max(100).nullable().optional(),
    venueId: z.string().cuid().nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'At least one field to update is required',
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

type RouteParams = { params: { id: string } };

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `intent-patch:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const { id } = context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Intent id required' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.intent.findUnique({
      where: { id },
      select: {
        userId: true,
        windowPreset: true,
        dayOffset: true,
        startAt: true,
        endAt: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Intent not found' }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const data = parsed.data;
    const windowChanged =
      data.windowPreset !== undefined ||
      data.dayOffset !== undefined ||
      data.startAt !== undefined ||
      data.endAt !== undefined;

    let nextExpiresAt: Date | undefined;
    let nextStartAt: Date | null | undefined;
    let nextEndAt: Date | null | undefined;

    if (windowChanged) {
      const preset = data.windowPreset ?? existing.windowPreset;
      const dayOffset = data.dayOffset ?? existing.dayOffset;
      const startOverride =
        data.startAt === undefined
          ? existing.startAt
          : data.startAt === null
            ? null
            : new Date(data.startAt);
      const endOverride =
        data.endAt === undefined
          ? existing.endAt
          : data.endAt === null
            ? null
            : new Date(data.endAt);

      let resolved;
      try {
        resolved = resolveIntentWindow({
          preset,
          dayOffset,
          startAtOverride: startOverride,
          endAtOverride: endOverride,
        });
      } catch (err) {
        return NextResponse.json(
          { success: false, error: err instanceof Error ? err.message : 'Invalid window' },
          { status: 400 },
        );
      }

      nextExpiresAt = resolved.expiresAt;
      nextStartAt = startOverride === null ? null : resolved.startAt;
      nextEndAt = endOverride === null ? null : resolved.endAt;
    }

    const updated = await prisma.intent.update({
      where: { id },
      data: {
        ...(data.state !== undefined ? { state: data.state } : {}),
        ...(data.windowPreset !== undefined ? { windowPreset: data.windowPreset } : {}),
        ...(data.dayOffset !== undefined ? { dayOffset: data.dayOffset } : {}),
        ...(nextStartAt !== undefined ? { startAt: nextStartAt } : {}),
        ...(nextEndAt !== undefined ? { endAt: nextEndAt } : {}),
        ...(nextExpiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
        ...(data.cityArea !== undefined ? { cityArea: data.cityArea } : {}),
        ...(data.venueId !== undefined ? { venueId: data.venueId } : {}),
      },
      select: intentSelect,
    });

    apiLogger.info(
      { intentId: id, userId: session.user.id, fields: Object.keys(data) },
      '[INTENT_PATCH] Intent updated',
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    captureException(error, { route: '/api/intents/[id]', method: 'PATCH' });
    apiLogger.error({ error }, '[INTENT_PATCH] Failed to update intent');
    return NextResponse.json(
      { success: false, error: 'Failed to update intent' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `intent-delete:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const { id } = context.params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Intent id required' }, { status: 400 });
    }

    const existing = await prisma.intent.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Intent not found' }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const expired = await prisma.intent.update({
      where: { id },
      data: { expiresAt: new Date() },
      select: { id: true, expiresAt: true },
    });

    apiLogger.info(
      { intentId: id, userId: session.user.id },
      '[INTENT_DELETE] Intent manually expired',
    );

    return NextResponse.json({ success: true, data: expired });
  } catch (error) {
    captureException(error, { route: '/api/intents/[id]', method: 'DELETE' });
    apiLogger.error({ error }, '[INTENT_DELETE] Failed to expire intent');
    return NextResponse.json(
      { success: false, error: 'Failed to expire intent' },
      { status: 500 },
    );
  }
}
