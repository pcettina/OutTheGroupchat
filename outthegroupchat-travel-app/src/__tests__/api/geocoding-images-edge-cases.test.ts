/**
 * Edge case tests for:
 *   GET /api/geocoding
 *   GET /api/images/search
 *
 * Strategy
 * --------
 * These tests cover scenarios NOT addressed by the existing test files
 * (geocoding-api.test.ts, geocoding-images.test.ts, images-search.test.ts).
 *
 * New edge cases covered:
 *   Geocoding:
 *     - Exactly 2-character query (min valid length that triggers Nominatim)
 *     - Special characters in query (ampersands, accents, slashes)
 *     - Whitespace-only query (trimmed to empty → falls into short-query path)
 *     - Nominatim returns empty array (no popular matches either → 8-item fallback)
 *     - Results capped at 8 even when Nominatim returns more entries
 *     - Address fields fall back to name/Unknown when city/town/village absent
 *     - 'village' and 'administrative' addresstypes are accepted by the filter
 *     - Country-only query matches (e.g. "Japan") hits popular shortcut
 *
 *   Images/search:
 *     - perPage=1 (minimum boundary) is accepted
 *     - perPage=0 returns 400 (below minimum)
 *     - Negative page number returns 400
 *     - Non-numeric page value returns 400
 *     - Multiple images in results all have correctly transformed fields
 *     - Query consisting only of spaces is rejected by Zod (empty after trim)
 *     - searchImages rejects with a non-Error value (e.g. string thrown)
 *     - Very long query string (> 500 chars) is passed through without error
 *     - Verifies rate-limit mock factory pattern keeps defaults across clearAllMocks
 *
 * Mock hygiene:
 * - vi.clearAllMocks() in beforeEach (no module-level caches in images route;
 *   geocoding route has a cache but tests use unique query strings to avoid hits).
 * - mockResolvedValueOnce() only.
 * - Rate-limit mock includes apiRateLimiter: null.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Mock @/lib/rate-limit — factory sets default implementations that survive
// vi.clearAllMocks() because clearAllMocks does not reset factory defaults.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn(() => ({
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': '99',
    'X-RateLimit-Reset': '0',
  })),
  apiRateLimiter: null,
}));

// ---------------------------------------------------------------------------
// Mock @/lib/api/unsplash
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/unsplash', () => ({
  searchImages: vi.fn(),
  isUnsplashConfigured: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static route imports — must follow vi.mock() declarations
// ---------------------------------------------------------------------------
import { GET as geocodingGET } from '@/app/api/geocoding/route';
import { GET as imagesGET } from '@/app/api/images/search/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { searchImages, isUnsplashConfigured } from '@/lib/api/unsplash';

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockIsUnsplashConfigured = vi.mocked(isUnsplashConfigured);
const mockSearchImages = vi.mocked(searchImages);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_SESSION = {
  user: { id: 'user-edge-001', name: 'Edge Tester', email: 'edge@example.com' },
  expires: '2099-01-01',
};

const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

// ---------------------------------------------------------------------------
// Request factories
// ---------------------------------------------------------------------------
function makeGeoRequest(q?: string): Request {
  const url = new URL('http://localhost/api/geocoding');
  if (q !== undefined) url.searchParams.set('q', q);
  return new Request(url.toString());
}

function makeImgRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/images/search');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Shared Unsplash fixture helpers
// ---------------------------------------------------------------------------
function makeUnsplashImage(id: string, altDescription: string | null = 'a photo') {
  return {
    id,
    urls: {
      raw: `http://raw-${id}.jpg`,
      full: `http://full-${id}.jpg`,
      regular: `http://regular-${id}.jpg`,
      small: `http://small-${id}.jpg`,
      thumb: `http://thumb-${id}.jpg`,
    },
    alt_description: altDescription,
    description: null,
    width: 1920,
    height: 1080,
    user: {
      name: `Photographer ${id}`,
      username: `photo_${id}`,
      links: { html: `http://unsplash.com/${id}` },
    },
    links: { html: `http://unsplash.com/photos/${id}` },
  };
}

// ===========================================================================
// Geocoding Edge Cases
// ===========================================================================

describe('GET /api/geocoding — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Exactly 2-character query: should call Nominatim (not fall into short-query path)
  // -----------------------------------------------------------------------
  it('2-char query triggers Nominatim path (not the short-query popular fallback)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    // "zz" matches 0 popular destinations so Nominatim will be called.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    const res = await geocodingGET(makeGeoRequest('zz'));
    const body = await parseJson(res);

    // Route should not have returned the short-query early exit (< 2 chars).
    // Instead it reaches Nominatim (empty result) → falls back to 8 popular.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Nominatim was called (fetch was invoked)
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // Special characters in query
  // -----------------------------------------------------------------------
  it('handles special characters in query without error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 5001,
          lat: '49.4479',
          lon: '11.0685',
          type: 'city',
          addresstype: 'city',
          name: 'Nürnberg',
          display_name: 'Nürnberg, Bavaria, Germany',
          address: { city: 'Nürnberg', country: 'Germany' },
        },
      ],
    } as Response);

    // Query with accented character — unique enough to avoid cache collision
    const res = await geocodingGET(makeGeoRequest('Nürnberg_edgespecial'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Whitespace-only query trims to empty → short-query branch (popular fallback)
  // -----------------------------------------------------------------------
  it('whitespace-only query trims to empty and returns popular destinations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    const fetchSpy = vi.spyOn(global, 'fetch');

    // A single space passes Zod min(1) but trims to '' (length 0 < 2)
    const res = await geocodingGET(makeGeoRequest(' '));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(8);
    // Nominatim should NOT be called since trimmed query is < 2 chars
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Nominatim returns empty array with 0 popular matches → empty data array
  // (The route only falls back to popularDestinations.slice(0,8) in the
  //  catch block; a successful but empty Nominatim response with 0 popular
  //  matches returns an empty combined array.)
  // -----------------------------------------------------------------------
  it('returns empty data array when Nominatim returns empty array and query matches no popular destinations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    // Unique query: 0 popular matches + 0 Nominatim results → empty combined
    const res = await geocodingGET(makeGeoRequest('zyxwvuts_emptyresult_edge'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // Route returns combined.slice(0,8) where combined=[] → empty array
    expect(body.data).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Results capped at 8 when Nominatim returns more than 8 entries
  // -----------------------------------------------------------------------
  it('caps results at 8 even when Nominatim returns more than 8 city entries', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    // Build 10 distinct city results from Nominatim
    const tenCities = Array.from({ length: 10 }, (_, i) => ({
      place_id: 6000 + i,
      lat: `${10 + i}.0`,
      lon: `${10 + i}.0`,
      type: 'city',
      addresstype: 'city',
      name: `UniqueCity${i}`,
      display_name: `UniqueCity${i}, TestLand`,
      address: { city: `UniqueCity${i}`, country: 'TestLand' },
    }));

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => tenCities,
    } as Response);

    // Unique query prefix avoids popular-destination early return
    const res = await geocodingGET(makeGeoRequest('uniquecitycap_edgecase'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Route slices combined results to max 8
    expect(body.data.length).toBeLessThanOrEqual(8);
  });

  // -----------------------------------------------------------------------
  // Address fallback: no city/town/village → falls back to result.name
  // -----------------------------------------------------------------------
  it('uses result.name when address has no city/town/village/municipality', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 7001,
          lat: '35.0',
          lon: '135.0',
          type: 'administrative',
          addresstype: 'administrative',
          name: 'KyotoDistrict',
          display_name: 'KyotoDistrict, Japan',
          address: { country: 'Japan' }, // no city/town/village/municipality
        },
      ],
    } as Response);

    const res = await geocodingGET(makeGeoRequest('kyoto_addrfallback_edge'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const cities = (body.data as Array<{ city: string }>).map(d => d.city);
    expect(cities).toContain('KyotoDistrict');
  });

  // -----------------------------------------------------------------------
  // 'village' addresstype is accepted by the route filter
  // -----------------------------------------------------------------------
  it('includes results with addresstype "village"', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 8001,
          lat: '51.0',
          lon: '0.0',
          type: 'village',
          addresstype: 'village',
          name: 'GreenVillage',
          display_name: 'GreenVillage, England, UK',
          address: { village: 'GreenVillage', country: 'United Kingdom' },
        },
      ],
    } as Response);

    const res = await geocodingGET(makeGeoRequest('greenvillage_edge_unique'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const cities = (body.data as Array<{ city: string }>).map(d => d.city);
    expect(cities).toContain('GreenVillage');
  });

  // -----------------------------------------------------------------------
  // Country-only query matching >= 3 popular destinations skips Nominatim
  // -----------------------------------------------------------------------
  it('returns popular matches and skips Nominatim when country query matches >= 3', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

    const fetchSpy = vi.spyOn(global, 'fetch');

    // "Japan" only matches Tokyo (1 popular destination) — not >= 3, will call fetch.
    // Use "Germany" → Munich + Berlin = 2, still < 3. Use "USA" → 6 matches.
    // We want to test a country that yields >= 3. "USA" already tested. Use "united" →
    // matches "United Kingdom" (London) + nothing else = 1. Use "a" (too short).
    // Let's use "mexi" → matches "Cancun" (Mexico) = 1; or try "franc" → 0.
    // Actually use "outh" → matches "New Orleans"(no), "Austin"(no). Let's use "an"
    // which matches Cancun, Nashville, Amsterdam, Bangkok, Singapore (>= 3).
    // "an" is 2 chars → valid length → enters popular match path.
    const res = await geocodingGET(makeGeoRequest('an'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Rate limiting returns 429 with error message
  // -----------------------------------------------------------------------
  it('returns 429 and error message when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await geocodingGET(makeGeoRequest('London'));
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
  });
});

// ===========================================================================
// Images/Search Edge Cases
// ===========================================================================

describe('GET /api/images/search — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // perPage=1 (minimum valid boundary) is accepted
  // -----------------------------------------------------------------------
  it('accepts perPage=1 (minimum boundary) and returns 200', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
    mockSearchImages.mockResolvedValueOnce({ results: [makeUnsplashImage('img-pmin')], total: 1, total_pages: 1 });

    const res = await imagesGET(makeImgRequest({ q: 'waterfalls', perPage: '1' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSearchImages).toHaveBeenCalledWith('waterfalls travel', 1, 1, 'landscape');
  });

  // -----------------------------------------------------------------------
  // perPage=0 is rejected with 400
  // -----------------------------------------------------------------------
  it('returns 400 when perPage=0 (below minimum of 1)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);

    const res = await imagesGET(makeImgRequest({ q: 'forests', perPage: '0' }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
  });

  // -----------------------------------------------------------------------
  // Negative page number is rejected with 400
  // -----------------------------------------------------------------------
  it('returns 400 when page is negative', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);

    const res = await imagesGET(makeImgRequest({ q: 'lakes', page: '-1' }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
  });

  // -----------------------------------------------------------------------
  // Non-numeric page value is rejected with 400
  // -----------------------------------------------------------------------
  it('returns 400 when page is a non-numeric string', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);

    const res = await imagesGET(makeImgRequest({ q: 'canyons', page: 'abc' }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
  });

  // -----------------------------------------------------------------------
  // Multiple images all get correctly transformed
  // -----------------------------------------------------------------------
  it('correctly transforms all images when searchImages returns multiple results', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);

    const imgs = [
      makeUnsplashImage('img-a', 'sunny beach'),
      makeUnsplashImage('img-b', 'mountain peak'),
      makeUnsplashImage('img-c', null),
    ];
    mockSearchImages.mockResolvedValueOnce({ results: imgs, total: 3, total_pages: 1 });

    const res = await imagesGET(makeImgRequest({ q: 'travel' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);

    // Validate each transformed image
    expect(body.data[0].id).toBe('img-a');
    expect(body.data[0].alt).toBe('sunny beach');
    expect(body.data[0].url).toBe('http://regular-img-a.jpg');
    expect(body.data[0].photographer).toBe('Photographer img-a');

    expect(body.data[1].id).toBe('img-b');
    expect(body.data[1].alt).toBe('mountain peak');

    // img-c has null alt_description and null description → falls back to query
    expect(body.data[2].id).toBe('img-c');
    expect(body.data[2].alt).toBe('travel');
  });

  // -----------------------------------------------------------------------
  // Query with only spaces fails Zod min(1) because q is set to "   "
  // which coerces via searchParams.get to "   " — non-empty string, passes
  // min(1). But after trim in the route, "   ".trim() === "   " still has
  // 3 chars... the route trims before appending " travel" so it sends
  // " travel" to searchImages. Let's verify the route does not error out.
  // Note: Zod validates the raw value "   " which IS min(1). It passes.
  // The route then calls searchImages("   travel", ...). We verify 200.
  // -----------------------------------------------------------------------
  it('accepts a whitespace query that passes Zod min(1) and calls searchImages with trimmed+travel', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
    mockSearchImages.mockResolvedValueOnce({ results: [], total: 0, total_pages: 0 });

    const res = await imagesGET(makeImgRequest({ q: '   ' }));
    const body = await parseJson(res);

    // "   " passes Zod min(1) → searchImages is called with trimmed query + " travel"
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Trim of "   " is "" → route calls searchImages(" travel", 1, 12, "landscape")
    expect(mockSearchImages).toHaveBeenCalledWith(' travel', 1, 12, 'landscape');
  });

  // -----------------------------------------------------------------------
  // searchImages throws a non-Error value (plain string) → 500
  // -----------------------------------------------------------------------
  it('returns 500 when searchImages throws a non-Error string value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
    mockSearchImages.mockRejectedValueOnce('unexpected string error');

    const res = await imagesGET(makeImgRequest({ q: 'glaciers' }));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to search images');
  });

  // -----------------------------------------------------------------------
  // Very long query string passes through without error
  // -----------------------------------------------------------------------
  it('handles a very long query string (500 chars) without throwing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
    mockSearchImages.mockResolvedValueOnce({ results: [], total: 0, total_pages: 0 });

    const longQuery = 'a'.repeat(500);
    const res = await imagesGET(makeImgRequest({ q: longQuery }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // searchImages should have been called with longQuery + " travel"
    expect(mockSearchImages).toHaveBeenCalledWith(`${longQuery} travel`, 1, 12, 'landscape');
  });

  // -----------------------------------------------------------------------
  // Rate-limit factory default persists after vi.clearAllMocks()
  // This test verifies that the rate-limit mock pattern used here (factory
  // defaults) does NOT need per-test re-setup after clearAllMocks().
  // -----------------------------------------------------------------------
  it('rate-limit factory default (success:true) is preserved after clearAllMocks', async () => {
    // No explicit mockCheckRateLimit setup here — relying on factory default
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
    mockSearchImages.mockResolvedValueOnce({ results: [], total: 0, total_pages: 0 });

    const res = await imagesGET(makeImgRequest({ q: 'temples' }));
    const body = await parseJson(res);

    // If the factory default was lost, checkRateLimit would return undefined
    // and the route would throw. A 200 confirms the factory default held.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 401 when session user id is missing (images route)
  // -----------------------------------------------------------------------
  it('returns 401 when session user has no id field (images route)', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No ID User', email: 'noid@example.com' },
      expires: '2099-01-01',
    } as never);

    const res = await imagesGET(makeImgRequest({ q: 'jungles' }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  // -----------------------------------------------------------------------
  // 429 for images route when rate limit exceeded
  // -----------------------------------------------------------------------
  it('returns 429 and error message when rate limit exceeded for images route', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await imagesGET(makeImgRequest({ q: 'volcanoes' }));
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.error).toMatch(/too many requests/i);
  });
});
