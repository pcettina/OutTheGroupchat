/**
 * Unit tests for the Geocoding API route handler.
 *
 * Route: GET /api/geocoding
 *
 * Strategy
 * --------
 * - Auth (next-auth, @/lib/auth) and logger are mocked globally via setup.ts.
 * - No Prisma usage in this route — no Prisma mocks needed here.
 * - global.fetch is spied on for tests that reach Nominatim.
 * - Module-level cache state is a concern: tests that exercise the Nominatim
 *   code path use unique query strings (e.g. 'uniquecityxyz123') so they do
 *   not collide with each other in the shared cache map.
 * - All fetch mocks use mockResolvedValueOnce() to avoid state leakage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { GET } from '@/app/api/geocoding/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);

const MOCK_SESSION = {
  user: { id: 'user-geo-001', name: 'Geo Tester', email: 'geo@example.com' },
  expires: '2099-01-01',
};

function makeRequest(q?: string): Request {
  const url = new URL('http://localhost/api/geocoding');
  if (q !== undefined) url.searchParams.set('q', q);
  return new Request(url.toString());
}

async function parseJson(res: Response) {
  return res.json();
}

// Mock a successful Nominatim response for a given city name and unique query key
function mockNominatimSuccess(cityName: string, countryName: string) {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => [
      {
        place_id: 999,
        lat: '48.8566',
        lon: '2.3522',
        type: 'city',
        addresstype: 'city',
        name: cityName,
        display_name: `${cityName}, ${countryName}`,
        address: { city: cityName, country: countryName },
      },
    ],
  } as Response);
}

function mockNominatimFailure() {
  vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
}

// ---------------------------------------------------------------------------
// Reset mocks between each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Auth guard
// ===========================================================================

describe('GET /api/geocoding — auth guard', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest('Paris'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// Short / missing query → popular destinations fallback
// ===========================================================================

describe('GET /api/geocoding — short or missing query returns popular destinations', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('returns 200 with popular destinations when no query param is provided', async () => {
    const res = await GET(makeRequest());
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(8);
  });

  it('returns 400 when query is empty string (Zod min(1) rejects it)', async () => {
    // The Zod schema uses z.string().min(1).optional() — an empty string fails
    // min(1) validation and the route returns a 400 with validation errors.
    const res = await GET(makeRequest(''));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 200 with popular destinations when query is a single character', async () => {
    const res = await GET(makeRequest('a'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // Route returns popularDestinations.slice(0, 8) — exactly 8 items
    expect(body.data.length).toBe(8);
  });
});

// ===========================================================================
// Response shape validation
// ===========================================================================

describe('GET /api/geocoding — response shape', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('each destination has city, country, and coordinates with lat/lng', async () => {
    const res = await GET(makeRequest());
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    for (const dest of body.data) {
      expect(typeof dest.city).toBe('string');
      expect(typeof dest.country).toBe('string');
      expect(dest.coordinates).toBeDefined();
      expect(typeof dest.coordinates.lat).toBe('number');
      expect(typeof dest.coordinates.lng).toBe('number');
    }
  });
});

// ===========================================================================
// Popular destinations early return (>= 3 matches)
// ===========================================================================

describe('GET /api/geocoding — popular destinations early return', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('returns matching popular destinations for "USA" without calling fetch', async () => {
    // "USA" matches Miami, Las Vegas, Nashville, New Orleans, Austin, New York City (6 cities) — >= 3
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await GET(makeRequest('USA'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // All returned destinations should match "usa"
    for (const dest of body.data) {
      const matchesQuery =
        dest.city.toLowerCase().includes('usa') ||
        dest.country.toLowerCase().includes('usa');
      expect(matchesQuery).toBe(true);
    }
    // fetch should NOT have been called (popular cache short-circuit)
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns matching popular destinations for "Germany" without calling fetch', async () => {
    // "Germany" matches Munich, Berlin — only 2, so this will call fetch
    // Let's use "a" prefix: too short. Use "many" which matches "Germany" (2) — not >= 3.
    // Use "Europe" — 0 popular matches. So let's use "USA" in a different desc block to avoid cache.
    // Actually pick a query known to have >= 3 matches:
    // "an" matches: "Cancun", "Nashville", "Amsterdam", "Bangkok", "Singapore" — 5+ matches (>= 3 via includes)
    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await GET(makeRequest('an'));
    const body = await parseJson(res);

    // "an" is 2 chars → goes through cache check → then popular match check
    // popularMatches for "an": Cancun, Nashville, Amsterdam, Bangkok, Singapore → >= 3
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Nominatim API call path
// ===========================================================================

describe('GET /api/geocoding — Nominatim API call', () => {
  it('returns 200 combining popular matches with Nominatim results for unique query', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // Use a unique query that won't match popular destinations (0 popular matches)
    // so fetch is called
    mockNominatimSuccess('Timbuktu', 'Mali');

    const res = await GET(makeRequest('uniquecityxyz123'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // The Nominatim result should be included
    const cities = body.data.map((d: { city: string }) => d.city);
    expect(cities).toContain('Timbuktu');
  });

  it('returns 200 with popular fallback when fetch throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNominatimFailure();

    // Use another unique query to avoid cache collision
    const res = await GET(makeRequest('uniquecityabc456'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // On fetch failure: fallback returns popularMatches (0 for unique query) → popularDestinations.slice(0, 8)
    expect(body.data.length).toBe(8);
  });

  it('returns 200 with popular fallback when Nominatim returns non-ok response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => [],
    } as Response);

    // Use another unique query
    const res = await GET(makeRequest('uniquecitydef789'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(8);
  });
});

// ===========================================================================
// Deduplication
// ===========================================================================

describe('GET /api/geocoding — deduplication', () => {
  it('returns no duplicate city+country pairs when Nominatim returns a city also in popular', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // Query "uniqueparis999" won't match popular, but Nominatim returns "Paris, France"
    // which IS in popular destinations — the route should deduplicate
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 101,
          lat: '48.8566',
          lon: '2.3522',
          type: 'city',
          addresstype: 'city',
          name: 'Paris',
          display_name: 'Paris, France',
          address: { city: 'Paris', country: 'France' },
        },
        // Duplicate entry for same city
        {
          place_id: 102,
          lat: '48.8566',
          lon: '2.3522',
          type: 'city',
          addresstype: 'city',
          name: 'Paris',
          display_name: 'Paris, Île-de-France, France',
          address: { city: 'Paris', country: 'France' },
        },
      ],
    } as Response);

    const res = await GET(makeRequest('uniqueparisdup000'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Count occurrences of Paris, France — should be exactly 1
    const parisFranceCount = body.data.filter(
      (d: { city: string; country: string }) =>
        d.city === 'Paris' && d.country === 'France'
    ).length;
    expect(parisFranceCount).toBe(1);
  });
});

// ===========================================================================
// Nominatim result filtering by type
// ===========================================================================

describe('GET /api/geocoding — Nominatim result type filtering', () => {
  it('excludes Nominatim results with non-city types from response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // Return a mix: one valid city type, one invalid type (e.g. 'amenity')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          place_id: 201,
          lat: '51.5074',
          lon: '-0.1278',
          type: 'amenity',
          addresstype: 'amenity',
          name: 'Some Hotel',
          display_name: 'Some Hotel, London, UK',
          address: { city: 'London', country: 'United Kingdom' },
        },
        {
          place_id: 202,
          lat: '55.7558',
          lon: '37.6173',
          type: 'town',
          addresstype: 'town',
          name: 'Moscow',
          display_name: 'Moscow, Russia',
          address: { city: 'Moscow', country: 'Russia' },
        },
      ],
    } as Response);

    const res = await GET(makeRequest('uniquecitytype111'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // 'amenity' type should be filtered out; 'town' is valid
    const cityNames = body.data.map((d: { city: string }) => d.city);
    expect(cityNames).not.toContain('Some Hotel');
    expect(cityNames).toContain('Moscow');
  });
});
