/**
 * Route tests for V1 Phase 4 — GET /api/heatmap.
 *
 * Covers auth, rate limit, query validation, tier=fof rejection (4a),
 * unknown cityArea rejection, and a happy-path interest aggregation that
 * exercises the prisma fan-out (crew → contributions → cells).
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
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET as GET_HEATMAP } from '@/app/api/heatmap/route';
import { checkRateLimit } from '@/lib/rate-limit';

type MockFn = ReturnType<typeof vi.fn>;
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { findMany: MockFn };
const mockRelSetting = prisma.crewRelationshipSetting as unknown as { findMany: MockFn };
const mockIntent = prisma.intent as unknown as { findMany: MockFn };
const mockCheckIn = prisma.checkIn as unknown as { findMany: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

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
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  mockCrew.findMany.mockResolvedValue([]);
  mockHeatmap.findMany.mockResolvedValue([]);
  mockRelSetting.findMany.mockResolvedValue([]);
  mockIntent.findMany.mockResolvedValue([]);
  mockCheckIn.findMany.mockResolvedValue([]);
  mockVenue.findMany.mockResolvedValue([]);
});

describe('GET /api/heatmap — auth + validation', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(401);
  });

  it('429 when rate limit exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(429);
  });

  it('400 on missing required query params', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(makeReq());
    expect(res.status).toBe(400);
  });

  it('400 on invalid type enum', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(makeReq('type=banana&tier=crew'));
    expect(res.status).toBe(400);
  });

  it('400 on unknown cityArea slug', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(
      makeReq('type=interest&tier=crew&cityArea=not-a-real-place'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cityArea/i);
  });

  it('400 on tier=fof in Phase 4a', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(makeReq('type=interest&tier=fof'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Phase 4b/);
  });
});

describe('GET /api/heatmap — happy paths', () => {
  it('returns empty payload when viewer has no Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.cells).toEqual([]);
    expect(body.data.venueMarkers).toEqual([]);
    expect(body.data.type).toBe('interest');
    expect(body.data.tier).toBe('crew');
    expect(body.data.generatedAt).toEqual(expect.any(String));
  });

  it('aggregates an interest cell across two Crew partners', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);

    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toEqual([
      { lat: 40.728, lng: -73.984, count: 2 },
    ]);
  });

  it('passes a known cityArea slug through to aggregation', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_HEATMAP(makeReq('type=interest&tier=crew&cityArea=east-village'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns presence-type aggregation with empty venueMarkers when no source has venueId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 'ci1', cellLat: 40.708, cellLng: -73.957, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'PRESENCE' },
    ]);
    mockCheckIn.findMany.mockResolvedValueOnce([{ id: 'ci1', venueId: null }]);

    const res = await GET_HEATMAP(makeReq('type=presence&tier=crew'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toHaveLength(1);
    expect(body.data.venueMarkers).toEqual([]);
  });
});
