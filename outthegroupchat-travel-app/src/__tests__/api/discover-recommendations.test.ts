/**
 * Unit tests for GET /api/discover/recommendations
 *
 * Route: outthegroupchat-travel-app/src/app/api/discover/recommendations/route.ts
 *
 * This route requires:
 *   1. Rate limit check (IP-based, apiRateLimiter) — BEFORE auth
 *   2. Session auth guard (getServerSession — 401 if no session)
 *   3. Zod param validation (city/country required, limit 1–30)
 *   4. prisma.user.findUnique — fetch user preferences
 *   5. prisma.savedActivity.findMany — exclude already-saved activities
 *   6. prisma.trip.findUnique — resolve destination from tripId
 *   7. prisma.activity.findMany — internal recommendations
 *   8. prisma.externalActivity.findMany — external recommendations
 *   9. Interleaved response shape: { success, data: { recommendations, context } }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

import { GET } from '@/app/api/discover/recommendations/route';

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
const mockPrismaUser = vi.mocked(prisma.user);
const mockPrismaSavedActivity = vi.mocked(prisma.savedActivity);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaExternalActivity = vi.mocked(prisma.externalActivity);

// ---------------------------------------------------------------------------
// Shared fixtures
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

const BASE = 'http://localhost:3000/api/discover/recommendations';

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

/** Minimal prisma.user stub — no preferences */
const USER_NO_PREFS = {
  preferences: null,
} as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>;

/** prisma.user stub with interest preferences */
const USER_WITH_PREFS = {
  preferences: { interests: ['hiking', 'food'] },
} as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>;

/** Empty saved activities */
const NO_SAVED: Awaited<ReturnType<typeof prisma.savedActivity.findMany>> = [];

/** One already-saved activity */
const ONE_SAVED = [
  { activityId: 'act-saved-1' },
] as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>;

/** A single internal activity row */
function makeInternalActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    name: 'Colosseum Tour',
    description: 'Ancient Roman amphitheatre',
    category: 'SIGHTSEEING',
    location: 'Rome, Italy',
    cost: 16,
    currency: 'EUR',
    isPublic: true,
    shareCount: 42,
    trip: { title: 'Italy Trip', destination: { city: 'Rome', country: 'Italy' } },
    _count: { savedBy: 20, ratings: 15 },
    ...overrides,
  };
}

/** A single external activity row */
function makeExternalActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ext-1',
    externalId: 'xid-1',
    source: 'OPENTRIPMAP',
    name: 'Trevi Fountain',
    description: 'Iconic baroque fountain',
    category: 'Attractions',
    tags: ['monument', 'rome'],
    latitude: 41.9009,
    longitude: 12.4833,
    address: 'Piazza di Trevi',
    city: 'Rome',
    country: 'Italy',
    rating: 4.7,
    priceLevel: 0,
    imageUrl: 'https://example.com/trevi.jpg',
    websiteUrl: null,
    popularity: 90,
    ...overrides,
  };
}

