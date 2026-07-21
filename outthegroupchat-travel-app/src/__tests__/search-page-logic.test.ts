/**
 * Day-9 [T1] tests for the /search page's pure logic module.
 *
 * Vitest here only collects `*.test.ts` (a `.test.tsx` is silently never run),
 * so page behaviour is asserted through the exported pure helpers in
 * `src/app/search/searchPageLogic.ts` rather than a render harness.
 *
 * Run just this file:
 *   npx vitest run src/__tests__/search-page-logic.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  SEARCH_TYPES,
  SEARCH_TYPE_LABELS,
  MIN_QUERY_LENGTH,
  DEFAULT_SEARCH_LIMIT,
  isQueryTooShort,
  buildSearchQueryString,
  buildSearchUrl,
  flattenSearchResults,
  searchResultHref,
  parseSearchResponse,
  type SearchType,
  type SearchApiData,
  type SearchUserResult,
  type SearchMeetupResult,
  type SearchVenueResult,
} from '@/app/search/searchPageLogic';

function user(overrides: Partial<SearchUserResult> = {}): SearchUserResult {
  return {
    id: 'u1',
    name: 'Ada',
    image: null,
    city: 'Boston',
    bio: null,
    _count: { followers: 3, ownedTrips: 0 },
    ...overrides,
  };
}

function meetup(overrides: Partial<SearchMeetupResult> = {}): SearchMeetupResult {
  return {
    id: 'm1',
    title: 'Coffee run',
    scheduledAt: '2026-08-01T15:00:00.000Z',
    venue: { name: 'Blue Bottle' },
    ...overrides,
  };
}

function venue(overrides: Partial<SearchVenueResult> = {}): SearchVenueResult {
  return {
    id: 'v1',
    name: 'Blue Bottle',
    address: null,
    city: 'Boston',
    category: 'CAFE',
    ...overrides,
  };
}

describe('search page constants', () => {
  it('exposes the four filters in people-first order', () => {
    expect(SEARCH_TYPES).toEqual(['all', 'people', 'meetups', 'venues']);
  });

  it('has a label for every search type', () => {
    for (const type of SEARCH_TYPES) {
      expect(typeof SEARCH_TYPE_LABELS[type]).toBe('string');
      expect(SEARCH_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
    expect(Object.keys(SEARCH_TYPE_LABELS).sort()).toEqual([...SEARCH_TYPES].sort());
  });

  it('pins the API contract numbers', () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(DEFAULT_SEARCH_LIMIT).toBe(10);
  });
});

describe('isQueryTooShort', () => {
  it('is true for an empty string', () => {
    expect(isQueryTooShort('')).toBe(true);
  });

  it('is true for whitespace only', () => {
    expect(isQueryTooShort('   ')).toBe(true);
    expect(isQueryTooShort('\t\n ')).toBe(true);
  });

  it('is true one character below the boundary', () => {
    expect(isQueryTooShort('a')).toBe(true);
  });

  it('is false exactly at the 2-character boundary', () => {
    expect(isQueryTooShort('ab')).toBe(false);
  });

  it('trims before measuring, so padded 1-char is still too short', () => {
    expect(isQueryTooShort('  a  ')).toBe(true);
    expect(isQueryTooShort('  ab  ')).toBe(false);
  });

  it('counts non-latin characters', () => {
    expect(isQueryTooShort('東京')).toBe(false);
  });
});

describe('buildSearchQueryString', () => {
  it('emits q/type/limit with no leading ?', () => {
    const qs = buildSearchQueryString({ q: 'ada', type: 'people' });
    expect(qs.startsWith('?')).toBe(false);
    const parsed = new URLSearchParams(qs);
    expect(parsed.get('q')).toBe('ada');
    expect(parsed.get('type')).toBe('people');
    expect(parsed.get('limit')).toBe(String(DEFAULT_SEARCH_LIMIT));
  });

  it('trims the query', () => {
    const parsed = new URLSearchParams(buildSearchQueryString({ q: '  ada  ', type: 'all' }));
    expect(parsed.get('q')).toBe('ada');
  });

  it('clamps limit at the low end (0 -> 1)', () => {
    const parsed = new URLSearchParams(buildSearchQueryString({ q: 'ada', type: 'all', limit: 0 }));
    expect(parsed.get('limit')).toBe('1');
  });

  it('clamps negative limit up to 1', () => {
    const parsed = new URLSearchParams(
      buildSearchQueryString({ q: 'ada', type: 'all', limit: -25 }),
    );
    expect(parsed.get('limit')).toBe('1');
  });

  it('clamps limit at the high end (51 -> 50)', () => {
    const parsed = new URLSearchParams(buildSearchQueryString({ q: 'ada', type: 'all', limit: 51 }));
    expect(parsed.get('limit')).toBe('50');
  });

  it('allows the exact bounds 1 and 50 through unchanged', () => {
    expect(
      new URLSearchParams(buildSearchQueryString({ q: 'ada', type: 'all', limit: 1 })).get('limit'),
    ).toBe('1');
    expect(
      new URLSearchParams(buildSearchQueryString({ q: 'ada', type: 'all', limit: 50 })).get('limit'),
    ).toBe('50');
  });

  it('truncates a non-integer limit to an integer', () => {
    const parsed = new URLSearchParams(
      buildSearchQueryString({ q: 'ada', type: 'all', limit: 12.9 }),
    );
    expect(parsed.get('limit')).toBe('12');
  });

  it('never emits a fractional or NaN limit', () => {
    for (const limit of [0.4, 7.5, 49.99, 50.5]) {
      const value = new URLSearchParams(
        buildSearchQueryString({ q: 'ada', type: 'all', limit }),
      ).get('limit');
      expect(value).toMatch(/^\d+$/);
      const numeric = Number(value);
      expect(Number.isInteger(numeric)).toBe(true);
      expect(numeric).toBeGreaterThanOrEqual(1);
      expect(numeric).toBeLessThanOrEqual(50);
    }
  });

  it('URL-encodes unsafe characters in q so they round-trip intact', () => {
    const raw = 'a&b=c#d?e f/g+h%i';
    const qs = buildSearchQueryString({ q: raw, type: 'people' });
    // The raw ampersand/equals/hash must not leak into the wire format...
    expect(qs).not.toContain('a&b');
    expect(qs).not.toContain('#');
    // ...and the value must decode back to exactly what was passed in.
    const parsed = new URLSearchParams(qs);
    expect(parsed.get('q')).toBe(raw);
    expect(parsed.get('type')).toBe('people');
    expect(parsed.get('limit')).toBe(String(DEFAULT_SEARCH_LIMIT));
  });

  it('encodes unicode and emoji queries losslessly', () => {
    const raw = '東京 café 🎉';
    const parsed = new URLSearchParams(buildSearchQueryString({ q: raw, type: 'all' }));
    expect(parsed.get('q')).toBe(raw);
  });

  it('builds a distinct string per search type', () => {
    const seen = new Set(SEARCH_TYPES.map((type) => buildSearchQueryString({ q: 'ada', type })));
    expect(seen.size).toBe(SEARCH_TYPES.length);
  });
});

describe('buildSearchUrl', () => {
  it('prefixes the API path and a single ?', () => {
    const url = buildSearchUrl({ q: 'ada', type: 'meetups', limit: 5 });
    expect(url).toBe(`/api/search?${buildSearchQueryString({ q: 'ada', type: 'meetups', limit: 5 })}`);
    expect(url.startsWith('/api/search?')).toBe(true);
    expect(url.split('?')).toHaveLength(2);
  });

  it('keeps unsafe query characters encoded in the full URL', () => {
    const raw = 'a&type=venues';
    const url = buildSearchUrl({ q: raw, type: 'people' });
    const parsed = new URL(url, 'https://example.test');
    // If `q` were unencoded, the injected `type=venues` would win here.
    expect(parsed.searchParams.get('type')).toBe('people');
    expect(parsed.searchParams.get('q')).toBe(raw);
  });
});

describe('flattenSearchResults', () => {
  it('returns [] for null and undefined', () => {
    expect(flattenSearchResults(null)).toEqual([]);
    expect(flattenSearchResults(undefined)).toEqual([]);
  });

  it('returns [] for an empty envelope', () => {
    expect(flattenSearchResults({})).toEqual([]);
  });

  it('returns [] when every key is present but empty', () => {
    expect(flattenSearchResults({ users: [], meetups: [], venues: [] })).toEqual([]);
  });

  it('orders people first, then meetups, then venues', () => {
    const items = flattenSearchResults({
      venues: [venue({ id: 'v1' })],
      meetups: [meetup({ id: 'm1' })],
      users: [user({ id: 'u1' })],
    });
    expect(items.map((item) => item.kind)).toEqual(['user', 'meetup', 'venue']);
    expect(items.map((item) => item.id)).toEqual(['u1', 'm1', 'v1']);
  });

  it('preserves within-group order', () => {
    const items = flattenSearchResults({
      users: [user({ id: 'u1' }), user({ id: 'u2' }), user({ id: 'u3' })],
    });
    expect(items.map((item) => item.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('handles an envelope with only some keys present', () => {
    const onlyMeetups = flattenSearchResults({ meetups: [meetup({ id: 'm9' })] });
    expect(onlyMeetups).toHaveLength(1);
    expect(onlyMeetups[0].kind).toBe('meetup');

    const onlyVenues = flattenSearchResults({ venues: [venue({ id: 'v9' })] });
    expect(onlyVenues).toHaveLength(1);
    expect(onlyVenues[0].kind).toBe('venue');
  });

  it('reads people results from the `users` key, not `people`', () => {
    // The request param is `people` but the RESPONSE key is `users`.
    const mislabelled = { people: [user()] } as unknown as SearchApiData;
    expect(flattenSearchResults(mislabelled)).toEqual([]);
    expect(flattenSearchResults({ users: [user()] })).toHaveLength(1);
  });

  it('falls back to a placeholder title for a nameless user', () => {
    const [item] = flattenSearchResults({ users: [user({ name: null })] });
    expect(item.title).toBe('Someone');
  });

  it('singularises the follower count at 1 and pluralises otherwise', () => {
    const one = flattenSearchResults({
      users: [user({ city: null, _count: { followers: 1, ownedTrips: 0 } })],
    });
    expect(one[0].subtitle).toBe('1 Crew');

    const zero = flattenSearchResults({
      users: [user({ city: null, _count: { followers: 0, ownedTrips: 0 } })],
    });
    expect(zero[0].subtitle).toBe('0 Crew');

    const many = flattenSearchResults({
      users: [user({ city: null, _count: { followers: 2, ownedTrips: 0 } })],
    });
    expect(many[0].subtitle).toBe('2 Crew');
  });

  it('joins city and follower count when a city exists', () => {
    const [item] = flattenSearchResults({ users: [user({ city: 'Boston' })] });
    expect(item.subtitle).toBe('Boston · 3 Crew');
  });

  it('carries the user image through and leaves other kinds imageless', () => {
    const items = flattenSearchResults({
      users: [user({ image: 'https://cdn.test/a.png' })],
      meetups: [meetup()],
      venues: [venue()],
    });
    expect(items[0].image).toBe('https://cdn.test/a.png');
    expect(items[1].image).toBeNull();
    expect(items[2].image).toBeNull();
  });

  it('omits the date for a meetup with an unparseable scheduledAt', () => {
    const [item] = flattenSearchResults({
      meetups: [meetup({ scheduledAt: 'not-a-date', venue: { name: 'Blue Bottle' } })],
    });
    expect(item.subtitle).toBe('Blue Bottle');
  });

  it('omits the venue name for a venueless meetup', () => {
    const [item] = flattenSearchResults({
      meetups: [meetup({ venue: null, scheduledAt: 'not-a-date' })],
    });
    expect(item.subtitle).toBe('');
  });

  it('builds venue subtitles from category and city', () => {
    const [item] = flattenSearchResults({ venues: [venue()] });
    expect(item.subtitle).toBe('CAFE · Boston');
  });

  it('does not mutate the input envelope', () => {
    const data: SearchApiData = { users: [user()], meetups: [meetup()], venues: [venue()] };
    const snapshot = JSON.parse(JSON.stringify(data)) as SearchApiData;
    flattenSearchResults(data);
    expect(data).toEqual(snapshot);
  });
});

describe('searchResultHref', () => {
  it('links a user to their profile', () => {
    expect(searchResultHref({ id: 'u1', kind: 'user' })).toBe('/profile/u1');
  });

  it('links a meetup to its detail page', () => {
    expect(searchResultHref({ id: 'm1', kind: 'meetup' })).toBe('/meetups/m1');
  });

  it('returns null for a venue (there is no venue route)', () => {
    expect(searchResultHref({ id: 'v1', kind: 'venue' })).toBeNull();
  });

  it('returns null rather than throwing for an unknown kind', () => {
    const rogue = { id: 'x1', kind: 'planet' } as unknown as { id: string; kind: 'user' };
    expect(searchResultHref(rogue)).toBeNull();
  });
});

describe('parseSearchResponse', () => {
  it('unwraps a successful envelope to its data payload', () => {
    const data: SearchApiData = { users: [user()], meetups: [], venues: [] };
    expect(parseSearchResponse({ success: true, data })).toEqual(data);
  });

  it('accepts an empty data object (short query returns 200 + empty arrays)', () => {
    expect(parseSearchResponse({ success: true, data: {} })).toEqual({});
  });

  it('returns null for a 401/400 error envelope with no success field', () => {
    expect(parseSearchResponse({ error: 'Unauthorized' })).toBeNull();
    expect(parseSearchResponse({ error: 'Invalid query parameters' })).toBeNull();
  });

  it('returns null for success:false', () => {
    expect(parseSearchResponse({ success: false, data: { users: [] } })).toBeNull();
  });

  it('returns null for a truthy-but-not-true success flag', () => {
    expect(parseSearchResponse({ success: 'true', data: {} })).toBeNull();
    expect(parseSearchResponse({ success: 1, data: {} })).toBeNull();
  });

  it('returns null for null, undefined and {}', () => {
    expect(parseSearchResponse(null)).toBeNull();
    expect(parseSearchResponse(undefined)).toBeNull();
    expect(parseSearchResponse({})).toBeNull();
  });

  it('returns null for non-object junk', () => {
    expect(parseSearchResponse('ok')).toBeNull();
    expect(parseSearchResponse(42)).toBeNull();
    expect(parseSearchResponse(true)).toBeNull();
    expect(parseSearchResponse(() => undefined)).toBeNull();
  });

  it('returns null when data is missing or not an object', () => {
    expect(parseSearchResponse({ success: true })).toBeNull();
    expect(parseSearchResponse({ success: true, data: null })).toBeNull();
    expect(parseSearchResponse({ success: true, data: 'users' })).toBeNull();
  });

  it('returns null for a bare data payload passed without its envelope', () => {
    // The Day-8 bug class, inverted: bare payload where an envelope is required.
    expect(parseSearchResponse({ users: [user()], meetups: [], venues: [] })).toBeNull();
  });

  it('returns null for a bare array', () => {
    expect(parseSearchResponse([])).toBeNull();
    expect(parseSearchResponse([user()])).toBeNull();
  });

  it('composes with flattenSearchResults end to end', () => {
    const body = {
      success: true,
      data: { users: [user({ id: 'u1' })], venues: [venue({ id: 'v1' })] },
    };
    const parsed = parseSearchResponse(body);
    expect(parsed).not.toBeNull();
    const items = flattenSearchResults(parsed);
    expect(items.map((item) => item.kind)).toEqual(['user', 'venue']);
  });

  it('yields an empty result list when the envelope is fed in whole by mistake', () => {
    // Guards the Day-8 regression: a page that passed the envelope to the
    // flattener rendered permanently empty instead of failing loudly.
    const body = { success: true, data: { users: [user()] } };
    expect(flattenSearchResults(body as unknown as SearchApiData)).toEqual([]);
    expect(flattenSearchResults(parseSearchResponse(body))).toHaveLength(1);
  });
});

describe('type-level sanity', () => {
  it('accepts every SearchType in the URL builders', () => {
    const types: SearchType[] = ['all', 'people', 'meetups', 'venues'];
    for (const type of types) {
      expect(buildSearchUrl({ q: 'ada', type })).toContain(`type=${type}`);
    }
  });
});
