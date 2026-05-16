/**
 * Edge case tests for V1 Phase 4 — GET /api/heatmap.
 *
 * Complementary to heatmap.test.ts. Covers:
 *   - additional Zod validation paths (tier, windowPreset, topicId, cityArea length)
 *   - 401 when session has no user.id
 *   - 429 emits rate-limit headers
 *   - HIDDEN granularity setting drops a Crew partner
 *   - R14 anonymous N>=3 floor (drops at N=2, surfaces at N=3)
 *   - SUBGROUP_ONLY scope contributions visible in Crew tier
 *   - venueMarkers surface for presence with venueId
 *   - cells sorted by count desc
 *   - Crew tier ignores mutualThreshold (no FoF semantics)
 *   - Unhandled error → 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({ 'X-RateLimit-Limit': '100' }),
}));

import { GET as GET_HEATMAP } from '@/app/api/heatmap/route';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { __resetFofCacheForTests } from '@/lib/heatmap/fof-graph';

type MockFn = ReturnType<typeof vi.fn>;
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { findMany: MockFn };
const mockRelSetting = prisma.crewRelationshipSetting as unknown as { findMany: MockFn };
const mockIntent = prisma.intent as unknown as { findMany: MockFn };
const mockCheckIn = prisma.checkIn as unknown as { findMany: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetRateLimitHeaders = vi.mocked(getRateLimitHeaders);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'v1') => ({
  user: { id, name: 'Viewer', email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeReq = (qs = '') =>
  new NextRequest(`http://localhost/api/heatmap${qs ? '?' + qs : ''}`);

beforeEach(() => {
  vi.resetAllMocks();
  __resetFofCacheForTests();
  // Re-arm rate-limit mocks because resetAllMocks wipes factory defaults.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  mockGetRateLimitHeaders.mockReturnValue({ 'X-RateLimit-Limit': '100' });
  mockCrew.findMany.mockResolvedValue([]);
  mockHeatmap.findMany.mockResolvedValue([]);
  mockRelSetting.findMany.mockResolvedValue([]);
  mockIntent.findMany.mockResolvedValue([]);
  mockCheckIn.findMany.mockResolvedValue([]);
  mockVenue.findMany.mockResolvedValue([]);
});

describe('GET /api/heatmap — extra validation edges', () => {
  it('400 on invalid tier enum', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(makeReq('type=interest&tier=public'));
    expect(res.status).toBe(400);
  });

  it('400 on mutualThreshold below range (0)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(
      makeReq('type=interest&tier=fof&mutualThreshold=0'),
    );
    expect(res.status).toBe(400);
  });

  it('400 on mutualThreshold non-numeric', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(
      makeReq('type=interest&tier=fof&mutualThreshold=abc'),
    );
    expect(res.status).toBe(400);
  });

  it('400 on topicId not a cuid', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(
      makeReq('type=interest&tier=crew&topicId=not-a-cuid'),
    );
    expect(res.status).toBe(400);
  });

  it('400 on invalid windowPreset enum', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(
      makeReq('type=interest&tier=crew&windowPreset=MIDNIGHT_SNACK'),
    );
    expect(res.status).toBe(400);
  });

  it('400 on cityArea exceeding 100 chars', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const longSlug = 'a'.repeat(101);
    const res = await GET_HEATMAP(
      makeReq(`type=interest&tier=crew&cityArea=${longSlug}`),
    );
    expect(res.status).toBe(400);
  });

  it('401 when session exists but user.id missing', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No Id', email: 'noid@example.com' },
      expires: '2099-01-01',
    } as unknown as ReturnType<typeof sessionFor>);
    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });
});

describe('GET /api/heatmap — rate limit edges', () => {
  it('429 includes rate-limit headers from getRateLimitHeaders', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
  });
});

describe('GET /api/heatmap — Crew tier semantics', () => {
  it('HIDDEN granularity setting drops the contribution from that partner', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST',
      },
      {
        id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.728, cellLng: -73.984,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST',
      },
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([
      { targetId: 'p2', granularityMode: 'HIDDEN' },
    ]);

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toEqual([{ lat: 40.728, lng: -73.984, count: 1 }]);
  });

  it('R14 anonymous floor: N=2 anonymous contributions yield 0 cells', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.7, cellLng: -73.9,
        cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
      {
        id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.7, cellLng: -73.9,
        cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
    ]);

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toEqual([]);
  });

  it('R14 anonymous floor: N=3 anonymous contributions surface', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.7, cellLng: -73.9,
        cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
      {
        id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.7, cellLng: -73.9,
        cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
      {
        id: 'h3', userId: 'p3', sourceId: 's3', cellLat: 40.7, cellLng: -73.9,
        cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
    ]);

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toEqual([{ lat: 40.7, lng: -73.9, count: 3 }]);
  });

  it('cells are sorted by count descending', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
    ]);
    // Cell A: 1 known. Cell B: 2 known.
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'a1', userId: 'p1', sourceId: 's1', cellLat: 40.700, cellLng: -73.900,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
      {
        id: 'b1', userId: 'p2', sourceId: 's2', cellLat: 40.800, cellLng: -73.800,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
      {
        id: 'b2', userId: 'p3', sourceId: 's3', cellLat: 40.800, cellLng: -73.800,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
    ]);

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells.map((c: { count: number }) => c.count)).toEqual([2, 1]);
  });

  it('SUBGROUP_ONLY contributions are visible to Crew tier viewers', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.71, cellLng: -73.95,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'SUBGROUP_ONLY',
        windowPreset: 'NIGHT', topicId: null, type: 'INTEREST',
      },
    ]);

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toHaveLength(1);
  });

  it('mutualThreshold on Crew tier is parsed but does not affect aggregation', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
    ]);

    // Crew tier ignores mutualThreshold; passing a valid one shouldn't break.
    const res = await GET_HEATMAP(
      makeReq('type=interest&tier=crew&mutualThreshold=5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toHaveLength(1);
  });
});

describe('GET /api/heatmap — venueMarkers (z=15 threshold data)', () => {
  it('presence type with venueId surfaces a venueMarker', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'p1', sourceId: 'ci1', cellLat: 40.708, cellLng: -73.957,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'PRESENCE',
      },
    ]);
    mockCheckIn.findMany.mockResolvedValueOnce([{ id: 'ci1', venueId: 'venue-1' }]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-1', name: 'Hideout Bar', latitude: 40.708, longitude: -73.957 },
    ]);

    const res = await GET_HEATMAP(makeReq('type=presence&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.venueMarkers).toEqual([
      { venueId: 'venue-1', lat: 40.708, lng: -73.957, count: 1, venueName: 'Hideout Bar' },
    ]);
  });

  it('venue with null lat/lng is dropped from venueMarkers', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'p1', sourceId: 'i1', cellLat: 40.728, cellLng: -73.984,
        cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW',
        windowPreset: null, topicId: null, type: 'INTEREST',
      },
    ]);
    mockIntent.findMany.mockResolvedValueOnce([{ id: 'i1', venueId: 'venue-x' }]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-x', name: 'Mystery Spot', latitude: null, longitude: null },
    ]);

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.venueMarkers).toEqual([]);
  });
});

describe('GET /api/heatmap — error handling', () => {
  it('500 when prisma.crew.findMany throws unexpectedly', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to load heatmap');
  });
});
