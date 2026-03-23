/**
 * Unit tests for GET /api/images/search
 *
 * Strategy
 * --------
 * - next-auth, @/lib/auth, and @/lib/logger are mocked globally via setup.ts.
 * - '@/lib/api/unsplash' is mocked locally so isUnsplashConfigured and
 *   searchImages can be controlled per-test.
 * - Handlers are invoked directly with minimal NextRequest objects.
 * - Tests cover: auth guard, Unsplash config guard, Zod validation, success
 *   path, response shape/transformation, pagination params, and error path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { GET } from '@/app/api/images/search/route';

vi.mock('@/lib/api/unsplash', () => ({
  searchImages: vi.fn(),
  isUnsplashConfigured: vi.fn(),
}));

import { searchImages, isUnsplashConfigured } from '@/lib/api/unsplash';

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockIsUnsplashConfigured = vi.mocked(isUnsplashConfigured);
const mockSearchImages = vi.mocked(searchImages);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_SESSION = {
  user: { id: 'user-img-001', name: 'Image Tester', email: 'img@example.com' },
  expires: '2099-01-01',
};

const MOCK_UNSPLASH_RESULT = {
  results: [
    {
      id: 'img-1',
      urls: {
        raw: 'http://raw.jpg',
        full: 'http://full.jpg',
        regular: 'http://r.jpg',
        small: 'http://s.jpg',
        thumb: 'http://t.jpg',
      },
      alt_description: 'beautiful beach',
      description: null,
      width: 1200,
      height: 800,
      user: {
        name: 'John Doe',
        username: 'johndoe',
        links: { html: 'http://unsplash.com/johndoe' },
      },
      links: { html: 'http://unsplash.com/photo/img-1' },
    },
  ],
  total: 1,
  total_pages: 1,
};

// ---------------------------------------------------------------------------
// Request factory
// ---------------------------------------------------------------------------
function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/images/search');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Auth guard
// ===========================================================================
describe('GET /api/images/search — auth guard', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest({ q: 'beaches' }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// Unsplash config guard (checked after auth)
// ===========================================================================
describe('GET /api/images/search — Unsplash config guard', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
  });

  it('returns 503 when Unsplash is not configured', async () => {
    mockIsUnsplashConfigured.mockReturnValueOnce(false);

    const res = await GET(makeRequest({ q: 'beaches' }));
    const body = await parseJson(res);

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Image search not configured');
  });
});

// ===========================================================================
// Zod validation (checked after config guard)
// ===========================================================================
describe('GET /api/images/search — Zod validation', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
  });

  it('returns 400 when q param is missing', async () => {
    const res = await GET(makeRequest({}));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when q is empty string', async () => {
    const res = await GET(makeRequest({ q: '' }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
    expect(body.details.q).toBeDefined();
  });
});

// ===========================================================================
// Success path
// ===========================================================================
describe('GET /api/images/search — success', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
  });

  it('returns 200 with image results on success', async () => {
    mockSearchImages.mockResolvedValueOnce(MOCK_UNSPLASH_RESULT);

    const res = await GET(makeRequest({ q: 'beaches' }));

    expect(res.status).toBe(200);
  });

  it('returns correct response shape: { success, data, total, totalPages }', async () => {
    mockSearchImages.mockResolvedValueOnce(MOCK_UNSPLASH_RESULT);

    const res = await GET(makeRequest({ q: 'beaches' }));
    const body = await parseJson(res);

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.totalPages).toBe('number');
    expect(body.total).toBe(1);
    expect(body.totalPages).toBe(1);
  });

  it('uses default page=1 and perPage=12 when not specified', async () => {
    mockSearchImages.mockResolvedValueOnce(MOCK_UNSPLASH_RESULT);

    await GET(makeRequest({ q: 'mountains' }));

    // Route appends ' travel' to the query and uses 'landscape' orientation
    expect(mockSearchImages).toHaveBeenCalledWith('mountains travel', 1, 12, 'landscape');
  });

  it('passes custom page and perPage params to searchImages', async () => {
    mockSearchImages.mockResolvedValueOnce({
      results: [],
      total: 0,
      total_pages: 0,
    });

    await GET(makeRequest({ q: 'city', page: '2', perPage: '5' }));

    expect(mockSearchImages).toHaveBeenCalledWith('city travel', 2, 5, 'landscape');
  });

  it('transforms Unsplash response correctly', async () => {
    mockSearchImages.mockResolvedValueOnce(MOCK_UNSPLASH_RESULT);

    const res = await GET(makeRequest({ q: 'beaches' }));
    const body = await parseJson(res);

    expect(body.data).toHaveLength(1);
    const img = body.data[0];
    expect(img.id).toBe('img-1');
    expect(img.url).toBe('http://r.jpg');
    expect(img.smallUrl).toBe('http://s.jpg');
    expect(img.thumbUrl).toBe('http://t.jpg');
    expect(img.alt).toBe('beautiful beach');
    expect(img.width).toBe(1200);
    expect(img.height).toBe(800);
    expect(img.photographer).toBe('John Doe');
    expect(img.photographerUrl).toBe('http://unsplash.com/johndoe');
    expect(img.unsplashUrl).toBe('http://unsplash.com/photo/img-1');
  });

  it('falls back to description for alt when alt_description is null', async () => {
    const resultWithDesc = {
      ...MOCK_UNSPLASH_RESULT,
      results: [
        {
          ...MOCK_UNSPLASH_RESULT.results[0],
          alt_description: null,
          description: 'scenic coastline',
        },
      ],
    };
    mockSearchImages.mockResolvedValueOnce(resultWithDesc);

    const res = await GET(makeRequest({ q: 'coast' }));
    const body = await parseJson(res);

    expect(body.data[0].alt).toBe('scenic coastline');
  });

  it('falls back to query for alt when both alt_description and description are null', async () => {
    const resultNoAlt = {
      ...MOCK_UNSPLASH_RESULT,
      results: [
        {
          ...MOCK_UNSPLASH_RESULT.results[0],
          alt_description: null,
          description: null,
        },
      ],
    };
    mockSearchImages.mockResolvedValueOnce(resultNoAlt);

    const res = await GET(makeRequest({ q: 'desert' }));
    const body = await parseJson(res);

    expect(body.data[0].alt).toBe('desert');
  });
});

// ===========================================================================
// Error path
// ===========================================================================
describe('GET /api/images/search — error handling', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockIsUnsplashConfigured.mockReturnValueOnce(true);
  });

  it('returns 500 when searchImages throws', async () => {
    mockSearchImages.mockRejectedValueOnce(new Error('Network error'));

    const res = await GET(makeRequest({ q: 'beaches' }));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to search images');
  });
});
