/**
 * Unit tests for GET /api/recommendations.
 *
 * Pipeline: Topic → Places categories → Google Places search → score by
 * (rating × hotnessBoost) → sort → cap. Falls back to DB venues when Places
 * returns nothing.
 *
 * The hotness boost is now the real V1 Phase 4 signal (see lib/hotness/score):
 * recent INTEREST/PRESENCE `HeatmapContribution` density in the venue's BLOCK
 * cell lifts that venue's score, and can reorder a lower-rated-but-hot venue
 * above a higher-rated-but-cold one. `weightByCrew` activates a crew lookup.
 *
 * Cache hygiene: the route caches recent contributions per `${topicId}::${cityArea}`
 * for 5 minutes at module scope. To prevent one test's contributions from leaking
 * into another, every test uses a DISTINCT topicId (see `freshTopicId`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { HeatmapContributionType, HeatmapGranularityMode } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { anonymizeCell } from '@/lib/subcrew/cell-anonymize';

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
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockHeatmapContribution = prisma.heatmapContribution as unknown as {
  findMany: MockFn;
};
const mockSearchPlaces = vi.mocked(searchPlaces);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

const TOPIC_ID = 'cliab1234567890drinks001';

/**
 * A unique-per-call topicId (valid cuid shape) so the route's module-level
 * `${topicId}::${cityArea}` contribution cache cannot leak between test cases.
 */
let topicCounter = 0;
const freshTopicId = () => {
  topicCounter += 1;
  // cuid shape: starts with 'c', lowercase alphanumerics, length 25.
  const suffix = String(topicCounter).padStart(6, '0');
  return `cltopic000000000000${suffix}`.slice(0, 25);
};

