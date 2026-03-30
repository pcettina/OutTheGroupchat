/**
 * Unit tests for:
 *   GET /api/geocoding
 *   GET /api/images/search
 *
 * Strategy
 * --------
 * - Auth (next-auth, @/lib/auth) and logger are mocked globally via setup.ts.
 * - Rate limiting is mocked via @/lib/rate-limit.
 * - '@/lib/api/unsplash' is mocked locally for image-search tests.
 * - global.fetch is spied on for geocoding tests that reach Nominatim.
 * - Module-level cache in the geocoding route means tests that trigger a
 *   Nominatim fetch must use unique query strings to avoid cross-test cache hits.
 * - All mock returns use mockResolvedValueOnce / mockReturnValueOnce.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

// ---------------------------------------------------------------------------
// Mock @/lib/rate-limit so tests control success/failure independently
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn(() => ({
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': '99',
    'X-RateLimit-Reset': '0',
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/api/unsplash
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/unsplash', () => ({
  searchImages: vi.fn(),
  isUnsplashConfigured: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static imports (must come AFTER vi.mock declarations)
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
const MOCK_SESSION_GEO = {
  user: { id: 'user-geo-combined-001', name: 'Geo Tester', email: 'geo@example.com' },
  expires: '2099-01-01',
};

const MOCK_SESSION_IMG = {
  user: { id: 'user-img-combined-001', name: 'Image Tester', email: 'img@example.com' },
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

// ===========================================================================
// ██████  Geocoding Route Tests
// ===========================================================================

describe('GET /api/geocoding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Auth guard
  // -----------------------------------------------------------------------
  describe('auth guard', () => {
    it('returns 401 when no session exists', async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await geocodingGET(makeGeoRequest('Paris'));
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when session has no user id', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { name: 'No ID' },
        expires: '2099-01-01',
      } as never);

      const res = await geocodingGET(makeGeoRequest('Paris'));
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  // -----------------------------------------------------------------------
  // Rate limiting
  // -----------------------------------------------------------------------
  describe('rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

      const res = await geocodingGET(makeGeoRequest('Paris'));
      const body = await parseJson(res);

      expect(res.status).toBe(429);
      expect(body.error).toMatch(/too many requests/i);
    });
  });

  // -----------------------------------------------------------------------
  // Zod validation
  // -----------------------------------------------------------------------
  describe('Zod validation', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    });

    it('returns 400 when q is an empty string (fails min(1))', async () => {
      const res = await geocodingGET(makeGeoRequest(''));
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBeDefined();
    });

    it('returns 200 when q param is absent (optional field)', async () => {
      const res = await geocodingGET(makeGeoRequest());
      const body = await parseJson(res);

      // No q → query is undefined → falls into short-query branch → popular destinations
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Short / missing query — popular destinations fallback
  // -----------------------------------------------------------------------
  describe('short query returns popular destinations', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    });

    it('returns 8 popular destinations when no q param is given', async () => {
      const res = await geocodingGET(makeGeoRequest());
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(8);
    });

    it('returns 8 popular destinations when q is a single character', async () => {
      const res = await geocodingGET(makeGeoRequest('x'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(8);
    });

    it('each popular destination has the expected shape', async () => {
      const res = await geocodingGET(makeGeoRequest());
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      for (const dest of body.data as Array<Record<string, unknown>>) {
        expect(typeof dest.city).toBe('string');
        expect(typeof dest.country).toBe('string');
        expect(dest.coordinates).toBeDefined();
        const coords = dest.coordinates as Record<string, unknown>;
        expect(typeof coords.lat).toBe('number');
        expect(typeof coords.lng).toBe('number');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Popular destinations early return (>= 3 matches skip Nominatim)
  // -----------------------------------------------------------------------
  describe('popular destinations early return', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    });

    it('returns USA-matching destinations without calling fetch', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const res = await geocodingGET(makeGeoRequest('USA'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // All returned destinations should match "usa"
      for (const dest of body.data as Array<{ city: string; country: string }>) {
        const matches =
          dest.city.toLowerCase().includes('usa') ||
          dest.country.toLowerCase().includes('usa');
        expect(matches).toBe(true);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not call fetch when query matches >= 3 popular destinations', async () => {
      // "an" matches Cancun, Nashville, Amsterdam, Bangkok, Singapore (>= 3)
      const fetchSpy = vi.spyOn(global, 'fetch');

      const res = await geocodingGET(makeGeoRequest('an'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(3);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Nominatim API call path
  // -----------------------------------------------------------------------
  describe('Nominatim API call', () => {
    it('returns 200 with Nominatim results for a unique query (0 popular matches)', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            place_id: 1001,
            lat: '10.0',
            lon: '20.0',
            type: 'city',
            addresstype: 'city',
            name: 'Aqabah',
            display_name: 'Aqabah, Jordan',
            address: { city: 'Aqabah', country: 'Jordan' },
          },
        ],
      } as Response);

      // unique string: no match in popular destinations
      const res = await geocodingGET(makeGeoRequest('geocombineduniq001'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      const cities = (body.data as Array<{ city: string }>).map(d => d.city);
      expect(cities).toContain('Aqabah');
    });

    it('falls back to popularDestinations.slice(0,8) when fetch rejects', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network failure'));

      const res = await geocodingGET(makeGeoRequest('geocombineduniq002'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(8);
    });

    it('falls back gracefully when Nominatim returns a non-ok status', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => [],
      } as Response);

      const res = await geocodingGET(makeGeoRequest('geocombineduniq003'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(8);
    });
  });

  // -----------------------------------------------------------------------
  // Deduplication
  // -----------------------------------------------------------------------
  describe('deduplication', () => {
    it('deduplicates when Nominatim returns the same city+country twice', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            place_id: 301,
            lat: '48.8566',
            lon: '2.3522',
            type: 'city',
            addresstype: 'city',
            name: 'Paris',
            display_name: 'Paris, France',
            address: { city: 'Paris', country: 'France' },
          },
          {
            place_id: 302,
            lat: '48.8570',
            lon: '2.3530',
            type: 'city',
            addresstype: 'city',
            name: 'Paris',
            display_name: 'Paris, Île-de-France, France',
            address: { city: 'Paris', country: 'France' },
          },
        ],
      } as Response);

      const res = await geocodingGET(makeGeoRequest('geocombineduniqdedup001'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      const parisFranceCount = (body.data as Array<{ city: string; country: string }>).filter(
        d => d.city === 'Paris' && d.country === 'France'
      ).length;
      expect(parisFranceCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Nominatim result type filtering
  // -----------------------------------------------------------------------
  describe('Nominatim type filtering', () => {
    it('excludes results with non-city addresstype from the response', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_GEO as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            place_id: 401,
            lat: '51.5074',
            lon: '-0.1278',
            type: 'amenity',
            addresstype: 'amenity',
            name: 'Some Hotel',
            display_name: 'Some Hotel, London, UK',
            address: { city: 'London', country: 'United Kingdom' },
          },
          {
            place_id: 402,
            lat: '55.7558',
            lon: '37.6173',
            type: 'municipality',
            addresstype: 'municipality',
            name: 'Novosibirsk',
            display_name: 'Novosibirsk, Russia',
            address: { city: 'Novosibirsk', country: 'Russia' },
          },
        ],
      } as Response);

      const res = await geocodingGET(makeGeoRequest('geocombineduniqtype001'));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      const cityNames = (body.data as Array<{ city: string }>).map(d => d.city);
      expect(cityNames).not.toContain('Some Hotel');
      expect(cityNames).toContain('Novosibirsk');
    });
  });
});

// ===========================================================================
// ██████  Images Search Route Tests
// ===========================================================================

describe('GET /api/images/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Auth guard
  // -----------------------------------------------------------------------
  describe('auth guard', () => {
    it('returns 401 when no session exists', async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await imagesGET(makeImgRequest({ q: 'beaches' }));
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 when session has no user id', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { name: 'No ID' },
        expires: '2099-01-01',
      } as never);

      const res = await imagesGET(makeImgRequest({ q: 'beaches' }));
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  // -----------------------------------------------------------------------
  // Rate limiting
  // -----------------------------------------------------------------------
  describe('rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_IMG as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

      const res = await imagesGET(makeImgRequest({ q: 'beaches' }));
      const body = await parseJson(res);

      expect(res.status).toBe(429);
      expect(body.error).toMatch(/too many requests/i);
    });
  });

  // -----------------------------------------------------------------------
  // Unsplash config guard
  // -----------------------------------------------------------------------
  describe('Unsplash config guard', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_IMG as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    });

    it('returns 503 when Unsplash is not configured', async () => {
      mockIsUnsplashConfigured.mockReturnValueOnce(false);

      const res = await imagesGET(makeImgRequest({ q: 'beaches' }));
      const body = await parseJson(res);

      expect(res.status).toBe(503);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Image search not configured');
    });
  });

  // -----------------------------------------------------------------------
  // Zod validation
  // -----------------------------------------------------------------------
  describe('Zod validation', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_IMG as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
      mockIsUnsplashConfigured.mockReturnValueOnce(true);
    });

    it('returns 400 when q param is missing', async () => {
      const res = await imagesGET(makeImgRequest({}));
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid query parameters');
      expect(body.details).toBeDefined();
    });

    it('returns 400 when q is an empty string', async () => {
      const res = await imagesGET(makeImgRequest({ q: '' }));
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid query parameters');
    });

    it('returns 400 when perPage exceeds 30', async () => {
      const res = await imagesGET(makeImgRequest({ q: 'mountains', perPage: '50' }));
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid query parameters');
    });

    it('returns 400 when page is 0', async () => {
      const res = await imagesGET(makeImgRequest({ q: 'mountains', page: '0' }));
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid query parameters');
    });
  });

  // -----------------------------------------------------------------------
  // Success path
  // -----------------------------------------------------------------------
  describe('success path', () => {
    const MOCK_UNSPLASH_RESULT = {
      total: 42,
      total_pages: 4,
      results: [
        {
          id: 'img-abc',
          urls: {
            raw: 'http://raw.jpg',
            full: 'http://full.jpg',
            regular: 'http://regular.jpg',
            small: 'http://small.jpg',
            thumb: 'http://thumb.jpg',
          },
          alt_description: 'crystal clear water',
          description: null,
          width: 2400,
          height: 1600,
          user: {
            name: 'Jane Photo',
            username: 'janephoto',
            links: { html: 'http://unsplash.com/janephoto' },
          },
          links: { html: 'http://unsplash.com/photos/img-abc' },
        },
      ],
    };

    beforeEach(() => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_IMG as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
      mockIsUnsplashConfigured.mockReturnValueOnce(true);
    });

    it('returns 200 with correct response shape on success', async () => {
      mockSearchImages.mockResolvedValueOnce(MOCK_UNSPLASH_RESULT);

      const res = await imagesGET(makeImgRequest({ q: 'beaches' }));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.total).toBe('number');
      expect(typeof body.totalPages).toBe('number');
      expect(body.total).toBe(42);
      expect(body.totalPages).toBe(4);
    });

    it('calls searchImages with query appended with " travel" and landscape orientation', async () => {
      mockSearchImages.mockResolvedValueOnce(MOCK_UNSPLASH_RESULT);

      await imagesGET(makeImgRequest({ q: 'beaches' }));

      expect(mockSearchImages).toHaveBeenCalledWith('beaches travel', 1, 12, 'landscape');
    });

    it('passes custom page and perPage to searchImages', async () => {
      mockSearchImages.mockResolvedValueOnce({ results: [], total: 0, total_pages: 0 });

      await imagesGET(makeImgRequest({ q: 'forest', page: '3', perPage: '20' }));

      expect(mockSearchImages).toHaveBeenCalledWith('forest travel', 3, 20, 'landscape');
    });

    it('trims whitespace from query before appending " travel"', async () => {
      mockSearchImages.mockResolvedValueOnce({ results: [], total: 0, total_pages: 0 });

      await imagesGET(makeImgRequest({ q: '  mountains  ' }));

      expect(mockSearchImages).toHaveBeenCalledWith('mountains travel', 1, 12, 'landscape');
    });

    it('transforms Unsplash image shape correctly', async () => {
      mockSearchImages.mockResolvedValueOnce(MOCK_UNSPLASH_RESULT);

      const res = await imagesGET(makeImgRequest({ q: 'lakes' }));
      const body = await parseJson(res);

      expect(body.data).toHaveLength(1);
      const img = body.data[0] as Record<string, unknown>;
      expect(img.id).toBe('img-abc');
      expect(img.url).toBe('http://regular.jpg');
      expect(img.smallUrl).toBe('http://small.jpg');
      expect(img.thumbUrl).toBe('http://thumb.jpg');
      expect(img.alt).toBe('crystal clear water');
      expect(img.width).toBe(2400);
      expect(img.height).toBe(1600);
      expect(img.photographer).toBe('Jane Photo');
      expect(img.photographerUrl).toBe('http://unsplash.com/janephoto');
      expect(img.unsplashUrl).toBe('http://unsplash.com/photos/img-abc');
    });

    it('uses description as alt when alt_description is null', async () => {
      mockSearchImages.mockResolvedValueOnce({
        ...MOCK_UNSPLASH_RESULT,
        results: [
          {
            ...MOCK_UNSPLASH_RESULT.results[0],
            alt_description: null,
            description: 'scenic valley',
          },
        ],
      });

      const res = await imagesGET(makeImgRequest({ q: 'valley' }));
      const body = await parseJson(res);

      expect(body.data[0].alt).toBe('scenic valley');
    });

    it('uses query as alt when both alt_description and description are null', async () => {
      mockSearchImages.mockResolvedValueOnce({
        ...MOCK_UNSPLASH_RESULT,
        results: [
          {
            ...MOCK_UNSPLASH_RESULT.results[0],
            alt_description: null,
            description: null,
          },
        ],
      });

      const res = await imagesGET(makeImgRequest({ q: 'canyon' }));
      const body = await parseJson(res);

      expect(body.data[0].alt).toBe('canyon');
    });

    it('returns empty data array when searchImages returns no results', async () => {
      mockSearchImages.mockResolvedValueOnce({ results: [], total: 0, total_pages: 0 });

      const res = await imagesGET(makeImgRequest({ q: 'xqzunknown' }));
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
      expect(body.totalPages).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Error path
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION_IMG as never);
      mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
      mockIsUnsplashConfigured.mockReturnValueOnce(true);
    });

    it('returns 500 when searchImages throws an unexpected error', async () => {
      mockSearchImages.mockRejectedValueOnce(new Error('Unsplash API down'));

      const res = await imagesGET(makeImgRequest({ q: 'sunsets' }));
      const body = await parseJson(res);

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Failed to search images');
    });
  });
});