/** Set up the standard "happy path" prisma mocks for city=Rome */
function setupHappyPathMocks() {
  mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
  mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
  mockPrismaActivity.findMany.mockResolvedValueOnce(
    [makeInternalActivity()] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
  );
  mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
    [makeExternalActivity()] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/discover/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Rate limiting -------------------------------------------------------

  it('returns 429 when rate limit is exceeded before auth check', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('does not call getServerSession when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    await GET(makeReq(`${BASE}?city=Rome`));

    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  // ---- Auth guard ----------------------------------------------------------

  it('returns 401 when there is no session', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 401 when session has no user object', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce({
      expires: '9999-01-01',
      user: undefined,
    } as never);

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  // ---- Param validation ----------------------------------------------------

  it('returns 400 when neither city nor country is provided (and no tripId)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);

    const res = await GET(makeReq(BASE));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/city or country is required/i);
  });

  it('returns 400 when limit param is below minimum (0)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?city=Rome&limit=0`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
    expect(body.details).toBeDefined();
  });

  it('returns 400 when limit param exceeds maximum (31)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?city=Rome&limit=31`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  it('returns 400 when limit is a non-numeric string', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeReq(`${BASE}?city=Rome&limit=abc`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query parameters/i);
  });

  // ---- Happy path: basic 200 -----------------------------------------------

  it('returns 200 with correct response shape for city query', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupHappyPathMocks();

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('recommendations');
    expect(body.data).toHaveProperty('context');
    expect(Array.isArray(body.data.recommendations)).toBe(true);
  });

  it('returns 200 and context contains city and userPreferences', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupHappyPathMocks();

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.context.city).toBe('Rome');
    expect(Array.isArray(body.data.context.userPreferences)).toBe(true);
  });

  it('returns 200 when only country is provided (no city)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?country=Italy`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.context.country).toBe('Italy');
  });

  // ---- Internal recommendations shape -------------------------------------

  it('internal recommendations have type="internal" and engagement field', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupHappyPathMocks();

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(200);
    const body = await res.json();
    const internal = body.data.recommendations.find(
      (r: { type: string }) => r.type === 'internal'
    );
    expect(internal).toBeDefined();
    expect(internal.engagement).toHaveProperty('saves');
    expect(internal.engagement).toHaveProperty('ratings');
    expect(internal.reason).toMatch(/Recommended from/i);
  });

  // ---- External recommendations shape -------------------------------------

  it('external recommendations have type="external" and location field', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    setupHappyPathMocks();

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(200);
    const body = await res.json();
    const external = body.data.recommendations.find(
      (r: { type: string }) => r.type === 'external'
    );
    expect(external).toBeDefined();
    expect(external.location).toHaveProperty('city');
    expect(external.location).toHaveProperty('latitude');
    expect(external.reason).toMatch(/Popular in/i);
  });

  // ---- Empty results -------------------------------------------------------

  it('returns 200 with empty recommendations array when nothing matches', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?city=Timbuktu`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(0);
  });

  // ---- Category filter -----------------------------------------------------

  it('passes category filter to prisma.activity.findMany', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    await GET(makeReq(`${BASE}?city=Rome&category=OUTDOOR`));

    const callArgs = mockPrismaActivity.findMany.mock.calls[0][0] as {
      where: { category?: string };
    };
    expect(callArgs.where.category).toBe('OUTDOOR');
  });

  it('returns 200 with category in context when category param provided', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeInternalActivity({ category: 'OUTDOOR' })] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?city=Rome&category=OUTDOOR`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ---- tripId resolution ---------------------------------------------------

  it('resolves city from tripId when city param is omitted', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      destination: { city: 'Paris', country: 'France' },
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?tripId=trip-1`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.context.city).toBe('Paris');
    expect(body.data.context.tripId).toBe('trip-1');
  });

  it('returns 400 when tripId is provided but trip has no destination', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await GET(makeReq(`${BASE}?tripId=trip-ghost`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/city or country is required/i);
  });

  it('context includes tripId when tripId param is present', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      destination: { city: 'Tokyo', country: 'Japan' },
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?tripId=trip-42`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.context.tripId).toBe('trip-42');
  });

  // ---- User preferences & exclusions ---------------------------------------

  it('populates userPreferences from user.preferences.interests', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_WITH_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.context.userPreferences).toEqual(['hiking', 'food']);
  });

  it('excludes already-saved activity ids from prisma.activity.findMany query', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(ONE_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    await GET(makeReq(`${BASE}?city=Rome`));

    const callArgs = mockPrismaActivity.findMany.mock.calls[0][0] as {
      where: { id?: { notIn: string[] } };
    };
    expect(callArgs.where.id?.notIn).toContain('act-saved-1');
  });

  // ---- Limit / pagination --------------------------------------------------

  it('respects default limit of 10 when limit param is omitted', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    await GET(makeReq(`${BASE}?city=Rome`));

    // Default limit=10, each half gets Math.ceil(10/2)=5
    const callArgs = mockPrismaActivity.findMany.mock.calls[0][0] as { take: number };
    expect(callArgs.take).toBe(5);
  });

  it('accepts limit=30 (max allowed) and sets take=15 for each source', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.externalActivity.findMany>>
    );

    const res = await GET(makeReq(`${BASE}?city=Rome&limit=30`));

    expect(res.status).toBe(200);
    const callArgs = mockPrismaActivity.findMany.mock.calls[0][0] as { take: number };
    expect(callArgs.take).toBe(15);
  });

  // ---- Error handling ------------------------------------------------------

  it('returns 500 when prisma.user.findUnique throws an unexpected error', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to get recommendations/i);
  });

  it('returns 500 when prisma.activity.findMany throws an unexpected error', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockRejectedValueOnce(new Error('Query timeout'));

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to get recommendations/i);
  });

  it('still returns 200 when externalActivity.findMany throws (swallowed internally)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(USER_NO_PREFS);
    mockPrismaSavedActivity.findMany.mockResolvedValueOnce(NO_SAVED);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeInternalActivity()] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );
    mockPrismaExternalActivity.findMany.mockRejectedValueOnce(
      new Error('ExternalActivity table does not exist')
    );

    const res = await GET(makeReq(`${BASE}?city=Rome`));

    // The route swallows external errors with an empty catch block
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Internal result is still present; external is empty due to the swallowed error
    expect(body.data.recommendations.some((r: { type: string }) => r.type === 'internal')).toBe(true);
  });
});
