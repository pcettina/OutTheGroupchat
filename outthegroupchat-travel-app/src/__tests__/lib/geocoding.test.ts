/**
 * Unit tests for src/lib/geocoding.ts
 *
 * Strategy
 * --------
 * The geocoding module uses the global `fetch` to call the Nominatim API.
 * We replace `global.fetch` with a vi.fn() stub so no real HTTP calls are made.
 * We also call clearGeocodingCache() before each test to ensure the module's
 * in-memory cache does not interfere with test isolation.
 *
 * The internal rate-limiting delay (1.1 s) is bypassed by setting
 * lastRequestTime via the first mocked response being immediate — the
 * tests manipulate Date.now if needed, but mostly just let the fetch mock
 * resolve synchronously so the wait is zero or near-zero.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchDestinations,
  getDestinationCoordinates,
  searchDestinationsWithFallback,
  popularDestinations,
  clearGeocodingCache,
} from '@/lib/geocoding';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal Nominatim result for Paris, France */
const PARIS_RESULT = {
  place_id: 1,
  licence: '',
  osm_type: 'relation',
  osm_id: 7444,
  lat: '48.8566',
  lon: '2.3522',
  class: 'place',
  type: 'city',
  place_rank: 15,
  importance: 0.9,
  addresstype: 'city',
  name: 'Paris',
  display_name: 'Paris, France',
  address: { city: 'Paris', country: 'France', country_code: 'fr' },
  boundingbox: ['48.8', '48.9', '2.2', '2.5'],
};

/** Nominatim result for a town (valid type) */
const ROME_RESULT = {
  ...PARIS_RESULT,
  lat: '41.9028',
  lon: '12.4964',
  name: 'Rome',
  display_name: 'Rome, Italy',
  address: { city: 'Rome', country: 'Italy', country_code: 'it' },
  type: 'city',
  addresstype: 'city',
};

/** Helper: build a successful fetch Response wrapping a JSON body. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Shared setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  clearGeocodingCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// searchDestinations
// ===========================================================================
describe('searchDestinations', () => {
  it('returns an empty array for a query shorter than 2 characters', async () => {
    const result = await searchDestinations('P');
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns an empty array for an empty string', async () => {
    const result = await searchDestinations('');
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the Nominatim API with the correct query parameter', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT]));

    await searchDestinations('Paris');

    expect(mockFetch).toHaveBeenCalledOnce();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect(url).toContain('q=Paris');
  });

  it('returns a Destination with city, country and coordinates for a valid result', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT]));

    const results = await searchDestinations('Paris');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      city: 'Paris',
      country: 'France',
      coordinates: { lat: 48.8566, lng: 2.3522 },
    });
  });

  it('parses lat/lng as floats (not strings)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT]));

    const results = await searchDestinations('Paris');

    expect(typeof results[0].coordinates!.lat).toBe('number');
    expect(typeof results[0].coordinates!.lng).toBe('number');
  });

  it('deduplicates results that share city + country', async () => {
    // Two Paris results from the API
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT, PARIS_RESULT]));

    const results = await searchDestinations('Paris');

    expect(results).toHaveLength(1);
  });

  it('filters out results with unsupported type (e.g. "suburb")', async () => {
    const suburb = { ...PARIS_RESULT, type: 'suburb', addresstype: 'suburb' };
    mockFetch.mockResolvedValueOnce(jsonResponse([suburb]));

    const results = await searchDestinations('something');

    expect(results).toHaveLength(0);
  });

  it('returns multiple results for multiple valid API entries', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT, ROME_RESULT]));

    const results = await searchDestinations('Europe');

    expect(results).toHaveLength(2);
    expect(results.map(r => r.city)).toContain('Paris');
    expect(results.map(r => r.city)).toContain('Rome');
  });

  it('returns an empty array when the API returns a non-OK status', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const results = await searchDestinations('nowhere');

    expect(results).toEqual([]);
  });

  it('returns an empty array when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const results = await searchDestinations('Paris');

    expect(results).toEqual([]);
  });

  it('returns a cached result on the second call without re-fetching', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT]));

    await searchDestinations('Paris');
    const second = await searchDestinations('Paris');

    // fetch should only have been called once
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(second).toHaveLength(1);
  });

  it('is case-insensitive when checking the cache', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT]));

    await searchDestinations('Paris');
    await searchDestinations('paris'); // same key after toLowerCase

    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// getDestinationCoordinates
// ===========================================================================
describe('getDestinationCoordinates', () => {
  it('returns lat/lng for a known city + country pair', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT]));

    const coords = await getDestinationCoordinates('Paris', 'France');

    expect(coords).toEqual({ lat: 48.8566, lng: 2.3522 });
  });

  it('returns null when the API returns an empty array', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    const coords = await getDestinationCoordinates('Nowhere', 'Utopia');

    expect(coords).toBeNull();
  });

  it('returns null when the API returns a non-OK status', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Error', { status: 500 }));

    const coords = await getDestinationCoordinates('Paris', 'France');

    expect(coords).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));

    const coords = await getDestinationCoordinates('Paris', 'France');

    expect(coords).toBeNull();
  });

  it('returns cached coordinates on the second call without re-fetching', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT]));

    const first = await getDestinationCoordinates('Paris', 'France');
    const second = await getDestinationCoordinates('Paris', 'France');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(first).toEqual(second);
  });
});

// ===========================================================================
// searchDestinationsWithFallback
// ===========================================================================
describe('searchDestinationsWithFallback', () => {
  it('returns popular destinations slice when query is empty', async () => {
    const results = await searchDestinationsWithFallback('');
    expect(results).toHaveLength(8);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns popular destinations slice when query is a single character', async () => {
    const results = await searchDestinationsWithFallback('P');
    // Still too short for the API; falls back to popular matches or slice
    expect(results.length).toBeGreaterThan(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns popular matches without calling the API when 3+ popular destinations match', async () => {
    // "usa" matches Miami, Las Vegas, Nashville, New Orleans, Austin, New York City, ...
    const results = await searchDestinationsWithFallback('usa');
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls the API and merges results when popular matches are fewer than 3', async () => {
    // "Barcelona" matches only 1 popular destination
    mockFetch.mockResolvedValueOnce(jsonResponse([PARIS_RESULT, ROME_RESULT]));

    const results = await searchDestinationsWithFallback('Barcelona');

    expect(mockFetch).toHaveBeenCalledOnce();
    // Should include the popular Barcelona entry + API results (no dups)
    expect(results.length).toBeGreaterThan(0);
  });

  it('falls back to popular matches when the API throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network down'));

    const results = await searchDestinationsWithFallback('Barcelona');

    expect(results.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// popularDestinations (static data sanity checks)
// ===========================================================================
describe('popularDestinations', () => {
  it('contains at least 10 destinations', () => {
    expect(popularDestinations.length).toBeGreaterThanOrEqual(10);
  });

  it('every entry has a city, country and valid coordinates', () => {
    for (const dest of popularDestinations) {
      expect(dest.city).toBeTruthy();
      expect(dest.country).toBeTruthy();
      expect(dest.coordinates).toBeDefined();
      expect(typeof dest.coordinates!.lat).toBe('number');
      expect(typeof dest.coordinates!.lng).toBe('number');
    }
  });
});

// ===========================================================================
// clearGeocodingCache
// ===========================================================================
describe('clearGeocodingCache', () => {
  it('forces a fresh API call after the cache is cleared', async () => {
    mockFetch.mockResolvedValue(jsonResponse([PARIS_RESULT]));

    await searchDestinations('Paris');
    clearGeocodingCache();
    await searchDestinations('Paris');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
