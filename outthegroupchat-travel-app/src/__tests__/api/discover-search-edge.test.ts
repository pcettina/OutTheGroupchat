/**
 * Edge case tests for GET /api/discover/search
 *
 * Route: outthegroupchat-travel-app/src/app/api/discover/search/route.ts
 *
 * These tests cover scenarios NOT in discover-search.test.ts:
 *   - Empty / null / whitespace-only query strings
 *   - Very long query strings (near and beyond the 200-char max)
 *   - Special characters and URL-encoded values in queries
 *   - Filter combinations: category + city, category + country, all three
 *   - Pagination edge cases (offset=0, large offset, limit=1, limit=50)
 *   - prisma.activity.findMany throwing an error (500 path)
 *   - prisma.externalActivity.findMany throwing (graceful, not surfaced as error)
 *   - response shape validation (engagement object, location object)
 *   - source='' (default, both queries executed)
 *   - offset param below 0 (400 validation)
 *   - non-numeric limit/offset coercion (NaN → 400)
 *   - query metadata correctly reflects defaults when no params provided
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

import { GET } from '@/app/api/discover/search/route';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  apiRateLimiter: {},
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Typed references
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockPrismaActivity = vi.mocked(prisma.activity) as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaExternalActivity = vi.mocked(prisma.externalActivity) as {
  findMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  user: { id: 'user-edge-1', name: 'Edge User', email: 'edge@example.com' },
  expires: '9999-01-01',
};

const RATE_OK = { success: true, limit: 100, remaining: 99, reset: 0 };

/** Returns a minimal valid internal activity object for mock responses. */
function makeInternalActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-edge-1',
    name: 'Test Activity',
    description: 'A test activity',
    category: 'CULTURE',
    location: 'Test City',
    cost: 10,
    currency: 'USD',
    priceRange: 'MODERATE',
    isPublic: true,
    shareCount: 1,
    createdAt: new Date(),
    trip: { title: 'Test Trip', destination: { city: 'Test City', country: 'US' } },
    _count: { savedBy: 0, comments: 0, ratings: 0 },
    ...overrides,
  };
}

/** Returns a minimal valid external activity object for mock responses. */
function makeExternalActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ext-edge-1',
    externalId: 'xid-edge-1',
    source: 'OPENTRIPMAP',
    name: 'External Activity',
    description: 'An external activity',
    category: 'Attractions',
    tags: ['test'],
    latitude: 40.7128,
    longitude: -74.006,
    address: '123 Test St',
    city: 'New York',
    country: 'USA',
    rating: 4.0,
    ratingCount: 100,
    priceLevel: 1,
    imageUrl: null,
    thumbnailUrl: null,
    websiteUrl: null,
    searchText: 'External Activity New York USA',
    popularity: 50,
    lastFetched: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const BASE = 'http://localhost:3000/api/discover/search';

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// beforeEach — reset ALL mocks (prevents module-level cache leakage) then
// re-establish permanent stubs.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Edge Case Tests
// ---------------------------------------------------------------------------

