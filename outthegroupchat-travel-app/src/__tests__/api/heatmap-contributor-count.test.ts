/**
 * Route tests for V1 Phase 4 — GET /api/heatmap/contributor-count (R14 probe).
 *
 * Covers auth, rate limiting, Zod validation, the aggregate-only response
 * shape (no user identifiers may leak), the N>=3 anonymous-floor boundary,
 * unresolved-cell fail-safe behaviour, and the 500 error path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  HeatmapContributionType,
  HeatmapGranularityMode,
  HeatmapIdentityMode,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/sentry';
import { apiLogger } from '@/lib/logger';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET as GET_CONTRIBUTOR_COUNT } from '@/app/api/heatmap/contributor-count/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { ANONYMOUS_FLOOR } from '@/lib/heatmap/anonymous-floor';

type MockFn = ReturnType<typeof vi.fn>;
const mockVenue = prisma.venue as unknown as { findUnique: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { count: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockCaptureException = vi.mocked(captureException);

const BASE_URL = 'http://localhost/api/heatmap/contributor-count';

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// A CUID-shaped id — the route Zod schema requires venueId to be cuid().
const VENUE_CUID = 'claaaaaaaaaaaaaaaaaaaaaaa';

// A real slug from the NYC neighborhood taxonomy (centroid 40.728 / -73.984).
const KNOWN_SLUG = 'east-village';

const sessionFor = (id = 'viewer-1') => ({
  user: { id, name: 'Viewer', email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeGetReq = (queryParams: Record<string, string> = {}) => {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
};

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks.
// vi.resetAllMocks() wipes factory-level mockResolvedValue, so checkRateLimit
// MUST be re-armed here or every post-auth test 500s.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

describe('GET /api/heatmap/contributor-count — auth + rate limit', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('401 when the session carries no user id', async () => {
    mockGetServerSession.mockResolvedValueOnce({ expires: '2099-01-01' });
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(401);
  });

  it('429 when the rate limiter rejects', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
    // The probe must not touch the database once rate limited.
    expect(mockHeatmap.count).not.toHaveBeenCalled();
  });
});

describe('GET /api/heatmap/contributor-count — validation', () => {
  it('400 when no query params are supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(makeGetReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('400 on a missing granularity', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on an unsupported granularity (HIDDEN is not probeable)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'HIDDEN', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on a bogus granularity value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'STREET', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on an invalid type enum', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'banana', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(400);
  });

  it('400 when neither venueId nor cityArea is supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('400 on a non-cuid venueId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', venueId: 'not-a-cuid' }),
    );
    expect(res.status).toBe(400);
  });

  it('400 on a malformed / unknown cityArea slug', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({
        type: 'interest',
        granularity: 'BLOCK',
        cityArea: 'not-a-real-place',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cityArea/i);
  });
});

describe('GET /api/heatmap/contributor-count — happy path + response shape', () => {
  it('200 returns ONLY the aggregate fields and leaks no user identifiers', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockHeatmap.count.mockResolvedValueOnce(7);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Object.keys(body).sort()).toEqual(['data', 'success']);
    expect(Object.keys(body.data).sort()).toEqual([
      'cellResolved',
      'count',
      'floor',
      'meetsFloor',
    ]);
    expect(body.data).toEqual({
      count: 8, // 7 existing rows + the requester's prospective contribution
      floor: ANONYMOUS_FLOOR,
      meetsFloor: true,
      cellResolved: true,
    });

    // Privacy invariant: no ids, names, emails, or row arrays anywhere.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/viewer-1/);
    expect(serialized).not.toMatch(/@example\.com/);
    expect(serialized).not.toMatch(/userId|contributors|rows|name|email|\bid\b/i);
  });

  it('counts only live ANONYMOUS rows of the requested type in the resolved cell', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockHeatmap.count.mockResolvedValueOnce(4);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'presence', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(200);

    expect(mockHeatmap.count).toHaveBeenCalledTimes(1);
    const where = mockHeatmap.count.mock.calls[0][0].where;
    expect(where.type).toBe(HeatmapContributionType.PRESENCE);
    expect(where.identityMode).toBe(HeatmapIdentityMode.ANONYMOUS);
    // east-village centroid snapped at BLOCK precision (3 decimals).
    expect(where.cellLat).toBeCloseTo(40.728, 6);
    expect(where.cellLng).toBeCloseTo(-73.984, 6);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('resolves the cell from a venue when venueId is supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockVenue.findUnique.mockResolvedValueOnce({
      latitude: 40.71234,
      longitude: -73.98766,
    });
    mockHeatmap.count.mockResolvedValueOnce(0);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({
        type: 'interest',
        granularity: HeatmapGranularityMode.DYNAMIC_CELL,
        venueId: VENUE_CUID,
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.cellResolved).toBe(true);
    expect(body.data.count).toBe(1);
    expect(body.data.meetsFloor).toBe(false);

    // DYNAMIC_CELL snaps to 4 decimals.
    const where = mockHeatmap.count.mock.calls[0][0].where;
    expect(where.cellLat).toBeCloseTo(40.7123, 6);
    expect(where.cellLng).toBeCloseTo(-73.9877, 6);
  });

  it('logs the probe without echoing any counted contributor', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockHeatmap.count.mockResolvedValueOnce(2);

    await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );

    expect(vi.mocked(apiLogger.info)).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(apiLogger.info).mock.calls[0][0];
    expect(logged).toEqual({
      viewerId: 'viewer-1',
      type: 'interest',
      granularity: 'BLOCK',
      cellResolved: true,
      meetsFloor: true,
    });
  });
});

describe('GET /api/heatmap/contributor-count — R14 floor boundary', () => {
  it('floor is 3', () => {
    expect(ANONYMOUS_FLOOR).toBe(3);
  });

  it('N=2 (1 existing + requester) -> meetsFloor false', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockHeatmap.count.mockResolvedValueOnce(1);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    const body = await res.json();
    expect(body.data.count).toBe(2);
    expect(body.data.floor).toBe(3);
    expect(body.data.meetsFloor).toBe(false);
  });

  it('N=3 (2 existing + requester) -> meetsFloor true', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockHeatmap.count.mockResolvedValueOnce(2);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    const body = await res.json();
    expect(body.data.count).toBe(3);
    expect(body.data.meetsFloor).toBe(true);
  });

  it('N=1 (empty cell, requester alone) -> meetsFloor false', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockHeatmap.count.mockResolvedValueOnce(0);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    const body = await res.json();
    expect(body.data.count).toBe(1);
    expect(body.data.meetsFloor).toBe(false);
  });
});

describe('GET /api/heatmap/contributor-count — unresolved cell fails safe', () => {
  it('cellResolved false when the venue has no coordinates and no cityArea fallback', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockVenue.findUnique.mockResolvedValueOnce({ latitude: null, longitude: null });

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', venueId: VENUE_CUID }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual({
      count: 0,
      floor: ANONYMOUS_FLOOR,
      meetsFloor: false,
      cellResolved: false,
    });
    expect(mockHeatmap.count).not.toHaveBeenCalled();
  });

  it('cellResolved false when the venue does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockVenue.findUnique.mockResolvedValueOnce(null);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'presence', granularity: 'BLOCK', venueId: VENUE_CUID }),
    );
    const body = await res.json();
    expect(body.data.cellResolved).toBe(false);
    expect(body.data.meetsFloor).toBe(false);
    expect(body.data.count).toBe(0);
  });

  it('falls back to the cityArea centroid when the venue has no coordinates', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockVenue.findUnique.mockResolvedValueOnce(null);
    mockHeatmap.count.mockResolvedValueOnce(5);

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({
        type: 'interest',
        granularity: 'BLOCK',
        venueId: VENUE_CUID,
        cityArea: KNOWN_SLUG,
      }),
    );
    const body = await res.json();
    expect(body.data.cellResolved).toBe(true);
    expect(body.data.count).toBe(6);
  });
});

describe('GET /api/heatmap/contributor-count — error path', () => {
  it('500 + captureException when prisma throws, with no stack leaked', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockHeatmap.count.mockRejectedValueOnce(new Error('db exploded at line 42'));

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', cityArea: KNOWN_SLUG }),
    );
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to check anonymity floor' });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/db exploded/);
    expect(serialized).not.toMatch(/stack|at line/i);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      route: '/api/heatmap/contributor-count',
      method: 'GET',
    });
  });

  it('500 when the venue lookup throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockVenue.findUnique.mockRejectedValueOnce(new Error('venue lookup failed'));

    const res = await GET_CONTRIBUTOR_COUNT(
      makeGetReq({ type: 'interest', granularity: 'BLOCK', venueId: VENUE_CUID }),
    );
    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
