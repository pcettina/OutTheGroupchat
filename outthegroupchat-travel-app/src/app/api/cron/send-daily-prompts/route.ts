/**
 * @module cron/send-daily-prompts
 * @description V1 Phase 5 daily-prompt cron (R8).
 *
 * Sends the opt-in morning nudge to every user who enabled the
 * `DAILY_PROMPT` NotificationPreference. Selection and notification writes
 * are delegated to `sendDailyPrompts` in `@/lib/notifications/daily-prompt`;
 * this handler only enforces auth and reports counts.
 *
 * Scheduled via Vercel Cron (see vercel.json) once a day at 13:00 UTC
 * (~morning in the US). The product spec wants finer-grained per-user
 * timing, but Vercel's Hobby tier ONLY permits DAILY cron schedules — a
 * sub-daily entry in vercel.json fails validation and blocks ALL deploys
 * (same constraint that forced cron/expire-intents to run daily). So every
 * enabled user is nudged on the single daily run.
 *
 * Vercel Cron issues GET requests only, so this handler responds to GET and
 * is protected by the `CRON_SECRET` bearer token to match the existing cron
 * pattern.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { sendDailyPrompts } from '@/lib/notifications/daily-prompt';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      apiLogger.error({ context: 'CRON_DAILY_PROMPTS' }, 'CRON_SECRET env var not set');
      return NextResponse.json({ error: 'Cron configuration error' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      apiLogger.warn({ context: 'CRON_DAILY_PROMPTS' }, 'Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eligible, sent } = await sendDailyPrompts(prisma);

    apiLogger.info(
      { context: 'CRON_DAILY_PROMPTS', eligible, sent },
      'Daily-prompt cron completed',
    );

    return NextResponse.json({ success: true, eligible, sent });
  } catch (error) {
    captureException(error);
    apiLogger.error({ context: 'CRON_DAILY_PROMPTS', error }, 'Cron failed');
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
