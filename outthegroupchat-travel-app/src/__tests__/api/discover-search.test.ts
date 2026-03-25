/**
 * Unit tests for GET /api/discover/search
 *
 * Route: outthegroupchat-travel-app/src/app/api/discover/search/route.ts
 *
 * This route requires:
 *   1. Rate limit check (IP-based, apiRateLimiter)
 *   2. Session auth guard (getServerSession — 401 if no session)
 *   3. Zod param validation (400 on bad params)
 *   4. Prisma queries for internal + external activities
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
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaExternalActivity = vi.mocked(prisma.externalActivity);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
  expires: '9999-01-01',
};

const RATE_LIMIT_OK = {
  success: true,
  limit: 100,
  remaining: 99,
  reset: 0,
};

const RATE_LIMIT_EXCEEDED = {
  success: false,
  limit: 100,
  remaining: 0,
  reset: Date.now() + 60000,
};

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

const BASE = 'http://localhost:3000/api/discover/search';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/discover/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Auth guard ----------------------------------------------------------

  it('returns 401 when there is no session (rate limit passes)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 401 when session has no user (expires-only session)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    // session object exists but .user is undefined
    mockGetServerSession.mockResolvedValueOnce({
      expires: '9999-01-01',
      user: undefined,
    } as never);

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  // ---- Rate limiting -------------------------------------------------------

  it('returns 429 when rate limit is exceeded (before auth check)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);
    // getServerSession should NOT be called when rate limited
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?q=museums`));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('does not call getServerSession when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    await GET(makeReq(BASE));

    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  // ---- Param validation ----------------------------------------------------

  it('returns 400 when limit param is below minimum (1)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?limit=0`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  it('returns 400 when limit param exceeds maximum (50)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?limit=51`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  it('returns 400 when source param is an invalid enum value', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?source=invalid`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  // ---- Successful searches ------------------------------------------------

  it('returns 200 with internal and external results for an authenticated user', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaActivity.findMany.mockResolvedValueOnce([
      {
        id: 'act-1',
        name: 'Louvre Museum',
        description: 'World-famous museum',
        category: 'SIGHTSEEING',
        location: 'Paris',
        cost: 17,
        currency: 'EUR',
        priceRange: 'MODERATE',
        isPublic: true,
        shareCount: 20,
        createdAt: new Date(),
        trip: { title: 'Paris Trip', destination: { city: 'Paris', country: 'France' } },
        _count: { savedBy: 10, comments: 5, ratings: 8 },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>);

    mockPrismaExternalActivity.findMany.mockResolvedValueOnce([
      {
        id: 'ext-1',
        externalId: 'xid-1',
        source: 'OPENTRIPMAP',
        name: 'Eiffel Tower',
        description: 'Iconic landmark',
        category: 'Attractions',
        tags: ['monument', 'paris'],
        latitude: 48.8584,
        longitude: 2.2945,
        address: 'Champ de Mars',
        city: 'Paris',
        country: 'France',
        rating: 4.8,
        ratingCount: 50000,
        priceLevel: 2,
        imageUrl: 'https://example.com/eiffel.jpg',
        thumbnailUrl: null,
        websiteUrl: 'https://www.toureiffel.paris',
        searchText: 'Eiffel Tower Paris France',
        popularity: 100,
        lastFetched: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>);

    const res = await GET(makeReq(`${BASE}?q=paris&city=Paris`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.internal).toHaveLength(1);
    expect(body.data.external).toHaveLength(1);
    expect(body.data.total).toBe(2);
  });

  it('returns 200 with empty results when no activities match query', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?q=nonexistentplacexyz`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.internal).toHaveLength(0);
    expect(body.data.external).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it('returns 200 with only internal results when source=internal', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaActivity.findMany.mockResolvedValueOnce([
      {
        id: 'act-2',
        name: 'Central Park Walk',
        description: 'Scenic park walk',
        category: 'OUTDOOR',
        location: 'New York',
        cost: 0,
        currency: 'USD',
        priceRange: 'FREE',
        isPublic: true,
        shareCount: 5,
        createdAt: new Date(),
        trip: { title: 'NYC Trip', destination: { city: 'New York', country: 'USA' } },
        _count: { savedBy: 3, comments: 1, ratings: 2 },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>);

    const res = await GET(makeReq(`${BASE}?source=internal`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.internal).toHaveLength(1);
    expect(body.data.external).toHaveLength(0);
    // externalActivity.findMany should not have been called
    expect(mockPrismaExternalActivity.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with only external results when source=external', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?source=external`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.internal).toHaveLength(0);
    // activity.findMany (internal) should not have been called
    expect(mockPrismaActivity.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with correct query metadata in response body', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?q=beach&city=Sydney&category=OUTDOOR&limit=10&offset=5`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.query.q).toBe('beach');
    expect(body.data.query.city).toBe('Sydney');
    expect(body.data.query.category).toBe('OUTDOOR');
    expect(body.data.query.limit).toBe(10);
    expect(body.data.query.offset).toBe(5);
  });
});
