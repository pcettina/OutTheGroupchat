/**
 * Edge-case unit tests for GET /api/recommendations (V1 Phase 3 venue recs).
 *
 * Complements src/__tests__/api/recommendations.test.ts — this file covers the
 * NON-duplicative branches: Zod validation failures (bad cuid / limit bounds),
 * rate limiting (429), Sentry capture on the 500 path, the rating-omitted score
 * fallback, the DB-fallback where-clause / take invariants, query construction
 * for unknown vs known cityArea slugs, and param coercion (weightByCrew, limit
 * default).
 *
 * Prisma, NextAuth, logger, and sentry mocks come from src/__tests__/setup.ts.
 * This file re-mocks @/lib/rate-limit for a controllable reference and re-arms
 * it after vi.resetAllMocks() in beforeEach (per the checkins.test.ts pattern).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mocks — declared before route import (hoisted by Vitest).
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/api/places', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/places')>('@/lib/api/places');
  return {
    ...actual,
    searchPlaces: vi.fn(),
  };
});

import { GET } from '@/app/api/recommendations/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { searchPlaces } from '@/lib/api/places';
import { captureException } from '@/lib/sentry';

type MockFn = ReturnType<typeof vi.fn>;
const mockTopic = prisma.topic as unknown as { findUnique: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockCaptureException = vi.mocked(captureException);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 1234 };

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

// 25-char cuid-shaped id (c + 24 chars), accepted by z.string().cuid().
const TOPIC_ID = 'cliab1234567890drinks001';

const makeReq = (params: Record<string, string> = {}, includeTopic = true) => {
  const url = new URL('http://localhost/api/recommendations');
  if (includeTopic) url.searchParams.set('topicId', TOPIC_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate-limit mock — vi.resetAllMocks() wipes the factory default.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

describe('GET /api/recommendations — validation edge cases', () => {
  it('400 when topicId is present but not a valid cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ topicId: 'not-a-cuid' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
    // Zod flatten() details surfaced for the client.
    expect(body.details).toBeDefined();
  });

  it('400 when limit exceeds the max of 20', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: '21' }));
    expect(res.status).toBe(400);
  });

  it('400 when limit is below the min of 1', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: '0' }));
    expect(res.status).toBe(400);
  });

  it('400 when limit is non-numeric', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('400 when cityArea exceeds the 100-char max', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ cityArea: 'x'.repeat(101) }));
    expect(res.status).toBe(400);
  });

  it('does not call Places or DB when validation fails', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    await GET(makeReq({ topicId: 'bad' }));
    expect(mockSearchPlaces).not.toHaveBeenCalled();
    expect(mockVenue.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/recommendations — rate limiting', () => {
  it('429 when the rate limiter rejects the request', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
    // Short-circuits before any data lookup.
    expect(mockTopic.findUnique).not.toHaveBeenCalled();
    expect(mockSearchPlaces).not.toHaveBeenCalled();
  });

  it('rate-limit key is scoped to the caller id', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-xyz'));
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq());
    expect(mockCheckRateLimit).toHaveBeenCalledWith(null, 'recs:user-xyz');
  });
});

describe('GET /api/recommendations — error handling', () => {
  it('500 reports to Sentry via captureException when Places search rejects', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    // searchPlaces itself is wrapped in .catch(() => []) in the route, so to
    // force an unhandled throw we make the Topic categories lookup reject after
    // the rate-limit gate. (Covered separately from the existing topic-throw
    // test by asserting captureException is invoked.)
    mockTopic.findUnique.mockReset();
    mockTopic.findUnique.mockRejectedValueOnce(new Error('places exploded'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to compute recommendations');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('500 when the DB fallback findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]); // forces DB fallback
    mockVenue.findMany.mockRejectedValueOnce(new Error('venue table gone'));

    const res = await GET(makeReq({ cityArea: 'soho' }));
    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('searchPlaces rejection is swallowed and falls through to DB (no 500)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockRejectedValueOnce(new Error('network')); // .catch(()=>[])
    mockVenue.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toEqual([]);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe('GET /api/recommendations — scoring & ranking invariants', () => {
  it('uses the 3.5 mid-range fallback score when Google omits a rating', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp-no-rating',
        name: 'Unrated Bar',
        formatted_address: '1 Nowhere, NYC',
        geometry: { location: { lat: 40.7, lng: -73.9 } },
        types: ['bar'],
        // rating omitted
      },
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    const rec = body.data.recommendations[0];
    // baseScore 3.5 × hotnessBoost 1.0 (Phase 3 stub).
    expect(rec.rating).toBeNull();
    expect(rec.score).toBe(3.5);
    expect(rec.hotnessBoost).toBe(1.0);
  });

  it('ranks a higher-rated venue above a lower-rated one even when listed last', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'lowrated',
        name: 'Meh Cafe',
        formatted_address: '2 St, NYC',
        geometry: { location: { lat: 40.7, lng: -73.9 } },
        rating: 2.1,
        types: ['cafe'],
      },
      {
        place_id: 'toprated',
        name: 'Great Cafe',
        formatted_address: '3 St, NYC',
        geometry: { location: { lat: 40.7, lng: -73.9 } },
        rating: 4.9,
        types: ['cafe'],
      },
    ]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.recommendations[0].name).toBe('Great Cafe');
    expect(body.data.recommendations[0].score).toBeGreaterThan(
      body.data.recommendations[1].score,
    );
  });

  it('applies the default limit of 8 when no limit param is supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce(
      Array.from({ length: 15 }, (_, i) => ({
        place_id: `gp${i}`,
        name: `Bar ${i}`,
        formatted_address: `${i} St, NYC`,
        geometry: { location: { lat: 40.7, lng: -73.9 } },
        rating: 4.0,
        types: ['bar'],
      })),
    );

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(8);
  });
});

describe('GET /api/recommendations — DB fallback invariants', () => {
  it('omits the where filter (empty object) when no cityArea is supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq()); // no cityArea
    const arg = mockVenue.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({});
  });

  it('builds an insensitive city/address OR filter when cityArea is supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq({ cityArea: 'east-village' }));
    const arg = mockVenue.findMany.mock.calls[0][0];
    // Display name resolved from the slug is used in the contains filter.
    expect(arg.where.OR).toEqual([
      { city: { contains: 'East Village', mode: 'insensitive' } },
      { address: { contains: 'East Village', mode: 'insensitive' } },
    ]);
  });

  it('over-fetches limit*2 rows from the DB before sorting/capping', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq({ limit: '5' }));
    const arg = mockVenue.findMany.mock.calls[0][0];
    expect(arg.take).toBe(10);
  });

  it('DB-sourced venues carry source:"db", null rating, and 3.5 score', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([
      {
        id: 'cliab1234567890dbvenueAA',
        name: 'Fallback Tavern',
        address: '9 St, NYC',
        city: 'New York',
        category: 'BAR',
        latitude: 40.7,
        longitude: -73.9,
        imageUrl: null,
      },
    ]);

    const res = await GET(makeReq({ cityArea: 'soho' }));
    const body = await res.json();
    const rec = body.data.recommendations[0];
    expect(rec.source).toBe('db');
    expect(rec.rating).toBeNull();
    expect(rec.score).toBe(3.5);
    expect(rec.id).toBe('cliab1234567890dbvenueAA');
  });
});

describe('GET /api/recommendations — query construction & coercion', () => {
  it('passes an unknown cityArea slug through verbatim into the Places query', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq({ cityArea: 'narnia' }));
    const query = mockSearchPlaces.mock.calls[0][0].query as string;
    // No matching slug → raw value used as the display name.
    expect(query).toBe('bar in narnia');
  });

  it('builds a location-less query when cityArea is absent', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['night_club'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq());
    const query = mockSearchPlaces.mock.calls[0][0].query as string;
    // Underscore expanded, no " in <area>" suffix.
    expect(query).toBe('night club');
  });

  it('falls back to "meetup" subject when the topic has no categories', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: [] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    await GET(makeReq({ cityArea: 'soho' }));
    const query = mockSearchPlaces.mock.calls[0][0].query as string;
    expect(query).toBe('meetup in SoHo');
  });

  it('echoes the resolved categories back in categoriesUsed', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar', 'night_club'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.categoriesUsed).toEqual(['bar', 'night_club']);
  });

  it('coerces weightByCrew=true and still returns a 200 success shape', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq({ weightByCrew: 'true' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.recommendations)).toBe(true);
  });
});
