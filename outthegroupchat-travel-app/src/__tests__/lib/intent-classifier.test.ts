/**
 * Unit tests for src/lib/intent/topic-classifier.ts and
 * src/lib/intent/window-preset.ts.
 *
 * Coverage:
 *  - matchesKeyword: word-boundary single-word match, multi-word substring,
 *    case-insensitivity, false-positive avoidance.
 *  - classifyIntentText: empty input, no-match, single match, best-match
 *    selection on tie-break, with mocked prisma.topic.findMany.
 *  - computeWindowRange / resolveIntentWindow / computeExpiresAt:
 *    preset → time mapping, dayOffset shift, override precedence,
 *    NIGHT-crosses-midnight, expiresAt = end + 2h, invalid window.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyIntentText,
  matchesKeyword,
} from '@/lib/intent/topic-classifier';
import {
  computeWindowRange,
  computeExpiresAt,
  resolveIntentWindow,
  EXPIRY_BUFFER_HOURS,
  MAX_DAY_OFFSET,
} from '@/lib/intent/window-preset';

// ---------------------------------------------------------------------------
// matchesKeyword — pure helper, no mocks needed
// ---------------------------------------------------------------------------
describe('matchesKeyword', () => {
  it('matches a single word with word boundaries', () => {
    expect(matchesKeyword('lets get drinks tonight', 'drinks')).toBe(true);
    expect(matchesKeyword('drinks!', 'drinks')).toBe(true);
    expect(matchesKeyword('DRINKS', 'drinks')).toBe(true);
  });

  it('avoids partial-word false positives', () => {
    // "rundrinks" should NOT match "drinks" with word-boundary regex.
    expect(matchesKeyword('rundrinks', 'drinks')).toBe(false);
    // "running" should NOT match "run" (word-boundary).
    expect(matchesKeyword('running', 'run')).toBe(false);
  });

  it('matches multi-word keywords via substring', () => {
    expect(matchesKeyword('grabbing happy hour drinks', 'happy hour')).toBe(true);
    expect(matchesKeyword('Happy Hour at the bar', 'happy hour')).toBe(true);
  });

  it('returns false on mismatch', () => {
    expect(matchesKeyword('hello world', 'drinks')).toBe(false);
    expect(matchesKeyword('', 'drinks')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyIntentText — needs a mocked prisma.topic
// ---------------------------------------------------------------------------
describe('classifyIntentText', () => {
  const drinks = {
    id: 'topic-drinks',
    keywords: ['drinks', 'beer', 'cocktail', 'happy hour'],
  };
  const coffee = {
    id: 'topic-coffee',
    keywords: ['coffee', 'espresso', 'latte'],
  };
  const run = {
    id: 'topic-run',
    keywords: ['run', 'running', 'jog', '5k'],
  };

  // Build a minimal prisma stub satisfying ClassifierPrisma.
  const makePrisma = (topics: typeof drinks[]) =>
    ({
      topic: {
        findMany: vi.fn().mockResolvedValue(topics),
      },
    }) as unknown as Parameters<typeof classifyIntentText>[1];

  it('returns null topicId on empty input', async () => {
    const result = await classifyIntentText('', makePrisma([drinks]));
    expect(result.topicId).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
  });

  it('returns null topicId when no keyword matches', async () => {
    const result = await classifyIntentText(
      'thinking about taxes',
      makePrisma([drinks, coffee, run]),
    );
    expect(result.topicId).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
  });

  it('classifies "drinks tonight" → drinks topic', async () => {
    const result = await classifyIntentText(
      'drinks tonight at the bar',
      makePrisma([drinks, coffee, run]),
    );
    expect(result.topicId).toBe('topic-drinks');
    expect(result.matchedKeywords).toContain('drinks');
  });

  it('selects the topic with the most matched keywords', async () => {
    // "drinks happy hour" hits 2 drinks keywords; "coffee" hits 1.
    const result = await classifyIntentText(
      'drinks happy hour then coffee',
      makePrisma([drinks, coffee, run]),
    );
    expect(result.topicId).toBe('topic-drinks');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['drinks', 'happy hour']),
    );
  });

  it('respects word boundaries — only "running" hits, not "run", on "running late"', async () => {
    const result = await classifyIntentText(
      'running late this morning',
      makePrisma([run]),
    );
    // 'running' MUST match; 'run' MUST NOT match (substring-of-running).
    expect(result.topicId).toBe('topic-run');
    expect(result.matchedKeywords).toEqual(['running']);
    expect(result.matchedKeywords).not.toContain('run');
  });
});

// ---------------------------------------------------------------------------
// window-preset helpers
// ---------------------------------------------------------------------------
describe('window-preset helpers', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('computes EVENING window (17:00 → 21:00) for today', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    const range = computeWindowRange('EVENING', 0, now);
    expect(range.startAt.getHours()).toBe(17);
    expect(range.endAt.getHours()).toBe(21);
    expect(range.startAt.getDate()).toBe(now.getDate());
  });

  it('NIGHT window crosses midnight (21 → 02 next day)', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    const range = computeWindowRange('NIGHT', 0, now);
    expect(range.startAt.getHours()).toBe(21);
    // endAt = startAt + (26 - 21) = startAt + 5h → 02:00 next calendar day
    const diffHours = (range.endAt.getTime() - range.startAt.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(5);
  });

  it('shifts by dayOffset', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    const today = computeWindowRange('EVENING', 0, now);
    const tomorrow = computeWindowRange('EVENING', 1, now);
    const diffDays = (tomorrow.startAt.getTime() - today.startAt.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(1);
  });

  it('computeExpiresAt adds the 2h buffer', () => {
    const endAt = new Date('2026-04-24T21:00:00Z');
    const expires = computeExpiresAt(endAt);
    const diffHours = (expires.getTime() - endAt.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(EXPIRY_BUFFER_HOURS);
  });

  it('resolveIntentWindow uses overrides when supplied', () => {
    const now = new Date('2026-04-24T10:00:00Z');
    const startOverride = new Date('2026-04-24T19:30:00Z');
    const endOverride = new Date('2026-04-24T22:30:00Z');

    const resolved = resolveIntentWindow({
      preset: 'EVENING',
      dayOffset: 0,
      startAtOverride: startOverride,
      endAtOverride: endOverride,
      now,
    });

    expect(resolved.startAt.toISOString()).toBe(startOverride.toISOString());
    expect(resolved.endAt.toISOString()).toBe(endOverride.toISOString());
    // expires = end + 2h
    const expires = new Date(endOverride);
    expires.setHours(expires.getHours() + EXPIRY_BUFFER_HOURS);
    expect(resolved.expiresAt.toISOString()).toBe(expires.toISOString());
  });

  it('resolveIntentWindow throws when endAt <= startAt', () => {
    const start = new Date('2026-04-24T22:00:00Z');
    const end = new Date('2026-04-24T20:00:00Z');
    expect(() =>
      resolveIntentWindow({
        preset: 'EVENING',
        dayOffset: 0,
        startAtOverride: start,
        endAtOverride: end,
      }),
    ).toThrow(/endAt must be after startAt/);
  });

  it('MAX_DAY_OFFSET is 7 (one-week lookahead per R3)', () => {
    expect(MAX_DAY_OFFSET).toBe(7);
  });
});
