/**
 * Edge-case unit tests for GET /api/recommendations.
 *
 * Complements the base suite (recommendations.test.ts) with coverage of
 * malformed input, rate limiting, boundary conditions, fallback behavior,
 * and error paths (Sentry capture).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

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
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60_000 };

const TOPIC_ID = 'cliab1234567890drinks001';

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

const makeReq = (params: Record<string, string> = {}, withTopic = true) => {
  const url = new URL('http://localhost/api/recommendations');
  if (withTopic) url.searchParams.set('topicId', TOPIC_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate limiter — vi.resetAllMocks() wipes factory-level mocks.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

describe('GET /api/recommendations — edge cases', () => {
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  it('401 when getServerSession returns null', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('401 when session has no user.id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No-Id', email: 'x@y.com' },
      expires: '2099-01-01',
    } as unknown as ReturnType<typeof sessionFor>);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Zod validation — malformed query params
  // ---------------------------------------------------------------------------
  it('400 when topicId is not a cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ topicId: 'not-a-cuid' }, false));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid query parameters');
    expect(body.details).toBeDefined();
  });

  it('400 when limit is below minimum (0)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: '0' }));
    expect(res.status).toBe(400);
  });

  it('400 when limit exceeds maximum (>20)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: '21' }));
    expect(res.status).toBe(400);
  });

  it('400 when limit is non-numeric', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ limit: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('400 when cityArea exceeds 100 chars', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET(makeReq({ cityArea: 'x'.repeat(101) }));
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------
  it('429 when rate limit exhausted', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });

  // ---------------------------------------------------------------------------
  // Boundaries on limit
  // ---------------------------------------------------------------------------
  it('200 accepts limit=1 (minimum boundary)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp1',
        name: 'Bar A',
        formatted_address: '1 St',
        geometry: { location: { lat: 40.7, lng: -74 } },
        rating: 4.5,
        types: ['bar'],
      },
      {
        place_id: 'gp2',
        name: 'Bar B',
        formatted_address: '2 St',
        geometry: { location: { lat: 40.71, lng: -74 } },
        rating: 4.0,
        types: ['bar'],
      },
    ]);
    const res = await GET(makeReq({ limit: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(1);
    expect(body.data.recommendations[0].name).toBe('Bar A');
  });

  it('200 accepts limit=20 (maximum boundary)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => ({
        place_id: `gp${i}`,
        name: `Cafe ${i}`,
        formatted_address: `${i} St`,
        geometry: { location: { lat: 40.7 + i * 0.001, lng: -74 } },
        rating: 4.0,
        types: ['cafe'],
      })),
    );
    const res = await GET(makeReq({ limit: '20' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(20);
  });

  // ---------------------------------------------------------------------------
  // Fallback paths
  // ---------------------------------------------------------------------------
  it('200 falls back to DB venues when searchPlaces throws (caught)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockRejectedValueOnce(new Error('places API down'));
    mockVenue.findMany.mockResolvedValueOnce([
      {
        id: 'cliab1234567890dbvenue1',
        name: 'Fallback Bar',
        address: '789 LES, NYC',
        city: 'New York',
        category: 'BAR',
        latitude: 40.72,
        longitude: -73.99,
        imageUrl: null,
      },
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(1);
    expect(body.data.recommendations[0].source).toBe('db');
  });

  it('200 DB fallback with no cityArea uses empty where clause', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(mockVenue.findMany).toHaveBeenCalledTimes(1);
    const args = mockVenue.findMany.mock.calls[0][0];
    expect(args.where).toEqual({});
  });

  it('200 unrecognized cityArea slug is passed through verbatim to query', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp1',
        name: 'Bar X',
        formatted_address: '1 St',
        geometry: { location: { lat: 40.7, lng: -74 } },
        rating: 4.0,
        types: ['bar'],
      },
    ]);

    const res = await GET(makeReq({ cityArea: 'unknown-area-slug' }));
    expect(res.status).toBe(200);
    const query = mockSearchPlaces.mock.calls[0][0].query as string;
    // No NYC_NEIGHBORHOODS match → query falls back to raw cityArea slug
    expect(query).toBe('bar in unknown-area-slug');
  });

  it('200 uses fallback rating 3.5 for places missing rating', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp1',
        name: 'No Rating Bar',
        formatted_address: '1 St',
        geometry: { location: { lat: 40.7, lng: -74 } },
        types: ['bar'],
        // rating omitted
      },
    ]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations[0].rating).toBeNull();
    // hotnessBoost is 1.0 (Phase 3 stub) → score = 3.5 * 1.0
    expect(body.data.recommendations[0].score).toBe(3.5);
  });

  // ---------------------------------------------------------------------------
  // Error path → Sentry capture
  // ---------------------------------------------------------------------------
  it('500 + Sentry capture when prisma.topic.findUnique rejects', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const dbError = new Error('connection refused');
    mockTopic.findUnique.mockRejectedValueOnce(dbError);

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to compute recommendations');
    expect(mockCaptureException).toHaveBeenCalledWith(dbError);
  });

  it('500 + Sentry capture when prisma.venue.findMany rejects in DB fallback', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    const dbError = new Error('venue table missing');
    mockVenue.findMany.mockRejectedValueOnce(dbError);

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledWith(dbError);
  });
});
