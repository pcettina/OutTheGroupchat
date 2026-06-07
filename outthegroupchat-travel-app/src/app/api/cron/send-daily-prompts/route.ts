/**
 * @module cron/send-daily-prompts
 * @description V1 Phase 5 daily-prompt cron (R8).
 *
 * Sends a "What should we get up to today?" notification to users who have
 * opted into the DAILY_PROMPT trigger via NotificationPreference. Each
 * notification deep-links to `/intents/new` so the recipient can immediately
 * signal a Topic.
 *
 * Idempotency is enforced *without* a new schema field: before insert we
 * filter the candidate list against any DAILY_PROMPT-equivalent Notification
 * row created since the start of the current UTC day. This means re-running
 * the cron on the same UTC day is a no-op for users who already received it.
 *
 * Scheduled via Vercel Cron (see vercel.json) once a day at 13:00 UTC
 * (~9am ET). Hobby tier only permits daily schedules — sub-daily would
 * fail vercel.json validation. Per-user `schedule` field on
 * NotificationPreference is reserved for v1.5 fan-out and intentionally
 * ignored here. Vercel Cron issues GET requests only; this handler responds
 * to GET and is protected by `CRON_SECRET` bearer auth to mirror the
 * existing `/api/cron/expire-intents` pattern.
 *
 * NotificationType: schema does not yet define DAILY_PROMPT — using `SYSTEM`
 * as the closest existing fit (generic system-issued notification). When a
 * dedicated DAILY_PROMPT type lands in NotificationType, swap it here.
 *
 * Per-row failures are logged with apiLogger.warn and skipped — a single bad
 * preference row does not abort the whole batch. Top-level failures are
 * captured to Sentry.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

const NOTIFICATION_TYPE = 'SYSTEM' as const;
const PROMPT_TITLE = 'What should we get up to today?';
const PROMPT_MESSAGE =
  "Tap to signal what you're in the mood for — your Crew can match in.";
const PROMPT_LINK = '/intents/new';

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      apiLogger.error(
        { context: 'CRON_SEND_DAILY_PROMPTS' },
        'CRON_SECRET env var not set',
      );
      return NextResponse.json(
        { error: 'Cron configuration error' },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      apiLogger.warn({ context: 'CRON_SEND_DAILY_PROMPTS' }, 'Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const startOfDayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const prefs = await prisma.notificationPreference.findMany({
      where: { trigger: 'DAILY_PROMPT', enabled: true },
      select: { userId: true },
    });

    const candidateUserIds = Array.from(new Set(prefs.map((p) => p.userId)));
    const candidateCount = candidateUserIds.length;

    if (candidateCount === 0) {
      apiLogger.info(
        { context: 'CRON_SEND_DAILY_PROMPTS', candidateCount: 0 },
        'No DAILY_PROMPT opt-ins; nothing to send',
      );
      return NextResponse.json({
        success: true,
        candidateCount: 0,
        sentCount: 0,
        skippedDuplicates: 0,
      });
    }

    // Idempotency: skip users already sent today (UTC).
    const alreadySent = await prisma.notification.findMany({
      where: {
        userId: { in: candidateUserIds },
        type: NOTIFICATION_TYPE,
        title: PROMPT_TITLE,
        createdAt: { gte: startOfDayUtc },
      },
      select: { userId: true },
    });
    const alreadySentSet = new Set(alreadySent.map((n) => n.userId));
    const toSendUserIds = candidateUserIds.filter(
      (id) => !alreadySentSet.has(id),
    );
    const skippedDuplicates = candidateCount - toSendUserIds.length;

    let sentCount = 0;
    if (toSendUserIds.length > 0) {
      try {
        const result = await prisma.notification.createMany({
          data: toSendUserIds.map((userId) => ({
            userId,
            type: NOTIFICATION_TYPE,
            title: PROMPT_TITLE,
            message: PROMPT_MESSAGE,
            data: { link: PROMPT_LINK, source: 'DAILY_PROMPT' },
          })),
          skipDuplicates: true,
        });
        sentCount = result.count;
      } catch (bulkError) {
        // Fall back to per-row inserts so a single bad row doesn't kill the batch.
        apiLogger.warn(
          { context: 'CRON_SEND_DAILY_PROMPTS', error: bulkError },
          'Bulk createMany failed; falling back to per-row inserts',
        );
        for (const userId of toSendUserIds) {
          try {
            await prisma.notification.create({
              data: {
                userId,
                type: NOTIFICATION_TYPE,
                title: PROMPT_TITLE,
                message: PROMPT_MESSAGE,
                data: { link: PROMPT_LINK, source: 'DAILY_PROMPT' },
              },
            });
            sentCount += 1;
          } catch (rowError) {
            apiLogger.warn(
              { context: 'CRON_SEND_DAILY_PROMPTS', userId, error: rowError },
              'Failed to send daily prompt to user',
            );
          }
        }
      }
    }

    apiLogger.info(
      {
        context: 'CRON_SEND_DAILY_PROMPTS',
        candidateCount,
        sentCount,
        skippedDuplicates,
      },
      'Daily prompt dispatch completed',
    );

    return NextResponse.json({
      success: true,
      candidateCount,
      sentCount,
      skippedDuplicates,
    });
  } catch (error) {
    captureException(error);
    apiLogger.error(
      { context: 'CRON_SEND_DAILY_PROMPTS', error },
      'Cron failed',
    );
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
