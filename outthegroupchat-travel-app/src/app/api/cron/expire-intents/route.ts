/**
 * @module cron/expire-intents
 * @description Hygiene cron for V1 Intent table (R12).
 *
 * The "live vs expired" distinction is implicit — every read path filters by
 * `expiresAt > now()`, so an Intent is invisible to users the moment its
 * window-end + 2h grace passes. This cron exists for *retention*: it hard-
 * deletes Intents that have been expired for longer than the retention window
 * (default 90 days). The 90-day default preserves `rawText` for v1.5 embedder
 * training while keeping the table small.
 *
 * Scheduled via Vercel Cron (see vercel.json) once a day at 03:00 UTC.
 * The plan called for every 10 minutes, but Vercel's Hobby tier only
 * permits daily cron schedules — sub-daily would fail vercel.json
 * validation and block ALL deploys. Daily is fine here because expiry
 * is implicit at read time (every Intent query filters
 * `expiresAt > now()`); this cron is purely retention hygiene.
 * Vercel Cron issues GET requests only, so this handler responds to
 * GET. Protected by `CRON_SECRET` bearer token to match the existing
 * cron pattern.
 *
 * Returns counts of currently-expired and just-deleted Intents for monitoring.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

const DEFAULT_RETENTION_DAYS = 90;

export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      apiLogger.error({ context: 'CRON_EXPIRE_INTENTS' }, 'CRON_SECRET env var not set');
      return NextResponse.json({ error: 'Cron configuration error' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      apiLogger.warn({ context: 'CRON_EXPIRE_INTENTS' }, 'Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const retentionDaysRaw = url.searchParams.get('retentionDays');
    const retentionDays = retentionDaysRaw ? Math.max(1, Number(retentionDaysRaw)) : DEFAULT_RETENTION_DAYS;
    const safeRetentionDays = Number.isFinite(retentionDays) ? retentionDays : DEFAULT_RETENTION_DAYS;

    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000);

    const expiredCount = await prisma.intent.count({
      where: { expiresAt: { lt: now } },
    });

    const deleteResult = await prisma.intent.deleteMany({
      where: { expiresAt: { lt: retentionCutoff } },
    });

    apiLogger.info(
      {
        context: 'CRON_EXPIRE_INTENTS',
        expiredCount,
        deletedCount: deleteResult.count,
        retentionDays: safeRetentionDays,
      },
      'Intent hygiene pass completed',
    );

    return NextResponse.json({
      success: true,
      expiredCount,
      deletedCount: deleteResult.count,
      retentionDays: safeRetentionDays,
    });
  } catch (error) {
    captureException(error);
    apiLogger.error({ context: 'CRON_EXPIRE_INTENTS', error }, 'Cron failed');
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
