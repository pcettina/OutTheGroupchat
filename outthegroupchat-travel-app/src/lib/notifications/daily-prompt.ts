/**
 * @module lib/notifications/daily-prompt
 * @description V1 Phase 5 daily-prompt dispatch (R8).
 *
 * Users opt in to a morning nudge by enabling the `DAILY_PROMPT`
 * NotificationPreference. This module selects every user with that
 * preference enabled and writes them a `SYSTEM` Notification that prompts
 * them to signal an Intent, deep-linking to `/intents/new` with a `window`
 * query param so the capture form arrives pre-filled (one tap from nudge to
 * posted Intent).
 *
 * Dispatch is invoked by the `send-daily-prompts` cron route. Because
 * Vercel's Hobby tier only permits DAILY cron schedules (a sub-daily
 * schedule in vercel.json fails validation and blocks ALL deploys), this
 * runs once per day. The per-user `schedule` field (e.g. "09:00") is not
 * honored at sub-daily granularity in v1 — every enabled user is nudged on
 * the single daily run. Finer-grained timing is deferred to a future
 * background-worker tier.
 *
 * Individual notification-write failures are logged and skipped so one bad
 * row never aborts the whole batch; the function returns counts of how many
 * users were eligible and how many notifications were actually sent.
 */

import type { PrismaClient, WindowPreset } from '@prisma/client';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

/** Result of a daily-prompt dispatch pass. */
export interface DailyPromptResult {
  /** Number of users with DAILY_PROMPT enabled (the candidate set). */
  eligible: number;
  /** Number of Notification rows successfully created. */
  sent: number;
}

const PROMPT_TITLE = "What are you up for today?";
const PROMPT_MESSAGE =
  "Signal an Intent and we'll group you with Crew who are up for the same thing.";
/**
 * Window the daily nudge assumes the user is planning for. The prompt goes out
 * on the single daily (morning) run and asks what they are up for *today*, so
 * the after-work EVENING block is the highest-yield default. Exported so the
 * cron route / tests can assert the deep link without restating the literal.
 */
export const PROMPT_WINDOW_PRESET: WindowPreset = 'EVENING';

/**
 * Deep link carried on the notification. The `window` query param is read by
 * `IntentCreateForm`, which pre-selects the matching WindowPreset chip.
 */
export const PROMPT_LINK = `/intents/new?window=${PROMPT_WINDOW_PRESET}`;

/**
 * Select all users who opted into the daily prompt and create a SYSTEM
 * Notification for each, nudging them to signal an Intent.
 *
 * @param prisma - Prisma client (injected so the cron route and tests can
 *   share a single instance / mock).
 * @returns Counts of eligible users and notifications actually sent.
 */
export async function sendDailyPrompts(
  prisma: PrismaClient,
): Promise<DailyPromptResult> {
  const preferences = await prisma.notificationPreference.findMany({
    where: { trigger: 'DAILY_PROMPT', enabled: true },
    select: { userId: true },
  });

  const eligible = preferences.length;
  let sent = 0;

  for (const { userId } of preferences) {
    try {
      await prisma.notification.create({
        data: {
          userId,
          type: 'SYSTEM',
          title: PROMPT_TITLE,
          message: PROMPT_MESSAGE,
          data: { link: PROMPT_LINK, kind: 'DAILY_PROMPT' },
        },
      });
      sent += 1;
    } catch (error) {
      // Never abort the batch on a single bad row — log and continue.
      captureException(error);
      apiLogger.error(
        { context: 'DAILY_PROMPT_DISPATCH', userId, error },
        'Failed to create daily-prompt notification',
      );
    }
  }

  apiLogger.info(
    { context: 'DAILY_PROMPT_DISPATCH', eligible, sent },
    'Daily-prompt dispatch completed',
  );

  return { eligible, sent };
}
