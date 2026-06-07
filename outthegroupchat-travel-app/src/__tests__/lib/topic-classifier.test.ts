/**
 * Comprehensive unit tests for `src/lib/intent/topic-classifier.ts`.
 *
 * The classifier is a deterministic keyword-dictionary matcher:
 *  - Single-word keywords match via word-boundary regex (case-insensitive).
 *  - Multi-word keywords match via case-insensitive substring.
 *  - `classifyIntentText` picks the Topic with the largest number of matched
 *    keywords; ties resolve to the first Topic seen (insertion order).
 *  - Empty / whitespace-only input → `{ topicId: null, matchedKeywords: [] }`.
 *
 * This file focuses on broad keyword-bucket coverage (coffee, drinks, food,
 * sports, music, fitness, etc.), case + punctuation tolerance, ambiguity
 * resolution, and edge cases. It complements the smaller suite in
 * `intent-classifier.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  classifyIntentText,
  matchesKeyword,
  type ClassifyResult,
} from '@/lib/intent/topic-classifier';

// ---------------------------------------------------------------------------
// Topic fixtures — mimic the seeded `Topic` rows.
// ---------------------------------------------------------------------------
const TOPICS = {
  coffee: {
    id: 'topic-coffee',
    keywords: ['coffee', 'espresso', 'latte', 'cappuccino', 'cafe'],
  },
  drinks: {
    id: 'topic-drinks',
    keywords: ['drinks', 'beer', 'cocktail', 'wine', 'happy hour'],
  },
  food: {
    id: 'topic-food',
    keywords: ['dinner', 'lunch', 'brunch', 'pizza', 'sushi', 'food'],
  },
  sports: {
    id: 'topic-sports',
    keywords: ['basketball', 'soccer', 'tennis', 'pickleball', 'pickup game'],
  },
  music: {
    id: 'topic-music',
    keywords: ['concert', 'show', 'live music', 'gig', 'dj'],
  },
  fitness: {
    id: 'topic-fitness',
    keywords: ['gym', 'workout', 'run', 'yoga', 'hike'],
  },
};

const ALL_TOPICS = Object.values(TOPICS);

/** Build a minimal prisma stub matching `ClassifierPrisma`. */
function makePrisma(topics: typeof ALL_TOPICS) {
  return {
    topic: {
      findMany: vi.fn().mockResolvedValue(topics),
    },
  } as unknown as Parameters<typeof classifyIntentText>[1];
}

// ===========================================================================
// matchesKeyword
// ===========================================================================
describe('matchesKeyword', () => {
  it('matches single-word keyword with surrounding spaces', () => {
    expect(matchesKeyword('grabbing coffee tomorrow', 'coffee')).toBe(true);
  });

  it('is case-insensitive on both text and keyword', () => {
    expect(matchesKeyword('COFFEE TIME', 'coffee')).toBe(true);
    expect(matchesKeyword('coffee time', 'COFFEE')).toBe(true);
    expect(matchesKeyword('Coffee Time', 'CoFfEe')).toBe(true);
  });

  it('tolerates trailing/leading punctuation around keywords', () => {
    expect(matchesKeyword('coffee!', 'coffee')).toBe(true);
    expect(matchesKeyword('?coffee?', 'coffee')).toBe(true);
    expect(matchesKeyword('(coffee)', 'coffee')).toBe(true);
    expect(matchesKeyword('"coffee"', 'coffee')).toBe(true);
  });

  it('avoids partial-word false positives via word boundaries', () => {
    // "coffees" should not match "coffee" — wait, actually word boundary
    // matches at the start, so "coffees" DOES match "coffee" on its left edge.
    // The real false-positive case is the keyword being embedded INSIDE a
    // larger word with letters on BOTH sides.
    expect(matchesKeyword('rundrinks', 'drinks')).toBe(false);
    expect(matchesKeyword('xcoffeey', 'coffee')).toBe(false);
    expect(matchesKeyword('running', 'run')).toBe(false);
  });

  it('matches multi-word phrases via substring', () => {
    expect(matchesKeyword('grabbing happy hour drinks', 'happy hour')).toBe(true);
    expect(matchesKeyword('Live Music tonight!', 'live music')).toBe(true);
    expect(matchesKeyword('pickup game at the park', 'pickup game')).toBe(true);
  });

  it('multi-word match is case-insensitive', () => {
    expect(matchesKeyword('HAPPY HOUR specials', 'happy hour')).toBe(true);
    expect(matchesKeyword('happy hour specials', 'HAPPY HOUR')).toBe(true);
  });

  it('returns false on empty text', () => {
    expect(matchesKeyword('', 'coffee')).toBe(false);
  });

  it('returns false when keyword absent', () => {
    expect(matchesKeyword('having dinner', 'coffee')).toBe(false);
  });

  it('escapes regex-special characters in keywords (no wildcard behavior)', () => {
    // The classifier escapes regex meta-chars via escapeRegExp, so a "."
    // in a keyword must match a literal "." — not an arbitrary character.
    // Note: keywords with non-word characters on the boundary may not match
    // due to `\b` semantics (word boundaries only sit between \w and \W).
    // The important guarantee tested here: no ReDoS / wildcard escape.
    expect(matchesKeyword('section 2X0', '2.0')).toBe(false);
    expect(matchesKeyword('hello (world)', '(world')).toBe(false); // boundary
    // Single-word keyword with no regex-special chars matches fine.
    expect(matchesKeyword('about 5k run', '5k')).toBe(true);
  });

  it('matches keyword at end-of-string with no trailing whitespace', () => {
    expect(matchesKeyword('lets get coffee', 'coffee')).toBe(true);
  });

  it('matches keyword at start-of-string', () => {
    expect(matchesKeyword('coffee sounds great', 'coffee')).toBe(true);
  });
});

