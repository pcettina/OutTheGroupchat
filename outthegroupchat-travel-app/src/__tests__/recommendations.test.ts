/**
 * Comprehensive unit tests for GET /api/recommendations (V1 venue recommendations).
 *
 * Covers Journey C — Topic → Google Places categories → Places text search →
 * scoring (rating × hotnessBoost) → sort desc → cap to `limit`. DB fallback
 * applies when Google Places returns nothing.
 *
 * Companion file: src/__tests__/api/recommendations.test.ts (smaller focused
 * smoke set). This file expands coverage for Phase 8 launch-readiness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Rate limiter mock — re-armed in beforeEach so post-auth tests always pass.
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Mock searchPlaces (axios-backed) so no live HTTP call is made.
vi.mock('@/lib/api/places', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/places')>(
    '@/lib/api/places',
  );
  return {
    ...actual,
    searchPlaces: vi.fn(),
  };
});

import { GET } from '@/app/api/recommendations/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { searchPlaces } from '@/lib/api/places';

// ---------------------------------------------------------------------------
// Mock surface aliases
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;
const mockTopic = prisma.topic as unknown as { findUnique: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_BLOCK = { success: false, limit: 100, remaining: 0, reset: 60 };

// A cuid-shaped string — z.string().cuid() requires a leading 'c' + 24 chars.
const TOPIC_ID = 'cliab1234567890drinks001';

const sessionFor = (id = 'user-rec-1') => ({
  user: { id, name: 'Tester', email: 'tester@example.com' },
  expires: '2099-01-01',
});

const makeReq = (params: Record<string, string> = {}, includeTopic = true) => {
  const url = new URL('http://localhost/api/recommendations');
  if (includeTopic) url.searchParams.set('topicId', TOPIC_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

const placeResult = (overrides: Partial<{
  place_id: string;
  name: string;
  formatted_address: string;
  rating: number;
  types: string[];
  lat: number;
  lng: number;
}> = {}) => ({
  place_id: overrides.place_id ?? 'gp_default',
  name: overrides.name ?? 'Default Venue',
  formatted_address: overrides.formatted_address ?? '1 Main St, New York, NY 10002, USA',
  geometry: {
    location: {
      lat: overrides.lat ?? 40.72,
      lng: overrides.lng ?? -73.99,
    },
  },
  rating: overrides.rating ?? 4.0,
  types: overrides.types ?? ['bar'],
});

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate limit pass after resetAllMocks wipes it.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ---------------------------------------------------------------------------
// Auth + rate limiting
// ---------------------------------------------------------------------------
describe('GET /api/recommendations — auth & rate limiting', () => {
  it('returns 401 when no session present', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user.id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'NoId', email: 'noid@example.com' },
      expires: '2099-01-01',
    } as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_BLOCK);

    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('uses a recs-prefixed rate-limit key scoped to the user', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-xyz'));
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_PASS);
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq());

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    const args = mockCheckRateLimit.mock.calls[0];
    expect(args[1]).toBe('recs:user-xyz');
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe('GET /api/recommendations — query validation', () => {
  it('returns 400 when topicId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({}, false));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when topicId is not a cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const url = new URL('http://localhost/api/recommendations');
    url.searchParams.set('topicId', 'not-a-cuid');
    const res = await GET(new NextRequest(url.toString()));
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit exceeds 20', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: '50' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit is below 1', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: '0' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when cityArea exceeds 100 chars', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const longArea = 'x'.repeat(101);
    const res = await GET(makeReq({ cityArea: longArea }));
    expect(res.status).toBe(400);
  });

  it('coerces weightByCrew=true correctly and returns 200', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockResolvedValueOnce([placeResult({ place_id: 'gp_cw' })]);

    const res = await GET(makeReq({ weightByCrew: 'true' }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Google Places happy path
// ---------------------------------------------------------------------------
describe('GET /api/recommendations — Google Places source', () => {
  it('returns 200 with Places-sourced venues sorted by score desc', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      placeResult({ place_id: 'gp_lo', name: 'Lower Score', rating: 3.2 }),
      placeResult({ place_id: 'gp_hi', name: 'Higher Score', rating: 4.8 }),
      placeResult({ place_id: 'gp_mid', name: 'Mid Score', rating: 4.0 }),
    ]);

    const res = await GET(makeReq({ cityArea: 'lower-east-side' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toHaveLength(3);
    expect(body.data.recommendations[0].name).toBe('Higher Score');
    expect(body.data.recommendations[1].name).toBe('Mid Score');
    expect(body.data.recommendations[2].name).toBe('Lower Score');
    expect(body.data.recommendations[0].source).toBe('google_places');
  });

  it('expands cityArea slug to display name in Places query', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([placeResult({ place_id: 'gp_a' })]);

    await GET(makeReq({ cityArea: 'lower-east-side' }));

    expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
    const query = mockSearchPlaces.mock.calls[0][0].query;
    expect(query).toBe('bar in Lower East Side');
  });

  it('uses raw cityArea string when it does not match a known neighborhood slug', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockResolvedValueOnce([placeResult({ place_id: 'gp_b', types: ['cafe'] })]);

    await GET(makeReq({ cityArea: 'unknown-hood' }));

    const query = mockSearchPlaces.mock.calls[0][0].query;
    expect(query).toBe('cafe in unknown-hood');
  });

  it('builds a category-only query when no cityArea is supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['night_club'] });
    mockSearchPlaces.mockResolvedValueOnce([placeResult({ place_id: 'gp_c', types: ['night_club'] })]);

    await GET(makeReq());

    const query = mockSearchPlaces.mock.calls[0][0].query;
    // The map collapses underscores ('night_club' -> 'night club')
    expect(query).toBe('night club');
  });

  it('falls back to "meetup" subject when topic has no categories', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: [] });
    mockSearchPlaces.mockResolvedValueOnce([placeResult({ place_id: 'gp_d' })]);

    await GET(makeReq({ cityArea: 'soho' }));

    const query = mockSearchPlaces.mock.calls[0][0].query;
    expect(query).toBe('meetup in SoHo');
  });

  it('caps Places results to the requested limit', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockResolvedValueOnce(
      Array.from({ length: 15 }, (_, i) =>
        placeResult({
          place_id: `gp_${i}`,
          name: `Cafe ${i}`,
          rating: 3.0 + (i % 10) * 0.1,
          types: ['cafe'],
        }),
      ),
    );

    const res = await GET(makeReq({ limit: '4' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(4);
  });

  it('uses the 3.5 mid-range fallback when a Google result omits rating', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        ...placeResult({ place_id: 'gp_norating', name: 'No Rating Bar' }),
        rating: undefined,
      } as never,
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(1);
    expect(body.data.recommendations[0].rating).toBeNull();
    // Phase 3 hotness boost = 1.0 → score === baseScore (3.5)
    expect(body.data.recommendations[0].score).toBe(3.5);
    expect(body.data.recommendations[0].hotnessBoost).toBe(1.0);
  });

  it('returns categoriesUsed reflecting the topic mapping', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({
      placesCategories: ['bar', 'night_club'],
    });
    mockSearchPlaces.mockResolvedValueOnce([placeResult({ place_id: 'gp_x' })]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.categoriesUsed).toEqual(['bar', 'night_club']);
  });
});

// ---------------------------------------------------------------------------
// DB fallback
// ---------------------------------------------------------------------------
describe('GET /api/recommendations — DB fallback', () => {
  it('falls back to DB venues when Places returns an empty array', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([
      {
        id: 'cliab1234567890dbvenue1',
        name: 'DB Bar A',
        address: '100 LES',
        city: 'New York',
        category: 'BAR',
        latitude: 40.71,
        longitude: -73.98,
        imageUrl: null,
      },
      {
        id: 'cliab1234567890dbvenue2',
        name: 'DB Bar B',
        address: '200 LES',
        city: 'New York',
        category: 'BAR',
        latitude: 40.72,
        longitude: -73.99,
        imageUrl: 'https://example.com/img.jpg',
      },
    ]);

    const res = await GET(makeReq({ cityArea: 'lower-east-side' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(2);
    expect(body.data.recommendations[0].source).toBe('db');
    // DB rows have no rating; score = 3.5 * 1.0 (phase 3 boost)
    expect(body.data.recommendations[0].rating).toBeNull();
    expect(body.data.recommendations[0].score).toBe(3.5);
  });

  it('falls back to DB venues when Places throws (caught)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockRejectedValueOnce(new Error('places api down'));
    mockVenue.findMany.mockResolvedValueOnce([
      {
        id: 'cliab1234567890dbvenue3',
        name: 'DB Cafe',
        address: '300 Main',
        city: 'New York',
        category: 'COFFEE',
        latitude: 40.73,
        longitude: -73.97,
        imageUrl: null,
      },
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(1);
    expect(body.data.recommendations[0].source).toBe('db');
  });

  it('uses cityArea-scoped where-clause for DB fallback when cityArea present', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq({ cityArea: 'lower-east-side', limit: '5' }));

    expect(mockVenue.findMany).toHaveBeenCalledTimes(1);
    const args = mockVenue.findMany.mock.calls[0][0];
    expect(args.take).toBe(10); // limit * 2
    expect(args.where).toBeDefined();
    expect(args.where.OR).toBeDefined();
    expect(args.where.OR[0].city.contains).toBe('Lower East Side');
  });

  it('uses an empty where-clause for DB fallback when no cityArea supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq());

    const args = mockVenue.findMany.mock.calls[0][0];
    expect(args.where).toEqual({});
  });

  it('returns empty recommendations when both Places AND DB are empty', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: [] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.recommendations).toEqual([]);
    expect(body.data.categoriesUsed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------
describe('GET /api/recommendations — error handling', () => {
  it('returns 500 when Topic lookup throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockRejectedValueOnce(new Error('postgres connection lost'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to compute recommendations');
  });

  it('returns 500 when DB fallback findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockRejectedValueOnce(new Error('venue query failed'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });

  it('returns 500 when getServerSession throws', async () => {
    mockGetServerSession.mockRejectedValueOnce(new Error('auth check failed'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
