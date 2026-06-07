import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { NotificationPreferenceTrigger } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import type {
  NotificationPreferenceResponse,
} from '@/types/notification-preference';

// ============================================
// CONSTANTS
// ============================================

/** All triggers the GET endpoint must always return, defaulted when absent. */
const ALL_TRIGGERS: NotificationPreferenceTrigger[] = [
  NotificationPreferenceTrigger.DAILY_PROMPT,
  NotificationPreferenceTrigger.PER_MEMBER_INTENT,
  NotificationPreferenceTrigger.GROUP_FORMATION,
];

// ============================================
// SCHEMA DEFINITIONS
// ============================================

/** "HH:mm" 24-hour time, e.g. "09:00" — only meaningful for DAILY_PROMPT. */
const SCHEDULE_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const updatePreferenceSchema = z.object({
  trigger: z.nativeEnum(NotificationPreferenceTrigger),
  enabled: z.boolean(),
  schedule: z
    .string()
    .regex(SCHEDULE_REGEX, 'schedule must be HH:mm 24-hour time')
    .optional(),
  perMemberTargets: z.array(z.string()).optional(),
});

// ============================================
// HELPERS
// ============================================

/** Default (opted-out) preference for a trigger with no stored row. */
function defaultPreference(
  trigger: NotificationPreferenceTrigger
): NotificationPreferenceResponse {
  return {
    trigger,
    enabled: false,
    schedule: null,
    perMemberTargets: [],
  };
}

// ============================================
// GET /api/users/notification-preferences
// ============================================

/**
 * GET /api/users/notification-preferences
 * Returns the authenticated user's preferences for all three triggers.
 * Triggers without a stored row are returned as opted-out defaults.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `notif-prefs-get:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    const callerId = session.user.id;

    const rows = await prisma.notificationPreference.findMany({
      where: { userId: callerId },
    });

    const byTrigger = new Map<NotificationPreferenceTrigger, NotificationPreferenceResponse>();
    for (const row of rows) {
      byTrigger.set(row.trigger, {
        trigger: row.trigger,
        enabled: row.enabled,
        schedule: row.schedule,
        perMemberTargets: row.perMemberTargets,
      });
    }

    const preferences: NotificationPreferenceResponse[] = ALL_TRIGGERS.map(
      (trigger) => byTrigger.get(trigger) ?? defaultPreference(trigger)
    );

    apiLogger.info(
      { callerId, count: preferences.length },
      '[NOTIF_PREFS_GET] Listed notification preferences'
    );

    return NextResponse.json({ success: true, data: { preferences } });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[NOTIF_PREFS_GET] Failed to list notification preferences');
    return NextResponse.json(
      { success: false, error: 'Failed to list notification preferences' },
      { status: 500 }
    );
  }
}

// ============================================
// PATCH /api/users/notification-preferences
// ============================================

/**
 * PATCH /api/users/notification-preferences
 * Upserts a single trigger's preference for the authenticated user, keyed on
 * the (userId, trigger) unique constraint.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `notif-prefs-patch:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = updatePreferenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { trigger, enabled, schedule, perMemberTargets } = parsed.data;
    const callerId = session.user.id;

    const row = await prisma.notificationPreference.upsert({
      where: { userId_trigger: { userId: callerId, trigger } },
      create: {
        userId: callerId,
        trigger,
        enabled,
        schedule: schedule ?? null,
        perMemberTargets: perMemberTargets ?? [],
      },
      update: {
        enabled,
        ...(schedule !== undefined ? { schedule } : {}),
        ...(perMemberTargets !== undefined ? { perMemberTargets } : {}),
      },
    });

    const data: NotificationPreferenceResponse = {
      trigger: row.trigger,
      enabled: row.enabled,
      schedule: row.schedule,
      perMemberTargets: row.perMemberTargets,
    };

    apiLogger.info(
      { callerId, trigger: row.trigger, enabled: row.enabled },
      '[NOTIF_PREFS_PATCH] Upserted notification preference'
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[NOTIF_PREFS_PATCH] Failed to update notification preference');
    return NextResponse.json(
      { success: false, error: 'Failed to update notification preference' },
      { status: 500 }
    );
  }
}
