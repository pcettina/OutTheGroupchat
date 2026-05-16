/**
 * @module users/notification-preferences
 * @description Notification preferences API — read and update the authenticated
 * user's NotificationPreference rows for V1 Phase 5 ("Get prompted") triggers
 * (DAILY_PROMPT, PER_MEMBER_INTENT, GROUP_FORMATION). Backed by the
 * `NotificationPreference` Prisma model with `@@unique([userId, trigger])`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { NotificationPreferenceTrigger } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const CUID_REGEX = /^c[a-z0-9]{20,}$/i;

const updatePreferenceSchema = z.object({
  trigger: z.enum([
    NotificationPreferenceTrigger.DAILY_PROMPT,
    NotificationPreferenceTrigger.PER_MEMBER_INTENT,
    NotificationPreferenceTrigger.GROUP_FORMATION,
  ]),
  enabled: z.boolean(),
  schedule: z
    .string()
    .regex(TIME_REGEX, 'schedule must be HH:MM (24h)')
    .nullable()
    .optional(),
  perMemberTargets: z
    .array(z.string().regex(CUID_REGEX, 'invalid user id'))
    .max(100, 'perMemberTargets exceeds max length 100')
    .optional(),
});

type PreferenceShape = {
  enabled: boolean;
  schedule: string | null;
  perMemberTargets: string[];
};

const DEFAULT_PREF: PreferenceShape = {
  enabled: false,
  schedule: null,
  perMemberTargets: [],
};

/**
 * GET /api/users/notification-preferences
 * Returns the authenticated user's notification preferences keyed by trigger.
 * Triggers without a stored row are returned with default values
 * (`enabled: false`, `schedule: null`, `perMemberTargets: []`).
 */
export async function GET(_req: NextRequest) {
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

    const rows = await prisma.notificationPreference.findMany({
      where: { userId: session.user.id },
    });

    const preferences: Record<NotificationPreferenceTrigger, PreferenceShape> = {
      [NotificationPreferenceTrigger.DAILY_PROMPT]: { ...DEFAULT_PREF },
      [NotificationPreferenceTrigger.PER_MEMBER_INTENT]: { ...DEFAULT_PREF },
      [NotificationPreferenceTrigger.GROUP_FORMATION]: { ...DEFAULT_PREF },
    };

    for (const row of rows) {
      preferences[row.trigger] = {
        enabled: row.enabled,
        schedule: row.schedule ?? null,
        perMemberTargets: row.perMemberTargets ?? [],
      };
    }

    apiLogger.info(
      { userId: session.user.id, count: rows.length },
      '[NOTIF_PREFS_GET] Returned notification preferences'
    );

    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[NOTIF_PREFS_GET] Failed to retrieve notification preferences');
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve notification preferences' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/notification-preferences
 * Upserts a single NotificationPreference row for the authenticated user
 * keyed by `(userId, trigger)`. On create, all provided fields are written.
 * On update, only the fields supplied in the body are mutated. For
 * `GROUP_FORMATION`, schedule and perMemberTargets are silently ignored
 * since they're not used by that trigger.
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
    const userId = session.user.id;

    // DAILY_PROMPT requires a schedule when being enabled. If enabling and no
    // schedule was provided (and we have no prior row to fall back on), reject.
    if (trigger === NotificationPreferenceTrigger.DAILY_PROMPT && enabled) {
      const existing = await prisma.notificationPreference.findUnique({
        where: { userId_trigger: { userId, trigger } },
        select: { schedule: true },
      });
      const effectiveSchedule = schedule ?? existing?.schedule ?? null;
      if (!effectiveSchedule) {
        return NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: { schedule: 'schedule is required for DAILY_PROMPT when enabled' },
          },
          { status: 400 }
        );
      }
    }

    // GROUP_FORMATION ignores schedule + perMemberTargets per spec.
    const isGroupFormation = trigger === NotificationPreferenceTrigger.GROUP_FORMATION;

    // PER_MEMBER_INTENT is the only trigger that meaningfully uses
    // perMemberTargets. For DAILY_PROMPT we let it pass through as well in
    // case the client sends an empty array, but never persist it for GROUP_FORMATION.
    const includeSchedule = !isGroupFormation && schedule !== undefined;
    const includeTargets =
      trigger === NotificationPreferenceTrigger.PER_MEMBER_INTENT &&
      perMemberTargets !== undefined;

    const updateData: {
      enabled: boolean;
      schedule?: string | null;
      perMemberTargets?: string[];
    } = { enabled };
    if (includeSchedule) updateData.schedule = schedule ?? null;
    if (includeTargets) updateData.perMemberTargets = perMemberTargets ?? [];

    const createData = {
      userId,
      trigger,
      enabled,
      schedule: includeSchedule ? schedule ?? null : null,
      perMemberTargets: includeTargets ? perMemberTargets ?? [] : [],
    };

    const preference = await prisma.notificationPreference.upsert({
      where: { userId_trigger: { userId, trigger } },
      create: createData,
      update: updateData,
    });

    apiLogger.info(
      { userId, trigger, enabled },
      '[NOTIF_PREFS_PATCH] Updated notification preference'
    );

    return NextResponse.json({
      success: true,
      preference: {
        trigger: preference.trigger,
        enabled: preference.enabled,
        schedule: preference.schedule ?? null,
        perMemberTargets: preference.perMemberTargets ?? [],
        updatedAt: preference.updatedAt,
      },
    });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[NOTIF_PREFS_PATCH] Failed to update notification preference');
    return NextResponse.json(
      { success: false, error: 'Failed to update notification preference' },
      { status: 500 }
    );
  }
}
