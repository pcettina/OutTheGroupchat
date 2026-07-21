/**
 * Day-9 [T1] tests for the /topics discovery page's pure logic module.
 *
 * Vitest here only collects `*.test.ts` (a `.test.tsx` is silently never run),
 * so the page is tested through the exported helpers in
 * `src/app/topics/topicsPageLogic.ts` rather than a render harness.
 *
 * Run just this file:
 *   npx vitest run src/__tests__/topics-page-logic.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  mergeTopicCounts,
  formatSignalCount,
  sortTopicsBySignal,
  buildTopicIntentHref,
  parseTopicsResponse,
  type TopicSummary,
  type TopicWithCount,
  type TopicIntentCountRow,
} from '@/app/topics/topicsPageLogic';

function topic(id: string, displayName = id.toUpperCase(), slug = id): TopicSummary {
  return { id, slug, displayName };
}

function countRow(topicId: string, count: number): TopicIntentCountRow {
  return { topicId, _count: { _all: count } };
}

describe('mergeTopicCounts', () => {
  it('folds counts onto the matching topics', () => {
    const merged = mergeTopicCounts(
      [topic('t1'), topic('t2')],
      [countRow('t1', 5), countRow('t2', 2)],
    );
    expect(merged).toEqual([
      { id: 't1', slug: 't1', displayName: 'T1', count: 5 },
      { id: 't2', slug: 't2', displayName: 'T2', count: 2 },
    ]);
  });

  it('preserves the input topic order regardless of row order', () => {
    const merged = mergeTopicCounts(
      [topic('a'), topic('b'), topic('c')],
      [countRow('c', 9), countRow('a', 1)],
    );
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('defaults topics with no rows to 0 rather than dropping them', () => {
    const merged = mergeTopicCounts([topic('a'), topic('b')], [countRow('a', 4)]);
    expect(merged.map((t) => t.count)).toEqual([4, 0]);
  });

  it('gives every topic a count of 0 when rows is empty', () => {
    const merged = mergeTopicCounts([topic('a'), topic('b')], []);
    expect(merged.every((t) => t.count === 0)).toBe(true);
  });

  it('ignores rows for unknown topicIds', () => {
    const merged = mergeTopicCounts([topic('a')], [countRow('ghost', 99), countRow('a', 3)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].count).toBe(3);
  });

  it('returns [] for an empty topic list even when rows exist', () => {
    expect(mergeTopicCounts([], [countRow('a', 1)])).toEqual([]);
  });

  it('lets the last row win for a duplicated topicId', () => {
    const merged = mergeTopicCounts([topic('a')], [countRow('a', 1), countRow('a', 7)]);
    expect(merged[0].count).toBe(7);
  });

  it('keeps every non-count field intact', () => {
    const merged = mergeTopicCounts([topic('t1', 'Live Music', 'live-music')], []);
    expect(merged[0]).toMatchObject({ id: 't1', slug: 'live-music', displayName: 'Live Music' });
  });

  it('does not mutate its inputs', () => {
    const topics = [topic('a'), topic('b')];
    const rows = [countRow('a', 2)];
    const topicsSnapshot = JSON.parse(JSON.stringify(topics)) as TopicSummary[];
    const rowsSnapshot = JSON.parse(JSON.stringify(rows)) as TopicIntentCountRow[];

    const merged = mergeTopicCounts(topics, rows);

    expect(topics).toEqual(topicsSnapshot);
    expect(rows).toEqual(rowsSnapshot);
    // and the returned rows must be fresh objects, not the same references
    expect(merged[0]).not.toBe(topics[0]);
    expect(topics[0]).not.toHaveProperty('count');
  });
});

describe('formatSignalCount', () => {
  it('invites a signal at zero', () => {
    expect(formatSignalCount(0)).toBe('Be the first to signal');
  });

  it('invites a signal when the count is undefined', () => {
    expect(formatSignalCount(undefined)).toBe('Be the first to signal');
  });

  it('invites a signal for NaN and non-finite counts', () => {
    expect(formatSignalCount(Number.NaN)).toBe('Be the first to signal');
    expect(formatSignalCount(Number.POSITIVE_INFINITY)).toBe('Be the first to signal');
    expect(formatSignalCount(Number.NEGATIVE_INFINITY)).toBe('Be the first to signal');
  });

  it('invites a signal for negative counts', () => {
    expect(formatSignalCount(-1)).toBe('Be the first to signal');
    expect(formatSignalCount(-100)).toBe('Be the first to signal');
  });

  it('is singular at exactly 1', () => {
    expect(formatSignalCount(1)).toBe('1 Crew signaled');
  });

  it('is plural at 2 and above', () => {
    expect(formatSignalCount(2)).toBe('2 Crew signaled');
    expect(formatSignalCount(17)).toBe('17 Crew signaled');
  });

  it('floors fractional counts', () => {
    expect(formatSignalCount(1.9)).toBe('1 Crew signaled');
    expect(formatSignalCount(2.4)).toBe('2 Crew signaled');
  });

  it('treats a fraction under 1 as zero', () => {
    expect(formatSignalCount(0.5)).toBe('Be the first to signal');
  });

  it('never renders a bare "0 Crew signaled"', () => {
    for (const value of [0, -0, 0.1, -3, Number.NaN, undefined]) {
      expect(formatSignalCount(value)).not.toContain('0 Crew signaled');
    }
  });
});

describe('sortTopicsBySignal', () => {
  it('sorts by count descending', () => {
    const sorted = sortTopicsBySignal([
      { ...topic('a'), count: 1 },
      { ...topic('b'), count: 9 },
      { ...topic('c'), count: 4 },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by displayName ascending', () => {
    const sorted = sortTopicsBySignal([
      { ...topic('c', 'Coffee'), count: 3 },
      { ...topic('a', 'Art'), count: 3 },
      { ...topic('b', 'Bouldering'), count: 3 },
    ]);
    expect(sorted.map((t) => t.displayName)).toEqual(['Art', 'Bouldering', 'Coffee']);
  });

  it('applies the tie-break only within a count group', () => {
    const sorted = sortTopicsBySignal([
      { ...topic('z', 'Zumba'), count: 10 },
      { ...topic('a', 'Art'), count: 1 },
      { ...topic('b', 'Bouldering'), count: 1 },
    ]);
    expect(sorted.map((t) => t.displayName)).toEqual(['Zumba', 'Art', 'Bouldering']);
  });

  it('treats a missing count as 0 and sinks it below counted topics', () => {
    const sorted = sortTopicsBySignal([
      { ...topic('a', 'Art') },
      { ...topic('b', 'Bouldering'), count: 2 },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('orders two count-less topics alphabetically', () => {
    const sorted = sortTopicsBySignal([topic('c', 'Coffee'), topic('a', 'Art')]);
    expect(sorted.map((t) => t.displayName)).toEqual(['Art', 'Coffee']);
  });

  it('handles empty and single-element lists', () => {
    expect(sortTopicsBySignal([])).toEqual([]);
    const one = [{ ...topic('a'), count: 3 }];
    expect(sortTopicsBySignal(one)).toEqual(one);
  });

  it('returns a new array and does not mutate the input', () => {
    const topics: TopicWithCount[] = [
      { ...topic('a', 'Art'), count: 1 },
      { ...topic('z', 'Zumba'), count: 9 },
    ];
    const snapshot = JSON.parse(JSON.stringify(topics)) as TopicWithCount[];

    const sorted = sortTopicsBySignal(topics);

    expect(sorted).not.toBe(topics);
    expect(topics).toEqual(snapshot);
    expect(topics.map((t) => t.id)).toEqual(['a', 'z']);
    expect(sorted.map((t) => t.id)).toEqual(['z', 'a']);
  });

  it('is idempotent', () => {
    const topics: TopicWithCount[] = [
      { ...topic('c', 'Coffee'), count: 3 },
      { ...topic('a', 'Art'), count: 3 },
      { ...topic('z', 'Zumba'), count: 8 },
    ];
    const once = sortTopicsBySignal(topics);
    const twice = sortTopicsBySignal(once);
    expect(twice.map((t) => t.id)).toEqual(once.map((t) => t.id));
  });

  it('composes with mergeTopicCounts without disturbing the merged data', () => {
    const merged = mergeTopicCounts(
      [topic('a', 'Art'), topic('b', 'Bouldering'), topic('c', 'Coffee')],
      [countRow('c', 5), countRow('a', 5)],
    );
    const sorted = sortTopicsBySignal(merged);
    expect(sorted.map((t) => t.displayName)).toEqual(['Art', 'Coffee', 'Bouldering']);
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildTopicIntentHref', () => {
  it('points at the intent create route', () => {
    expect(buildTopicIntentHref(topic('t1', 'Live Music', 'live-music'))).toBe('/intents/new');
  });

  it('does not emit an inert topic query param', () => {
    const href = buildTopicIntentHref(topic('t1'));
    expect(href).not.toContain('?');
    expect(href).not.toContain('topicId');
  });

  it('is stable across different topics (no prefill support yet)', () => {
    expect(buildTopicIntentHref(topic('a'))).toBe(buildTopicIntentHref(topic('b')));
  });
});

describe('parseTopicsResponse', () => {
  const good: TopicWithCount[] = [
    { id: 't1', slug: 'live-music', displayName: 'Live Music', count: 3 },
    { id: 't2', slug: 'coffee', displayName: 'Coffee' },
  ];

  it('unwraps a successful envelope', () => {
    expect(parseTopicsResponse({ success: true, data: { topics: good } })).toEqual(good);
  });

  it('accepts an empty topics array', () => {
    expect(parseTopicsResponse({ success: true, data: { topics: [] } })).toEqual([]);
  });

  it('returns null for success:false', () => {
    expect(parseTopicsResponse({ success: false, data: { topics: good } })).toBeNull();
  });

  it('returns null for an error-only envelope', () => {
    expect(parseTopicsResponse({ error: 'Unauthorized' })).toBeNull();
  });

  it('returns null for a truthy-but-not-true success flag', () => {
    expect(parseTopicsResponse({ success: 'true', data: { topics: [] } })).toBeNull();
    expect(parseTopicsResponse({ success: 1, data: { topics: [] } })).toBeNull();
  });

  it('returns null for null, undefined and {}', () => {
    expect(parseTopicsResponse(null)).toBeNull();
    expect(parseTopicsResponse(undefined)).toBeNull();
    expect(parseTopicsResponse({})).toBeNull();
  });

  it('returns null for non-object junk', () => {
    expect(parseTopicsResponse('topics')).toBeNull();
    expect(parseTopicsResponse(0)).toBeNull();
    expect(parseTopicsResponse(false)).toBeNull();
    expect(parseTopicsResponse(() => undefined)).toBeNull();
  });

  it('returns null when data is missing or not an object', () => {
    expect(parseTopicsResponse({ success: true })).toBeNull();
    expect(parseTopicsResponse({ success: true, data: null })).toBeNull();
    expect(parseTopicsResponse({ success: true, data: 'topics' })).toBeNull();
  });

  it('returns null when data.topics is missing or not an array', () => {
    expect(parseTopicsResponse({ success: true, data: {} })).toBeNull();
    expect(parseTopicsResponse({ success: true, data: { topics: null } })).toBeNull();
    expect(parseTopicsResponse({ success: true, data: { topics: { t1: 'x' } } })).toBeNull();
  });

  it('returns null for a bare array passed where an envelope is expected', () => {
    // The Day-8 bug class: bare payload handed to an envelope parser.
    expect(parseTopicsResponse(good)).toBeNull();
    expect(parseTopicsResponse([])).toBeNull();
  });

  it('returns null for the data payload passed without its envelope', () => {
    expect(parseTopicsResponse({ topics: good })).toBeNull();
  });

  it('returns null for a doubly-wrapped envelope', () => {
    const inner = { success: true, data: { topics: good } };
    expect(parseTopicsResponse({ success: true, data: { topics: inner } })).toBeNull();
  });

  it('filters out malformed topic rows but keeps valid ones', () => {
    const parsed = parseTopicsResponse({
      success: true,
      data: {
        topics: [
          good[0],
          null,
          'coffee',
          42,
          { id: 't3' },
          { id: 't4', slug: 'x' },
          { id: 5, slug: 'y', displayName: 'Y' },
          good[1],
        ],
      },
    });
    expect(parsed).toEqual([good[0], good[1]]);
  });

  it('returns an empty array (not null) when every row is malformed', () => {
    const parsed = parseTopicsResponse({ success: true, data: { topics: [null, 1, 'x'] } });
    expect(parsed).toEqual([]);
    expect(parsed).not.toBeNull();
  });

  it('composes with sortTopicsBySignal end to end', () => {
    const parsed = parseTopicsResponse({
      success: true,
      data: {
        topics: [
          { id: 'a', slug: 'art', displayName: 'Art', count: 1 },
          { id: 'z', slug: 'zumba', displayName: 'Zumba', count: 9 },
        ],
      },
    });
    expect(parsed).not.toBeNull();
    expect(sortTopicsBySignal(parsed ?? []).map((t) => t.id)).toEqual(['z', 'a']);
  });
});