const makeReq = (params: Record<string, string> = {}, topicId = TOPIC_ID) => {
  const url = new URL('http://localhost/api/recommendations');
  url.searchParams.set('topicId', topicId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
};

/**
 * Build a HeatmapContribution row (the slice the route selects) whose cellLat/
 * cellLng are snapped to the SAME BLOCK cell as `(lat, lng)` — mirroring the
 * impl's `anonymizeCell(...BLOCK)` quantization so the contribution lands in the
 * venue's cell and counts toward its boost.
 */
const contributionInCellOf = (
  lat: number,
  lng: number,
  overrides: Partial<{
    userId: string;
    type: HeatmapContributionType;
    createdAt: Date;
  }> = {},
) => {
  const cell = anonymizeCell(lat, lng, HeatmapGranularityMode.BLOCK)!;
  return {
    userId: overrides.userId ?? 'contributor-1',
    type: overrides.type ?? HeatmapContributionType.INTEREST,
    cellLat: cell.cellLat,
    cellLng: cell.cellLng,
    createdAt: overrides.createdAt ?? new Date(),
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  // Default: no recent contributions unless a test arms its own set. Prisma's
  // findMany always resolves an array; the route relies on that contract.
  mockHeatmapContribution.findMany.mockResolvedValue([]);
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
    const topicId = freshTopicId();
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

    const res = await GET(makeReq({ cityArea: 'lower-east-side' }, topicId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(2);
    expect(body.data.recommendations[0].name).toBe('Lower Bar');
    expect(body.data.recommendations[0].score).toBeGreaterThan(body.data.recommendations[1].score);
    expect(body.data.recommendations[0].source).toBe('google_places');
    // With no contributions, every venue's boost is the neutral 1.0.
    expect(body.data.recommendations[0].hotnessBoost).toBe(1.0);
    expect(body.data.categoriesUsed).toEqual(['bar']);

    // Query should expand cityArea slug to display name
    const query = mockSearchPlaces.mock.calls[0][0].query as string;
    expect(query).toBe('bar in Lower East Side');
  });

  it('200 falls back to DB venues when Google Places returns nothing', async () => {
    const topicId = freshTopicId();
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

    const res = await GET(makeReq({ cityArea: 'lower-east-side' }, topicId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(1);
    expect(body.data.recommendations[0].source).toBe('db');
    expect(body.data.recommendations[0].name).toBe('DB Bar');
  });

  it('200 caps results to limit', async () => {
    const topicId = freshTopicId();
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

    const res = await GET(makeReq({ limit: '3' }, topicId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toHaveLength(3);
  });

  it('500 when Topic lookup throws unexpectedly', async () => {
    const topicId = freshTopicId();
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeReq({}, topicId));
    expect(res.status).toBe(500);
  });

  it('200 returns empty array when topic has no categories AND Places returns nothing AND DB has no venues', async () => {
    const topicId = freshTopicId();
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: [] });
    mockSearchPlaces.mockResolvedValueOnce([]);
    mockVenue.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq({}, topicId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // V1 Phase 4 — hotness boost behavior
  // -------------------------------------------------------------------------

  it('200 hotness boost reorders a lower-rated-but-hot venue above a higher-rated-but-cold one', async () => {
    const topicId = freshTopicId();
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });

    // Two venues in DIFFERENT BLOCK cells (lat differs in the 3rd decimal).
    const coldVenue = { lat: 40.7, lng: -73.99 }; // higher base rating, cold cell
    const hotVenue = { lat: 40.8, lng: -73.5 }; // lower base rating, hot cell

    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp-cold',
        name: 'Cold High-Rated Bar',
        formatted_address: '1 Cold St, NYC',
        geometry: { location: { lat: coldVenue.lat, lng: coldVenue.lng } },
        rating: 4.8, // clearly higher base
        types: ['bar'],
      },
      {
        place_id: 'gp-hot',
        name: 'Hot Low-Rated Bar',
        formatted_address: '2 Hot St, NYC',
        geometry: { location: { lat: hotVenue.lat, lng: hotVenue.lng } },
        rating: 3.5, // clearly lower base
        types: ['bar'],
      },
    ]);

    // Many fresh INTEREST/PRESENCE contributions in the HOT venue's cell, none
    // in the cold venue's cell. Density is high enough that the boost (capped at
    // 2.5) lifts 3.5 above 4.8.
    const now = new Date();
    const hotContributions = Array.from({ length: 20 }, (_, i) =>
      contributionInCellOf(hotVenue.lat, hotVenue.lng, {
        userId: `u${i}`,
        type: i % 2 === 0 ? HeatmapContributionType.INTEREST : HeatmapContributionType.PRESENCE,
        createdAt: now, // age 0 → full time-decay weight
      }),
    );
    mockHeatmapContribution.findMany.mockResolvedValueOnce(hotContributions);

    const res = await GET(makeReq({ cityArea: 'lower-east-side' }, topicId));
    expect(res.status).toBe(200);
    const body = await res.json();
    const recs = body.data.recommendations;
    expect(recs).toHaveLength(2);

    // The hot, lower-rated venue must now rank FIRST — boost overcame the rating gap.
    expect(recs[0].name).toBe('Hot Low-Rated Bar');
    expect(recs[1].name).toBe('Cold High-Rated Bar');

    // And the reordering is driven by boost, not base rating.
    const hot = recs.find((r: { name: string }) => r.name === 'Hot Low-Rated Bar');
    const cold = recs.find((r: { name: string }) => r.name === 'Cold High-Rated Bar');
    expect(hot.hotnessBoost).toBeGreaterThan(1.0);
    expect(cold.hotnessBoost).toBe(1.0);
    expect(hot.score).toBeGreaterThan(cold.score);
    // Sanity: without the boost the cold venue would win (4.8 > 3.5).
    expect(cold.rating).toBeGreaterThan(hot.rating);
  });

  it('200 hotnessBoost varies — >1.0 for a hot venue, exactly 1.0 when no contributions exist', async () => {
    // Case A: contributions present → at least one venue boosted above 1.0.
    const topicA = freshTopicId();
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });

    const hotVenue = { lat: 40.75, lng: -73.97 };
    const coldVenue = { lat: 40.6, lng: -73.6 };
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp-a-hot',
        name: 'Hot Bar',
        formatted_address: '10 Hot St, NYC',
        geometry: { location: { lat: hotVenue.lat, lng: hotVenue.lng } },
        rating: 4.0,
        types: ['bar'],
      },
      {
        place_id: 'gp-a-cold',
        name: 'Cold Bar',
        formatted_address: '11 Cold St, NYC',
        geometry: { location: { lat: coldVenue.lat, lng: coldVenue.lng } },
        rating: 4.0,
        types: ['bar'],
      },
    ]);
    mockHeatmapContribution.findMany.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) =>
        contributionInCellOf(hotVenue.lat, hotVenue.lng, { userId: `h${i}` }),
      ),
    );

    const resA = await GET(makeReq({ cityArea: 'lower-east-side' }, topicA));
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    const boostsA = bodyA.data.recommendations.map((r: { hotnessBoost: number }) => r.hotnessBoost);
    // Not all neutral — the hot venue is boosted.
    expect(boostsA.some((b: number) => b > 1.0)).toBe(true);
    expect(boostsA.every((b: number) => b === 1.0)).toBe(false);

    // Case B: no contributions → every venue's boost is exactly neutral 1.0.
    const topicB = freshTopicId();
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp-b-1',
        name: 'Bar One',
        formatted_address: '20 St, NYC',
        geometry: { location: { lat: 40.75, lng: -73.97 } },
        rating: 4.2,
        types: ['bar'],
      },
      {
        place_id: 'gp-b-2',
        name: 'Bar Two',
        formatted_address: '21 St, NYC',
        geometry: { location: { lat: 40.6, lng: -73.6 } },
        rating: 3.8,
        types: ['bar'],
      },
    ]);
    mockHeatmapContribution.findMany.mockResolvedValueOnce([]);

    const resB = await GET(makeReq({ cityArea: 'lower-east-side' }, topicB));
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    const boostsB = bodyB.data.recommendations.map((r: { hotnessBoost: number }) => r.hotnessBoost);
    expect(boostsB.every((b: number) => b === 1.0)).toBe(true);
  });

  it('200 weightByCrew=true queries crew; absent/false does NOT', async () => {
    // weightByCrew=true → crew.findMany IS called.
    const topicTrue = freshTopicId();
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockCrew.findMany.mockResolvedValueOnce([]); // no crew edges; only the call matters
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp-crew-1',
        name: 'Crew Bar',
        formatted_address: '30 St, NYC',
        geometry: { location: { lat: 40.74, lng: -73.98 } },
        rating: 4.1,
        types: ['bar'],
      },
    ]);

    const resTrue = await GET(makeReq({ weightByCrew: 'true' }, topicTrue));
    expect(resTrue.status).toBe(200);
    expect(mockCrew.findMany).toHaveBeenCalledTimes(1);

    // Reset the call ledger so the next assertion is unambiguous.
    mockCrew.findMany.mockClear();

    // weightByCrew absent (defaults false) → crew.findMany is NOT called.
    const topicFalse = freshTopicId();
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockTopic.findUnique.mockResolvedValueOnce({ placesCategories: ['bar'] });
    mockSearchPlaces.mockResolvedValueOnce([
      {
        place_id: 'gp-crew-2',
        name: 'No-Crew Bar',
        formatted_address: '31 St, NYC',
        geometry: { location: { lat: 40.74, lng: -73.98 } },
        rating: 4.1,
        types: ['bar'],
      },
    ]);

    const resFalse = await GET(makeReq({}, topicFalse));
    expect(resFalse.status).toBe(200);
    expect(mockCrew.findMany).not.toHaveBeenCalled();
  });
});
