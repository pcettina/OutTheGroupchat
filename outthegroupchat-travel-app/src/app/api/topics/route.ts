/**
 * @module api/topics
 * @description GET the curated Topic list (R1) — used by the Intent create
 * form's manual-picker fallback when the classifier returns no match, by the
 * onboarding interest selector, and by the browse-by-Topic discovery page.
 * Read-only, authenticated, lightweight (~10 rows).
 *
 * Pass `?withCounts=true` to decorate each Topic with `count`, the number of
 * live (non-expired) Intents signaled against it. The count query is FAIL-SOFT:
 * this endpoint is load-bearing for signup and Intent creation, so a counts
 * regression degrades to `count: 0` rather than failing the whole list.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { apiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import {
  mergeTopicCounts,
  type TopicIntentCountRow,
  type TopicSummary,
  type TopicWithCount,
} from '@/app/topics/topicsPageLogic';

/** Query params. Only `withCounts` is accepted; anything else is ignored. */
const TopicsQuerySchema = z.object({
  withCounts: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/**
 * Read `?withCounts=` off the request.
 *
 * `req` is optional because this handler is also invoked bare (`GET()`) — Next
 * always supplies a Request at runtime, but the unit tests do not, and an
 * undefined `req` must degrade to "no counts" rather than throw.
 */
function wantsCounts(req?: Request): boolean {
  if (!req?.url) return false;
  let params: URLSearchParams;
  try {
    params = new URL(req.url).searchParams;
  } catch {
    return false;
  }
  const parsed = TopicsQuerySchema.safeParse({
    withCounts: params.get('withCounts') ?? undefined,
  });
  return parsed.success ? parsed.data.withCounts : false;
}

/**
 * Count live signaled Intents per Topic.
 *
 * "Live" is `expiresAt > now` — `IntentState` only has INTERESTED/COMMITTED, so
 * there is no status value that marks an Intent as done. Backed by the
 * `@@index([topicId, windowPreset, dayOffset, expiresAt])` index.
 *
 * Returns `null` (rather than throwing) when the aggregate fails, so the caller
 * can still serve the Topic list.
 */
async function loadLiveIntentCounts(): Promise<TopicIntentCountRow[] | null> {
  try {
    const rows = await prisma.intent.groupBy({
      by: ['topicId'],
      where: { expiresAt: { gt: new Date() } },
      _count: { _all: true },
    });
    return rows as unknown as TopicIntentCountRow[];
  } catch (error) {
    captureException(error);
    apiLogger.warn(
      { error },
      '[TOPICS_GET] Live Intent count aggregate failed — serving topics without counts',
    );
    return null;
  }
}

// `req` has a DEFAULT (not `?`) so its type stays `Request`, not `Request |
// undefined`: Next's route-type validator rejects an optional first argument
// (`next build` fails with "Type 'Request | undefined' is not a valid type for
// the function's first argument"), but `tsc --noEmit` does not run that check —
// so an optional param compiles locally yet breaks the Vercel build. The default
// keeps the handler callable bare (`GET()`) for the unit tests; at runtime Next
// always passes a real Request, so the default is never evaluated in production.
export async function GET(req: Request = new Request('http://localhost/api/topics')) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(apiRateLimiter, `topics-list:${session.user.id}`);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429, headers: getRateLimitHeaders(rl) },
      );
    }

    const topics = (await prisma.topic.findMany({
      select: { id: true, slug: true, displayName: true },
      orderBy: { displayName: 'asc' },
    })) as TopicSummary[];

    // Additive only: when counts are not requested (or the aggregate failed)
    // the payload stays exactly `{ id, slug, displayName }` for the existing
    // onboarding / Intent-form consumers.
    let payload: TopicWithCount[] = topics;
    if (wantsCounts(req)) {
      const rows = await loadLiveIntentCounts();
      payload = rows === null
        ? topics.map((t) => ({ ...t, count: 0 }))
        : mergeTopicCounts(topics, rows);
    }

    return NextResponse.json({ success: true, data: { topics: payload } });
  } catch (error) {
    captureException(error);
    apiLogger.error({ error }, '[TOPICS_GET] Failed to list topics');
    return NextResponse.json(
      { success: false, error: 'Failed to list topics' },
      { status: 500 },
    );
  }
}