describe('GET /api/discover/search — edge cases', () => {
  // ---- Empty / null query strings ------------------------------------------

  it('returns 200 and searches without text filter when q is absent', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // query metadata should reflect empty default
    expect(body.data.query.q).toBe('');
  });

  it('returns 200 when q is an empty string explicitly', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?q=`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query.q).toBe('');
  });

  // ---- Very long query strings ---------------------------------------------

  it('returns 200 when q is exactly 200 characters (boundary)', async () => {
    const longQuery = 'a'.repeat(200);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?q=${longQuery}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when q exceeds 200 characters', async () => {
    const tooLong = 'b'.repeat(201);
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?q=${tooLong}`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  // ---- Special characters in queries ---------------------------------------

  it('returns 200 when q contains URL-encoded special characters', async () => {
    // "café & bistro" URL-encoded
    const specialQ = encodeURIComponent('café & bistro');
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeInternalActivity({ name: 'café & bistro' })] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?q=${specialQ}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.internal).toHaveLength(1);
  });

  it('returns 200 when q contains SQL injection-like characters', async () => {
    const injectionQ = encodeURIComponent("'; DROP TABLE activities; --");
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?q=${injectionQ}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(0);
  });

  // ---- Filter combinations -------------------------------------------------

  it('returns 200 when category + city filters are combined', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeInternalActivity({ category: 'FOOD' })] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [makeExternalActivity({ category: 'Food', city: 'Tokyo' })] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?category=food&city=Tokyo`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(2);
  });

  it('returns 200 when category + country filters are combined', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [makeExternalActivity({ category: 'Nature', country: 'Brazil' })] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?category=nature&country=Brazil`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.external).toHaveLength(1);
  });

  it('returns 200 when q + category + city + country are all provided', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?q=museum&category=culture&city=London&country=UK`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // query echo should include q and category
    expect(body.data.query.q).toBe('museum');
    expect(body.data.query.category).toBe('culture');
  });

  // ---- Pagination edge cases -----------------------------------------------

  it('returns 200 with limit=1 and returns at most one result per source', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeInternalActivity()] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [makeExternalActivity()] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?limit=1`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query.limit).toBe(1);
    // Prisma called with take=1 — mock returned 1 item each, total=2
    expect(body.data.total).toBe(2);
  });

  it('returns 200 with limit=50 (maximum boundary)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?limit=50`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query.limit).toBe(50);
  });

  it('returns 200 with offset=0 (explicit default)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?offset=0`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query.offset).toBe(0);
  });

  it('returns 200 with a large offset (simulates deep pagination)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?offset=1000`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query.offset).toBe(1000);
    expect(body.data.total).toBe(0);
  });

  it('returns 400 when offset is negative', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?offset=-1`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  it('returns 400 when limit is a non-numeric string', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?limit=abc`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  // ---- API failure scenarios -----------------------------------------------

  it('returns 500 when prisma.activity.findMany throws unexpectedly', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to search activities/i);
  });

  it('still returns 200 when externalActivity.findMany throws (graceful degradation)', async () => {
    // The route wraps externalActivity queries in try/catch and continues —
    // only internal activities should be in the response.
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeInternalActivity()] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockRejectedValueOnce(
      new Error('ExternalActivity table does not exist')
    );

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.internal).toHaveLength(1);
    expect(body.data.external).toHaveLength(0);
    expect(body.data.total).toBe(1);
  });

  // ---- Response shape validation -------------------------------------------

  it('internal activity response includes engagement sub-object with saves/comments/ratings', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeInternalActivity({ _count: { savedBy: 7, comments: 3, ratings: 12 } })] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(200);
    const body = await res.json();
    const act = body.data.internal[0];
    expect(act.type).toBe('internal');
    expect(act.engagement).toBeDefined();
    expect(act.engagement.saves).toBe(7);
    expect(act.engagement.comments).toBe(3);
    expect(act.engagement.ratings).toBe(12);
  });

  it('external activity response includes nested location object', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [makeExternalActivity({
        latitude: 51.5074,
        longitude: -0.1278,
        address: '10 Downing St',
        city: 'London',
        country: 'UK',
      })] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?source=external`));

    expect(res.status).toBe(200);
    const body = await res.json();
    const ext = body.data.external[0];
    expect(ext.type).toBe('external');
    expect(ext.location).toBeDefined();
    expect(ext.location.latitude).toBe(51.5074);
    expect(ext.location.longitude).toBe(-0.1278);
    expect(ext.location.city).toBe('London');
    expect(ext.location.country).toBe('UK');
  });

  // ---- Default source (both internal and external queried) ------------------

  it('calls both activity.findMany and externalActivity.findMany when source param is omitted', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    await GET(makeReq(BASE));

    expect(mockPrismaActivity.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrismaExternalActivity.findMany).toHaveBeenCalledTimes(1);
  });

  // ---- Query metadata defaults ---------------------------------------------

  it('response query metadata reflects all defaults when no params are supplied', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.query.q).toBe('');
    expect(body.data.query.city).toBe('');
    expect(body.data.query.category).toBe('');
    expect(body.data.query.limit).toBe(20);
    expect(body.data.query.offset).toBe(0);
  });
});