// ===========================================================================
// classifyIntentText — keyword-bucket coverage
// ===========================================================================
describe('classifyIntentText — topic bucket coverage', () => {
  it('classifies a clear coffee intent → coffee', async () => {
    const result = await classifyIntentText(
      'meet for coffee at 10?',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-coffee');
    expect(result.matchedKeywords).toContain('coffee');
  });

  it('classifies espresso / latte synonyms → coffee', async () => {
    const result = await classifyIntentText(
      'need an espresso, maybe a latte',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-coffee');
    expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
  });

  it('classifies drinks intent → drinks', async () => {
    const result = await classifyIntentText(
      'beer at the bar?',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-drinks');
    expect(result.matchedKeywords).toContain('beer');
  });

  it('classifies "happy hour" multi-word phrase → drinks', async () => {
    const result = await classifyIntentText(
      'happy hour at 6',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-drinks');
    expect(result.matchedKeywords).toContain('happy hour');
  });

  it('classifies food intent → food', async () => {
    const result = await classifyIntentText(
      'sushi for dinner',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-food');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['sushi', 'dinner']),
    );
  });

  it('classifies sports intent → sports', async () => {
    const result = await classifyIntentText(
      'pickup game of basketball',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-sports');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['basketball', 'pickup game']),
    );
  });

  it('classifies music intent → music', async () => {
    const result = await classifyIntentText(
      'concert tonight, live music starts at 9',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-music');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['concert', 'live music']),
    );
  });

  it('classifies fitness intent → fitness', async () => {
    const result = await classifyIntentText(
      'going for a yoga class then a hike',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-fitness');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['yoga', 'hike']),
    );
  });
});

// ===========================================================================
// classifyIntentText — edge cases & ambiguity
// ===========================================================================
describe('classifyIntentText — edge cases', () => {
  it('returns null on empty string', async () => {
    const result = await classifyIntentText('', makePrisma(ALL_TOPICS));
    expect(result).toEqual<ClassifyResult>({ topicId: null, matchedKeywords: [] });
  });

  it('returns null on whitespace-only input', async () => {
    const result = await classifyIntentText('   \t \n  ', makePrisma(ALL_TOPICS));
    expect(result.topicId).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
  });

  it('short-circuits and does not call prisma on empty input', async () => {
    const prisma = makePrisma(ALL_TOPICS);
    await classifyIntentText('', prisma);
    expect(prisma.topic.findMany).not.toHaveBeenCalled();
  });

  it('returns null when no keyword matches random text', async () => {
    const result = await classifyIntentText(
      'just rambling about nothing in particular',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
  });

  it('picks topic with MORE matches when text is ambiguous', async () => {
    // 2 coffee keywords vs 1 drinks keyword → coffee wins.
    const result = await classifyIntentText(
      'coffee and espresso, maybe a beer later',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-coffee');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['coffee', 'espresso']),
    );
  });

  it('on a tie, returns the first topic seen (insertion order)', async () => {
    // 1 coffee keyword + 1 drinks keyword → coffee comes first in array.
    const orderedCoffeeFirst = [TOPICS.coffee, TOPICS.drinks];
    const result1 = await classifyIntentText(
      'coffee then beer',
      makePrisma(orderedCoffeeFirst),
    );
    expect(result1.topicId).toBe('topic-coffee');

    // Reverse insertion order — drinks should win the tie.
    const orderedDrinksFirst = [TOPICS.drinks, TOPICS.coffee];
    const result2 = await classifyIntentText(
      'coffee then beer',
      makePrisma(orderedDrinksFirst),
    );
    expect(result2.topicId).toBe('topic-drinks');
  });

  it('is case-insensitive end-to-end', async () => {
    const result = await classifyIntentText(
      'COFFEE TOMORROW MORNING',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-coffee');
    expect(result.matchedKeywords).toContain('coffee');
  });

  it('tolerates punctuation between keywords', async () => {
    const result = await classifyIntentText(
      'coffee?? then... sushi!!! and pizza.',
      makePrisma(ALL_TOPICS),
    );
    // 2 food keywords vs 1 coffee keyword → food wins.
    expect(result.topicId).toBe('topic-food');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['sushi', 'pizza']),
    );
  });

  it('avoids false positive when keyword is embedded inside a larger word', async () => {
    // "running" should NOT trigger "run" (word boundary).
    // The fitness topic contains "run" but not "running" here.
    const fitnessRunOnly = {
      id: 'topic-fitness-run-only',
      keywords: ['run'],
    };
    const result = await classifyIntentText(
      'running late, see you soon',
      makePrisma([fitnessRunOnly] as typeof ALL_TOPICS),
    );
    expect(result.topicId).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
  });

  it('returns null when topic list is empty', async () => {
    const result = await classifyIntentText(
      'coffee tomorrow',
      makePrisma([]),
    );
    expect(result.topicId).toBeNull();
    expect(result.matchedKeywords).toEqual([]);
  });

  it('deduplicates is NOT required — returns matched keywords list as filtered subset', async () => {
    // Even if a keyword appears multiple times in text, it appears once in
    // the matchedKeywords array because we filter the topic's keywords list.
    const result = await classifyIntentText(
      'coffee coffee coffee',
      makePrisma(ALL_TOPICS),
    );
    expect(result.topicId).toBe('topic-coffee');
    expect(result.matchedKeywords).toEqual(['coffee']);
  });

  it('handles very long input efficiently', async () => {
    const longText = 'lorem ipsum '.repeat(500) + 'coffee at the end';
    const result = await classifyIntentText(longText, makePrisma(ALL_TOPICS));
    expect(result.topicId).toBe('topic-coffee');
    expect(result.matchedKeywords).toContain('coffee');
  });

  it('only calls prisma.topic.findMany once per classification', async () => {
    const prisma = makePrisma(ALL_TOPICS);
    await classifyIntentText('coffee tomorrow', prisma);
    expect(prisma.topic.findMany).toHaveBeenCalledTimes(1);
  });

  it('queries with select { id, keywords }', async () => {
    const prisma = makePrisma(ALL_TOPICS);
    await classifyIntentText('coffee', prisma);
    expect(prisma.topic.findMany).toHaveBeenCalledWith({
      select: { id: true, keywords: true },
    });
  });

  it('matchedKeywords is a subset of the winning topic keywords only', async () => {
    const result = await classifyIntentText(
      'coffee and beer at happy hour',
      makePrisma(ALL_TOPICS),
    );
    // Whichever topic wins, the matched list must only contain that topic's
    // keywords (no cross-pollination across topics).
    const winningTopic = ALL_TOPICS.find((t) => t.id === result.topicId);
    expect(winningTopic).toBeDefined();
    for (const k of result.matchedKeywords) {
      expect(winningTopic!.keywords).toContain(k);
    }
  });
});
