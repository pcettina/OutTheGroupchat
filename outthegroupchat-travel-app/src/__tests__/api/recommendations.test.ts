/**
 * Unit tests for GET /api/recommendations.
 *
 * Pipeline: Topic → Places categories → Google Places search → score by
 * (rating × hotnessBoost) → sort → cap. Falls back to DB venues when Places
 * returns nothing.
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

type MockFn = ReturnType<typeof vi.fn>;
const mockTopic = prisma.topic as unknown as { findUnique: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

const TOPIC_ID = 'cliab1234567890drinks001';

const makeReq = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/recommendations');
  url.searchParams.set('topicId', TOPIC_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

describe('GET /api/recommendations', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('400 when topicId missing or invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const url = new URL('http://localhost/api/recommendations');
    const res = await GET(new NextRequest(url.toString()));
    expect(res.status).toBe(400);
  });

  it('200 returns Google-Places-sourced results sorted by score desc', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp1',
        name: 'Lower Bar',
        formatted_address: '123 LES, NYC',
        geometry: { location: { lat: 40.72, lng: -73.99 } },
        rating: 4.6,
        types: ['bar'],
      },
      {
        place_id: 'gp2',
        name: 'Smaller Bar',
        formatted_address: '456 LES, NYC',
        geometry: { location: { lat: 40.722, lng: -73.991 } },
        rating: 3.9,
        types: ['bar'],
      },
    ]);

    const res = await GET(makeReq({ cityArea: 'lower-east-side' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(2);
    expect(body.data.recommendations[0].name).toBe('Lower Bar');
    expect(body.data.recommendations[0].score).toBeGreaterThan(body.data.recommendations[1].score);
    expect(body.data.recommendations[0].source).toBe('google_places');
    expect(body.data.recommendations[0].hotnessBoost).toBe(1.0); // Phase 3 stub
    expect(body.data.categoriesUsed).toEqual(['bar']);

    // Query should expand cityArea slug to display name
    const query = mockSearchPlaces.mock.calls[0][0].query as string;
    expect(query).toBe('bar in Lower East Side');
  });

  it('200 falls back to DB venues when Google Places returns nothing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([
      {
        id: 'cliab1234567890dbvenue1',
        name: 'DB Bar',
        address: '789 LES, NYC',
        city: 'New York',
        category: 'BAR',
        latitude: 40.72,
        longitude: -73.99,
        imageUrl: null,
      },
    ]);

    const res = await GET(makeReq({ cityArea: 'lower-east-side' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(1);
    expect(body.data.recommendations[0].source).toBe('db');
    expect(body.data.recommendations[0].name).toBe('DB Bar');
  });

  it('200 caps results to limit', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['cafe'] });
    mockSearchPlaces.mockResolvedValueOnce(
      Array.from({ length: 12 }, (_, i) => ({
        place_id: `gp${i}`,
        name: `Cafe ${i}`,
        formatted_address: `${i} Main St, NYC`,
        geometry: { location: { lat: 40.7 + i * 0.001, lng: -73.99 } },
        rating: 4.0 + (i % 5) * 0.1,
        types: ['cafe'],
      })),
    );

    const res = await GET(makeReq({ limit: '3' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(3);
  });

  it('500 when Topic lookup throws unexpectedly', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });

  it('200 returns empty array when topic has no categories AND Places returns nothing AND DB has no venues', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: [] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toEqual([]);
  });
});
