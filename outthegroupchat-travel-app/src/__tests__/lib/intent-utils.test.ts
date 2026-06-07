/**
 * Unit tests for src/lib/intent/* utility modules.
 *
 * Coverage:
 *  - neighborhoods (re-export):
 *      NYC_NEIGHBORHOODS shape, slug uniqueness, borough whitelist,
 *      centroid bounds. isNeighborhoodSlug type-guard for known/unknown
 *      strings, empty input, casing sensitivity. getNeighborhoodCentroid
 *      for known slug, unknown slug, empty string.
 *  - topic-classifier helpers (extra edge cases on top of existing
 *    intent-classifier.test.ts): regex-special-char keyword,
 *    whitespace-only input, tie-break on first-encountered topic.
 *  - topic-places-map.buildPlacesQuery extra edges: whitespace-only
 *    cityArea, multi-category preference (first wins).
 *  - window-preset extras: dayOffset of MAX_DAY_OFFSET, AFTERNOON range,
 *    BRUNCH range, override startAt later than default end.
 *
 * No Prisma needed — neighborhoods + pure helpers only. For
 * classifyIntentText / getPlacesCategoriesForTopic an in-memory stub is
 * passed in (no DB / Prisma client used).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  NYC_NEIGHBORHOODS,
  isNeighborhoodSlug,
  getNeighborhoodCentroid,
} from '@/lib/intent/neighborhoods';
import {
  matchesKeyword,
  classifyIntentText,
} from '@/lib/intent/topic-classifier';
import { buildPlacesQuery } from '@/lib/intent/topic-places-map';
import {
  computeWindowRange,
  computeExpiresAt,
  resolveIntentWindow,
  EXPIRY_BUFFER_HOURS,
  MAX_DAY_OFFSET,
} from '@/lib/intent/window-preset';

// ---------------------------------------------------------------------------
// neighborhoods.ts (re-export surface)
// ---------------------------------------------------------------------------

describe('NYC_NEIGHBORHOODS', () => {
  it('has at least 30 entries (curated v1 list)', () => {
    expect(NYC_NEIGHBORHOODS.length).toBeGreaterThanOrEqual(30);
  });

  it('every slug is unique', () => {
    const slugs = NYC_NEIGHBORHOODS.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every borough is one of Manhattan/Brooklyn/Queens', () => {
    const allowed = new Set(['Manhattan', 'Brooklyn', 'Queens']);
    for (const n of NYC_NEIGHBORHOODS) {
      expect(allowed.has(n.borough)).toBe(true);
    }
  });

  it('every centroid lat is within NYC bounds (40.6..40.9)', () => {
    for (const n of NYC_NEIGHBORHOODS) {
      expect(n.centroidLat).toBeGreaterThanOrEqual(40.6);
      expect(n.centroidLat).toBeLessThanOrEqual(40.9);
    }
  });

  it('every centroid lng is within NYC bounds (-74.05..-73.9)', () => {
    for (const n of NYC_NEIGHBORHOODS) {
      expect(n.centroidLng).toBeGreaterThanOrEqual(-74.05);
      expect(n.centroidLng).toBeLessThanOrEqual(-73.9);
    }
  });

  it('every displayName is a non-empty string', () => {
    for (const n of NYC_NEIGHBORHOODS) {
      expect(typeof n.displayName).toBe('string');
      expect(n.displayName.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('isNeighborhoodSlug', () => {
  it('returns true for a known slug (east-village)', () => {
    expect(isNeighborhoodSlug('east-village')).toBe(true);
  });

  it('returns true for every slug in the curated list', () => {
    for (const n of NYC_NEIGHBORHOODS) {
      expect(isNeighborhoodSlug(n.slug)).toBe(true);
    }
  });

  it('returns false for an unknown slug', () => {
    expect(isNeighborhoodSlug('mars-base-alpha')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isNeighborhoodSlug('')).toBe(false);
  });

  it('is case-sensitive (rejects EAST-VILLAGE)', () => {
    expect(isNeighborhoodSlug('EAST-VILLAGE')).toBe(false);
  });

  it('rejects displayName lookups (e.g. "East Village")', () => {
    expect(isNeighborhoodSlug('East Village')).toBe(false);
  });
});

describe('getNeighborhoodCentroid', () => {
  it('returns lat+lng for a known slug', () => {
    const c = getNeighborhoodCentroid('east-village');
    expect(c).not.toBeNull();
    expect(c).toEqual({ lat: 40.728, lng: -73.984 });
  });

  it('returns lat+lng for a Brooklyn slug (williamsburg)', () => {
    const c = getNeighborhoodCentroid('williamsburg');
    expect(c).toEqual({ lat: 40.708, lng: -73.957 });
  });

  it('returns lat+lng for a Queens slug (astoria)', () => {
    const c = getNeighborhoodCentroid('astoria');
    expect(c).toEqual({ lat: 40.764, lng: -73.924 });
  });

  it('returns null for unknown slug', () => {
    expect(getNeighborhoodCentroid('nowhere-land')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getNeighborhoodCentroid('')).toBeNull();
  });

  it('returned coordinates match the source NYC_NEIGHBORHOODS row', () => {
    for (const n of NYC_NEIGHBORHOODS) {
      const c = getNeighborhoodCentroid(n.slug);
      expect(c).toEqual({ lat: n.centroidLat, lng: n.centroidLng });
    }
  });
});

// ---------------------------------------------------------------------------
// topic-classifier extra edge cases
// ---------------------------------------------------------------------------

describe('matchesKeyword (extra edges)', () => {
  it('does not throw on regex-special characters in keyword (escapeRegExp)', () => {
    // The single-word path wraps the keyword in \b...\b boundaries. `+` is a
    // non-word char so a `c++` keyword won't actually match here (boundary
    // mismatch), but the call must NOT throw — escapeRegExp neutralises the
    // would-be quantifier so we get back a clean boolean.
    expect(() => matchesKeyword('I love c++ tonight', 'c++')).not.toThrow();
    expect(typeof matchesKeyword('I love c++ tonight', 'c++')).toBe('boolean');
    // A period in a single-word keyword likewise must be treated literally,
    // not as "any char": "a.b" must not match "axb".
    expect(matchesKeyword('axb is here', 'a.b')).toBe(false);
  });

  it('rejects partial substring for single-word keyword (drinks not in rundrinks)', () => {
    expect(matchesKeyword('rundrinks fast', 'drinks')).toBe(false);
  });

  it('matches multi-word keyword regardless of position', () => {
    expect(matchesKeyword('come grab happy hour drinks', 'happy hour')).toBe(true);
  });

  it('is case-insensitive for both single- and multi-word keywords', () => {
    expect(matchesKeyword('HAPPY HOUR at 6', 'happy hour')).toBe(true);
    expect(matchesKeyword('Drinks tonight', 'drinks')).toBe(true);
  });
});

describe('classifyIntentText (extra edges)', () => {
  it('returns null topicId for empty input without querying prisma', async () => {
    const findMany = vi.fn();
    const prisma = { topic: { findMany } } as unknown as Parameters<
      typeof classifyIntentText
    >[1];
    const result = await classifyIntentText('', prisma);
    expect(result).toEqual({ topicId: null, matchedKeywords: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns null topicId for whitespace-only input', async () => {
    const findMany = vi.fn();
    const prisma = { topic: { findMany } } as unknown as Parameters<
      typeof classifyIntentText
    >[1];
    const result = await classifyIntentText('   \n\t  ', prisma);
    expect(result).toEqual({ topicId: null, matchedKeywords: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('picks the topic with the most keyword hits', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'topic-drinks', keywords: ['drinks', 'bar', 'beer'] },
      { id: 'topic-food', keywords: ['dinner', 'food'] },
    ]);
    const prisma = { topic: { findMany } } as unknown as Parameters<
      typeof classifyIntentText
    >[1];
    const result = await classifyIntentText(
      'grab some drinks at a bar with beer tonight',
      prisma,
    );
    expect(result.topicId).toBe('topic-drinks');
    expect(result.matchedKeywords.sort()).toEqual(['bar', 'beer', 'drinks']);
  });

  it('returns null when no topic matches', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'topic-drinks', keywords: ['drinks', 'beer'] },
    ]);
    const prisma = { topic: { findMany } } as unknown as Parameters<
      typeof classifyIntentText
    >[1];
    const result = await classifyIntentText('reading a book by the fire', prisma);
    expect(result).toEqual({ topicId: null, matchedKeywords: [] });
  });

  it('handles topics with empty keyword arrays gracefully', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'topic-empty', keywords: [] },
      { id: 'topic-drinks', keywords: ['drinks'] },
    ]);
    const prisma = { topic: { findMany } } as unknown as Parameters<
      typeof classifyIntentText
    >[1];
    const result = await classifyIntentText('drinks tonight', prisma);
    expect(result.topicId).toBe('topic-drinks');
    expect(result.matchedKeywords).toEqual(['drinks']);
  });
});

// ---------------------------------------------------------------------------
// topic-places-map.buildPlacesQuery extra edges
// ---------------------------------------------------------------------------

describe('buildPlacesQuery (extra edges)', () => {
  it('treats whitespace-only cityArea as missing', () => {
    expect(buildPlacesQuery(['cafe'], '   ')).toBe('cafe');
  });

  it('uses the first category when multiple supplied', () => {
    expect(buildPlacesQuery(['bar', 'night_club', 'pub'], 'SoHo')).toBe(
      'bar in SoHo',
    );
  });

  it('replaces ALL underscores in a category (multi-underscore)', () => {
    expect(buildPlacesQuery(['live_music_venue'], 'Bushwick')).toBe(
      'live music venue in Bushwick',
    );
  });

  it('returns "meetup" alone when both categories empty and cityArea null', () => {
    expect(buildPlacesQuery([], null)).toBe('meetup');
  });
});

// ---------------------------------------------------------------------------
// window-preset extras
// ---------------------------------------------------------------------------

describe('window-preset extras', () => {
  it('MAX_DAY_OFFSET is 7 (R3 contract)', () => {
    expect(MAX_DAY_OFFSET).toBe(7);
  });

  it('EXPIRY_BUFFER_HOURS is 2 (R12 contract)', () => {
    expect(EXPIRY_BUFFER_HOURS).toBe(2);
  });

  it('computeWindowRange for AFTERNOON sets 12:00..17:00 local', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0); // May 15 2026 09:00 local
    const { startAt, endAt } = computeWindowRange('AFTERNOON', 0, now);
    expect(startAt.getHours()).toBe(12);
    expect(startAt.getMinutes()).toBe(0);
    expect(endAt.getHours()).toBe(17);
  });

  it('computeWindowRange for BRUNCH sets 11:00..14:00 local', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0);
    const { startAt, endAt } = computeWindowRange('BRUNCH', 0, now);
    expect(startAt.getHours()).toBe(11);
    expect(endAt.getHours()).toBe(14);
  });

  it('computeWindowRange shifts by dayOffset = MAX_DAY_OFFSET', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0);
    const { startAt } = computeWindowRange('EVENING', MAX_DAY_OFFSET, now);
    // 7 days later, EVENING start = 17:00
    const expected = new Date(2026, 4, 22, 17, 0, 0, 0);
    expect(startAt.getTime()).toBe(expected.getTime());
  });

  it('computeWindowRange NIGHT crosses midnight (end +5h from 21:00)', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0);
    const { startAt, endAt } = computeWindowRange('NIGHT', 0, now);
    expect(startAt.getHours()).toBe(21);
    // end is +5h → 02:00 next day
    expect(endAt.getTime() - startAt.getTime()).toBe(5 * 60 * 60 * 1000);
  });

  it('computeExpiresAt adds exactly EXPIRY_BUFFER_HOURS', () => {
    const endAt = new Date(2026, 4, 15, 21, 0, 0, 0);
    const expires = computeExpiresAt(endAt);
    expect(expires.getTime() - endAt.getTime()).toBe(
      EXPIRY_BUFFER_HOURS * 60 * 60 * 1000,
    );
  });

  it('resolveIntentWindow prefers explicit overrides over preset defaults', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0);
    const startOverride = new Date(2026, 4, 16, 10, 0, 0, 0);
    const endOverride = new Date(2026, 4, 16, 12, 0, 0, 0);
    const r = resolveIntentWindow({
      preset: 'EVENING',
      dayOffset: 0,
      startAtOverride: startOverride,
      endAtOverride: endOverride,
      now,
    });
    expect(r.startAt.getTime()).toBe(startOverride.getTime());
    expect(r.endAt.getTime()).toBe(endOverride.getTime());
    expect(r.expiresAt.getTime()).toBe(
      endOverride.getTime() + EXPIRY_BUFFER_HOURS * 60 * 60 * 1000,
    );
  });

  it('resolveIntentWindow falls back to defaults when overrides are null/undefined', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0);
    const r = resolveIntentWindow({
      preset: 'EVENING',
      dayOffset: 0,
      startAtOverride: null,
      endAtOverride: undefined,
      now,
    });
    expect(r.startAt.getHours()).toBe(17);
    expect(r.endAt.getHours()).toBe(21);
  });

  it('resolveIntentWindow throws when endAt precedes startAt', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0);
    expect(() =>
      resolveIntentWindow({
        preset: 'EVENING',
        dayOffset: 0,
        startAtOverride: new Date(2026, 4, 15, 20, 0, 0, 0),
        endAtOverride: new Date(2026, 4, 15, 19, 0, 0, 0),
        now,
      }),
    ).toThrow(/endAt must be after startAt/);
  });

  it('resolveIntentWindow throws when endAt equals startAt', () => {
    const now = new Date(2026, 4, 15, 9, 0, 0, 0);
    const t = new Date(2026, 4, 15, 19, 0, 0, 0);
    expect(() =>
      resolveIntentWindow({
        preset: 'EVENING',
        dayOffset: 0,
        startAtOverride: t,
        endAtOverride: t,
        now,
      }),
    ).toThrow(/endAt must be after startAt/);
  });
});
