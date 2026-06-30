/**
 * Complementary route tests for three V1 read-only endpoints:
 *   - GET /api/topics            (R1 manual-picker fallback)
 *   - GET /api/recommendations   (Journey C venue ranking)
 *   - GET /api/heatmap           (Journey D — see where people are)
 *
 * These tests focus on edge cases not covered by topics.test.ts /
 * recommendations.test.ts / heatmap.test.ts — rate-limit headers, query
 * coercion boundaries, FoF tier param plumbing, and response-shape
 * guarantees consumers rely on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.setConfig({ testTimeout: 20000 });

// --- mocks ----------------------------------------------------------------
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  logError: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
  withSentry: vi.fn((fn: unknown) => fn),
}));

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  aiRateLimiter: {},
  authRateLimiter: {},
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/api/places', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/places')>('@/lib/api/places');
  return {
    ...actual,
    searchPlaces: vi.fn(),
  };
});

import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { searchPlaces } from '@/lib/api/places';
import { __resetFofCacheForTests } from '@/lib/heatmap/fof-graph';

type MockFn = ReturnType<typeof vi.fn>;
const mockTopic = prisma.topic as unknown as {
  findMany: MockFn;
  findUnique: MockFn;
};
const mockVenue = prisma.venue as unknown as { findMany: MockFn };
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { findMany: MockFn };
const mockCheckIn = prisma.checkIn as unknown as { findMany: MockFn };
const mockIntent = prisma.intent as unknown as { findMany: MockFn };
const mockRelSetting = prisma.crewRelationshipSetting as unknown as {
  findMany: MockFn;
};
const mockUser = prisma.user as unknown as { findMany: MockFn };

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockCaptureException = vi.mocked(captureException);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 9999 };

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Test User', email: `${id}@example.com` },
  expires: '2099-01-01',
});

const VALID_TOPIC_ID = 'cliab1234567890drinks001';
const VALID_SUB_CREW_ID = 'cliab1234567890subcrew01';

beforeEach(() => {
  vi.clearAllMocks();
  __resetFofCacheForTests();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  mockGetRateLimitHeaders.mockReturnValue({});
  // Re-arm hotness-boost lookups for /api/recommendations (route always calls
  // heatmapContribution.findMany; crew.findMany only when weightByCrew=true).
  // Default [] → hotnessBoost 1.0 (neutral), so base scoring assertions hold.
  mockHeatmap.findMany.mockResolvedValue([]);
  mockCrew.findMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// /api/topics
// ---------------------------------------------------------------------------
describe('GET /api/topics — auxiliary coverage', () => {
  it('200 returns empty topics array when DB has none', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findMany.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/topics/route');
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.topics).toEqual([]);
  });

  it('200 response envelope contains only id/slug/displayName fields', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findMany.mockResolvedValueOnce([
      { id: 't1', slug: 'brunch', displayName: 'Brunch' },
    ]);

    const { GET } = await import('@/app/api/topics/route');
    const res = await GET();
    const body = await res.json();

    expect(body.data.topics[0]).toEqual({
      id: 't1',
      slug: 'brunch',
      displayName: 'Brunch',
    });
  });

  it('401 body includes Unauthorized error string', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/topics/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('401 when session has no user.id (malformed session)', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'Anon' },
      expires: '2099-01-01',
    } as unknown as Awaited<ReturnType<typeof getServerSession>>);

    const { GET } = await import('@/app/api/topics/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('500 captures exception via sentry on DB failure', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findMany.mockRejectedValueOnce(new Error('connection refused'));

    const { GET } = await import('@/app/api/topics/route');
    const res = await GET();

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('500 body uses generic error message (no internal details leaked)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findMany.mockRejectedValueOnce(
      new Error('SECRET_DB_CREDENTIALS_LEAKED'),
    );

    const { GET } = await import('@/app/api/topics/route');
    const res = await GET();
    const body = await res.json();

    expect(body.error).toBe('Failed to list topics');
    expect(body.error).not.toContain('SECRET');
  });
});

// ---------------------------------------------------------------------------
// /api/recommendations
// ---------------------------------------------------------------------------
describe('GET /api/recommendations — auxiliary coverage', () => {
  const makeReq = (params: Record<string, string> = {}) => {
    const url = new URL('http://localhost/api/recommendations');
    url.searchParams.set('topicId', VALID_TOPIC_ID);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return new NextRequest(url.toString());
  };

  it('429 when rate limit exceeded — includes rate-limit headers', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    mockGetRateLimitHeaders.mockReturnValueOnce({
      'X-RateLimit-Remaining': '0',
    });

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq());

    expect(res.status).toBe(429);
    expect(mockGetRateLimitHeaders).toHaveBeenCalled();
  });

  it('400 when topicId is not a cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const url = new URL('http://localhost/api/recommendations');
    url.searchParams.set('topicId', 'not-a-cuid');

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(new NextRequest(url.toString()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });

  it('400 when limit exceeds 20', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq({ limit: '99' }));

    expect(res.status).toBe(400);
  });

  it('400 when limit is zero', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq({ limit: '0' }));

    expect(res.status).toBe(400);
  });

  it('200 default limit is 8 when not provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => ({
        place_id: `gp${i}`,
        name: `Bar ${i}`,
        formatted_address: `${i} St`,
        geometry: { location: { lat: 40.72, lng: -73.99 } },
        rating: 4.0,
        types: ['bar'],
      })),
    );

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.recommendations).toHaveLength(8);
  });

  it('200 weightByCrew=true is accepted and returned via score pipeline', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gpA',
        name: 'Cafe A',
        formatted_address: '1 St',
        geometry: { location: { lat: 40.72, lng: -73.99 } },
        rating: 4.5,
        types: ['cafe'],
      },
    ]);

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq({ weightByCrew: 'true' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations[0].hotnessBoost).toBe(1.0);
  });

  it('200 falls back to DB venues when searchPlaces throws (catch → [])', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockRejectedValueOnce(new Error('places API down'));
    mockVenue.findMany.mockResolvedValueOnce([
      {
        id: 'cliab1234567890dbvenueX',
        name: 'Fallback Bar',
        address: '1 LES',
        city: 'New York',
        category: 'BAR',
        latitude: 40.72,
        longitude: -73.99,
        imageUrl: null,
      },
    ]);

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq({ cityArea: 'lower-east-side' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations[0].source).toBe('db');
  });

  it('200 includes categoriesUsed array in response payload', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({
      placesCategories: ['bar', 'pub'],
    });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.data.categoriesUsed).toEqual(['bar', 'pub']);
  });

  it('200 each recommendation envelope has source/score/hotnessBoost', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp1',
        name: 'Bar',
        formatted_address: '1 St',
        geometry: { location: { lat: 40.72, lng: -73.99 } },
        rating: 4.2,
        types: ['bar'],
      },
    ]);

    const { GET } = await import('@/app/api/recommendations/route');
    const res = await GET(makeReq());
    const body = await res.json();

    const rec = body.data.recommendations[0];
    expect(rec).toHaveProperty('id');
    expect(rec).toHaveProperty('source', 'google_places');
    expect(rec).toHaveProperty('score');
    expect(rec).toHaveProperty('hotnessBoost');
    expect(rec).toHaveProperty('rating', 4.2);
  });
});

// ---------------------------------------------------------------------------
// /api/heatmap
// ---------------------------------------------------------------------------
describe('GET /api/heatmap — auxiliary coverage', () => {
  const makeReq = (qs: string) =>
    new NextRequest(`http://localhost/api/heatmap?${qs}`);

  beforeEach(() => {
    // Defaults that keep aggregateContributions from blowing up.
    mockCrew.findMany.mockResolvedValue([]);
    mockHeatmap.findMany.mockResolvedValue([]);
    mockRelSetting.findMany.mockResolvedValue([]);
    mockIntent.findMany.mockResolvedValue([]);
    mockCheckIn.findMany.mockResolvedValue([]);
    mockVenue.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([]);
  });

  it('400 when tier is not crew|fof', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(makeReq('type=interest&tier=galaxy'));

    expect(res.status).toBe(400);
  });

  it('400 when mutualThreshold is below 1', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(
      makeReq('type=interest&tier=fof&mutualThreshold=0'),
    );

    expect(res.status).toBe(400);
  });

  it('400 when windowPreset is not a valid enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(
      makeReq('type=interest&tier=crew&windowPreset=NEVER'),
    );

    expect(res.status).toBe(400);
  });

  it('400 when topicId is not a cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(
      makeReq('type=interest&tier=crew&topicId=not-a-cuid'),
    );

    expect(res.status).toBe(400);
  });

  it('200 response payload includes generatedAt ISO string', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(makeReq('type=presence&tier=crew'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(typeof body.data.generatedAt).toBe('string');
    expect(() => new Date(body.data.generatedAt)).not.toThrow();
  });

  it('200 echoes back type and tier in response payload', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(makeReq('type=presence&tier=crew'));
    const body = await res.json();

    expect(body.data.type).toBe('presence');
    expect(body.data.tier).toBe('crew');
  });

  it('200 accepts valid subCrewId for fof tier (R24 priority 1 hook)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(
      makeReq(
        `type=interest&tier=fof&mutualThreshold=1&subCrewId=${VALID_SUB_CREW_ID}`,
      ),
    );

    // Empty crew → empty payload, but request must parse + return 200.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('fof');
  });

  it('200 default mutualThreshold of 1 is applied for fof when omitted', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(makeReq('type=interest&tier=fof'));

    expect(res.status).toBe(200);
  });

  it('500 captures exception when aggregation throws unexpectedly', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockRejectedValueOnce(new Error('db blowup'));

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(makeReq('type=interest&tier=crew'));

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('401 returns unauthorized body shape consumers can branch on', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/heatmap/route');
    const res = await GET(makeReq('type=interest&tier=crew'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });
});
