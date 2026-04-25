/**
 * Unit tests for src/lib/intent/topic-places-map.ts (Phase 3 — real impl).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getPlacesCategoriesForTopic,
  buildPlacesQuery,
} from '@/lib/intent/topic-places-map';

const makePrisma = (categories: string[] | null) =>
  ({
    topic: {
      findUnique: vi.fn().mockResolvedValue(
        categories === null ? null : { placesCategories: categories },
      ),
    },
  }) as unknown as Parameters<typeof getPlacesCategoriesForTopic>[1];

describe('getPlacesCategoriesForTopic', () => {
  it('returns the seeded category list', async () => {
    const result = await getPlacesCategoriesForTopic(
      'topic-drinks',
      makePrisma(['bar', 'night_club']),
    );
    expect(result).toEqual(['bar', 'night_club']);
  });

  it('returns [] when topic has no categories', async () => {
    const result = await getPlacesCategoriesForTopic('topic-x', makePrisma([]));
    expect(result).toEqual([]);
  });

  it('returns [] when topic does not exist', async () => {
    const result = await getPlacesCategoriesForTopic('topic-missing', makePrisma(null));
    expect(result).toEqual([]);
  });
});

describe('buildPlacesQuery', () => {
  it('joins category + cityArea display name', () => {
    expect(buildPlacesQuery(['bar'], 'East Village')).toBe('bar in East Village');
  });

  it('strips underscores from multi-word Places categories', () => {
    expect(buildPlacesQuery(['night_club'], 'Williamsburg')).toBe('night club in Williamsburg');
  });

  it('uses "meetup" fallback when no categories supplied', () => {
    expect(buildPlacesQuery([], 'SoHo')).toBe('meetup in SoHo');
  });

  it('returns category-only query when no cityArea', () => {
    expect(buildPlacesQuery(['cafe'], null)).toBe('cafe');
  });
});
