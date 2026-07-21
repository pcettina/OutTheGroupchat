/**
 * @module app/topics/topicsPageLogic
 * @description Pure helpers behind the browse-by-Topic discovery page (Day 9 M2).
 *
 * Everything here is side-effect free so it can be unit tested without a React
 * renderer (vitest only collects `*.test.ts`, so JSX-free logic must live in a
 * `.ts` module rather than inside the page component).
 *
 * Shared by both sides of the wire:
 *   - `GET /api/topics?withCounts=true` uses {@link mergeTopicCounts} to fold
 *     the `prisma.intent.groupBy` rows onto the Topic list.
 *   - `src/app/topics/page.tsx` uses the formatting/sorting/href helpers.
 */

/** The Topic shape every existing consumer of `/api/topics` already relies on. */
export interface TopicSummary {
  id: string;
  slug: string;
  displayName: string;
}

/**
 * A Topic decorated with its live signal count.
 *
 * `count` is OPTIONAL on purpose: callers that do not ask for counts (the
 * onboarding interest selector, the Intent form's Topic picker) keep receiving
 * exactly `{ id, slug, displayName }`, and the counts query is allowed to fail
 * soft without breaking those flows.
 */
export interface TopicWithCount extends TopicSummary {
  count?: number;
}

/**
 * One row of `prisma.intent.groupBy({ by: ['topicId'], _count: { _all: true } })`.
 * Declared locally so this module stays importable from the client bundle.
 */
export interface TopicIntentCountRow {
  topicId: string;
  _count: { _all: number };
}

/**
 * Fold groupBy count rows onto the ordered Topic list.
 *
 * Topics with no live Intents are absent from the groupBy result entirely, so
 * they default to `0` rather than being dropped — a discovery page that hid
 * quiet Topics would be useless for the cold-start case.
 *
 * Input order is preserved; unknown `topicId`s in `rows` are ignored.
 */
export function mergeTopicCounts(
  topics: TopicSummary[],
  rows: TopicIntentCountRow[],
): TopicWithCount[] {
  const byTopicId = new Map<string, number>();
  for (const row of rows) {
    byTopicId.set(row.topicId, row._count._all);
  }
  return topics.map((topic) => ({
    ...topic,
    count: byTopicId.get(topic.id) ?? 0,
  }));
}

/**
 * Human label for a Topic's live signal count.
 *
 * Zero gets an invitational phrasing instead of a bare "0 Crew signaled" so an
 * empty Topic reads as an opportunity rather than a dead end. A missing/negative
 * count is treated as zero (the counts query is fail-soft and may omit it).
 */
export function formatSignalCount(count: number | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return 'Be the first to signal';
  }
  // Floor before the zero-guard: a fractional count in (0, 1) is still zero
  // whole signals, and must not render as a bare "0 Crew signaled".
  const whole = Math.floor(count);
  if (whole <= 0) {
    return 'Be the first to signal';
  }
  return whole === 1 ? '1 Crew signaled' : `${whole} Crew signaled`;
}

/**
 * Sort Topics for discovery: busiest first, then alphabetically by label.
 *
 * Returns a new array — the caller's list (which mirrors server order) is not
 * mutated.
 */
export function sortTopicsBySignal(topics: TopicWithCount[]): TopicWithCount[] {
  return [...topics].sort((a, b) => {
    const diff = (b.count ?? 0) - (a.count ?? 0);
    if (diff !== 0) return diff;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Deep link for tapping a Topic on the discovery page.
 *
 * NOTE: `/intents/new` (via `IntentCreateForm`) currently reads only the
 * `?window=` query param — it has no Topic prefill param, and its Topic picker
 * is only exposed after the server returns `needsTopicPicker`. Rather than
 * emitting an inert `?topicId=` that silently does nothing, this returns the
 * plain create route. Centralising it here means adding real prefill later is a
 * one-line change plus a test update.
 */
export function buildTopicIntentHref(_topic: TopicSummary): string {
  void _topic;
  return '/intents/new';
}

/**
 * Unwrap the `GET /api/topics` envelope into a bare Topic array.
 *
 * Deliberately explicit: a Day-8 page shipped blank because a component handed
 * the `{ success, data: { ... } }` envelope straight to a parser that wanted an
 * array. Returns `null` when the payload is not a successful topics envelope so
 * the caller can distinguish "failed" from "empty".
 */
export function parseTopicsResponse(body: unknown): TopicWithCount[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const envelope = body as { success?: unknown; data?: unknown };
  if (envelope.success !== true) return null;
  if (typeof envelope.data !== 'object' || envelope.data === null) return null;
  const { topics } = envelope.data as { topics?: unknown };
  if (!Array.isArray(topics)) return null;
  return topics.filter(
    (t): t is TopicWithCount =>
      typeof t === 'object' &&
      t !== null &&
      typeof (t as TopicSummary).id === 'string' &&
      typeof (t as TopicSummary).slug === 'string' &&
      typeof (t as TopicSummary).displayName === 'string',
  );
}
