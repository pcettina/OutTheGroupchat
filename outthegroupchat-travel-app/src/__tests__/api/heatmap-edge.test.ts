/**
 * Edge-case unit tests for GET /api/heatmap (V1 Phase 4 — Journey D).
 *
 * The route (src/app/api/heatmap/route.ts) delegates aggregation to
 * `aggregateContributions` (src/lib/heatmap/aggregate.ts). These tests exercise
 * the route's auth / rate-limit / Zod-validation guards AND the real
 * aggregation behavior end-to-end against the house Prisma mock established in
 * src/__tests__/setup.ts (heatmapContribution, crew, crewRelationshipSetting,
 * intent, checkIn, venue, user, subCrewMember are all stubbed there).
 *
 * Focus is edge cases NOT covered elsewhere:
 *   - 401 unauthenticated, 429 rate-limited
 *   - malformed query params -> 400 (bad enum, non-numeric/out-of-range
 *     mutualThreshold, unknown cityArea)
 *   - empty contribution set -> empty cells
 *   - R14 k-anonymity floor: ANONYMOUS cells with N<3 are suppressed while
 *     KNOWN cells surface regardless
 *   - Crew HIDDEN relationship setting drops a contributor
 *   - FoF tier scoping: a user reachable through NO mutual-Crew anchor is
 *     excluded (their contributions never aggregate)
 *   - 500 + captureException on a Prisma throw
 *
 * This file re-mocks @/lib/rate-limit to get a controllable reference and
 * re-arms it in beforeEach (per the checkins.test.ts house pattern). It does
 * NOT modify setup.ts or production code.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  HeatmapContributionType,
  HeatmapGranularityMode,
  HeatmapIdentityMode,
  HeatmapSocialScope,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — declared before any imports that
// transitively pull the module.
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

// Static imports — never dynamic-import in beforeEach.
import { GET } from '@/app/api/heatmap/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { __resetFofCacheForTests } from '@/lib/heatmap/fof-graph';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegates
// ---------------------------------------------------------------------------
const mockPrismaCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaHeatmap = prisma.heatmapContribution as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaCrewSetting = prisma.crewRelationshipSetting as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaIntent = prisma.intent as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaCheckIn = prisma.checkIn as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaVenue = prisma.venue as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaUser = prisma.user as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const mockPrismaSubCrewMember = prisma.subCrewMember as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockCaptureException = vi.mocked(captureException);
const mockGetServerSession = vi.mocked(getServerSession);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/heatmap';

const sessionFor = (id = 'viewer-1', name = 'Viewer') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeGetReq = (queryParams: Record<string, string> = {}) => {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
};

/** Minimal HeatmapContribution row as selected by fetchContributions(). */
const contributionRow = (overrides: Partial<{
  id: string;
  userId: string;
  type: HeatmapContributionType;
  sourceId: string;
  cellLat: number;
  cellLng: number;
  cellPrecision: HeatmapGranularityMode;
  identityMode: HeatmapIdentityMode;
  socialScope: HeatmapSocialScope;
  windowPreset: null;
  topicId: string | null;
}> = {}) => ({
  id: 'contrib-1',
  userId: 'crew-1',
  type: HeatmapContributionType.INTEREST,
  sourceId: 'intent-1',
  cellLat: 40.72,
  cellLng: -73.99,
  cellPrecision: HeatmapGranularityMode.BLOCK,
  identityMode: HeatmapIdentityMode.KNOWN,
  socialScope: HeatmapSocialScope.FULL_CREW,
  windowPreset: null,
  topicId: null,
  ...overrides,
});

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// A CUID-shaped id (route Zod requires topicId/subCrewId to be cuid()).
const CUID = 'claaaaaaaaaaaaaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate-limit pass-through after resetAllMocks wipes mockResolvedValue.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
  // FoF set is cached in-process for 60s keyed by viewer:threshold; clear it so
  // per-test crew mocks are actually exercised.
  __resetFofCacheForTests();
});

// ===========================================================================
// Auth & rate limiting
// ===========================================================================
describe('GET /api/heatmap — auth & rate limiting', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
    // Auth guard runs before rate limiting / aggregation.
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when session exists but has no user id', async () => {
    mockGetServerSession.mockResolvedValueOnce({ expires: '2099-01-01' } as never);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 429 when rate limited (before any query / validation)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
    // Rate limiter fires before Zod parsing / aggregation.
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Query param validation (Zod) -> 400
// ===========================================================================
describe('GET /api/heatmap — malformed query params', () => {
  it('returns 400 when required "type" is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(makeGetReq({ tier: 'crew' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when required "tier" is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(makeGetReq({ type: 'interest' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for an invalid "type" enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(makeGetReq({ type: 'bogus', tier: 'crew' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for an invalid "tier" enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(makeGetReq({ type: 'interest', tier: 'public' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for a non-numeric mutualThreshold', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(
      makeGetReq({ type: 'interest', tier: 'fof', mutualThreshold: 'lots' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for an out-of-range mutualThreshold (> 10, R5 cap)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(
      makeGetReq({ type: 'interest', tier: 'fof', mutualThreshold: '11' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for a mutualThreshold below the floor (< 1)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(
      makeGetReq({ type: 'interest', tier: 'fof', mutualThreshold: '0' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for a non-cuid topicId', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(
      makeGetReq({ type: 'interest', tier: 'crew', topicId: 'not-a-cuid' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for an unknown cityArea slug (passes Zod, fails neighborhood check)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await GET(
      makeGetReq({ type: 'interest', tier: 'crew', cityArea: 'atlantis' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unknown cityArea');
    // This is a distinct guard from the Zod failure above.
    expect(body.details).toBeUndefined();
  });
});

// ===========================================================================
// Empty / sparse aggregation results
// ===========================================================================
describe('GET /api/heatmap — empty aggregation', () => {
  it('returns 200 with empty cells/venueMarkers when the viewer has no Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    // getCrewPartnerIds -> []
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('crew');
    expect(body.data.type).toBe('interest');
    expect(body.data.cells).toEqual([]);
    expect(body.data.venueMarkers).toEqual([]);
    expect(typeof body.data.generatedAt).toBe('string');
    // Short-circuits before fetching contributions.
    expect(mockPrismaHeatmap.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with empty cells when crew exists but no live contributions', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'crew-1' },
    ]);
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toEqual([]);
    expect(body.data.venueMarkers).toEqual([]);
  });
});

// ===========================================================================
// R14 k-anonymity floor (N >= 3) — applied to the ANONYMOUS bucket only
// ===========================================================================
describe('GET /api/heatmap — R14 anonymous N>=3 floor', () => {
  it('suppresses an ANONYMOUS cell with only 2 contributors (below floor)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'crew-1' },
      { userAId: 'viewer-1', userBId: 'crew-2' },
    ]);
    // Two ANONYMOUS contributions in the same cell -> below the N>=3 floor.
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([
      contributionRow({
        id: 'c1',
        userId: 'crew-1',
        identityMode: HeatmapIdentityMode.ANONYMOUS,
        cellLat: 40.7,
        cellLng: -73.9,
        sourceId: 'src-1',
      }),
      contributionRow({
        id: 'c2',
        userId: 'crew-2',
        identityMode: HeatmapIdentityMode.ANONYMOUS,
        cellLat: 40.7,
        cellLng: -73.9,
        sourceId: 'src-2',
      }),
    ]);
    // No crew relationship HIDDEN settings.
    mockPrismaCrewSetting.findMany.mockResolvedValueOnce([]);
    // No venue-bearing intents.
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Cell is suppressed entirely (anon count < 3, no known contributors).
    expect(body.data.cells).toEqual([]);
  });

  it('surfaces an ANONYMOUS cell once it reaches exactly 3 contributors', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'crew-1' },
      { userAId: 'viewer-1', userBId: 'crew-2' },
      { userAId: 'viewer-1', userBId: 'crew-3' },
    ]);
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([
      contributionRow({ id: 'c1', userId: 'crew-1', identityMode: HeatmapIdentityMode.ANONYMOUS, cellLat: 40.7, cellLng: -73.9, sourceId: 's1' }),
      contributionRow({ id: 'c2', userId: 'crew-2', identityMode: HeatmapIdentityMode.ANONYMOUS, cellLat: 40.7, cellLng: -73.9, sourceId: 's2' }),
      contributionRow({ id: 'c3', userId: 'crew-3', identityMode: HeatmapIdentityMode.ANONYMOUS, cellLat: 40.7, cellLng: -73.9, sourceId: 's3' }),
    ]);
    mockPrismaCrewSetting.findMany.mockResolvedValueOnce([]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toHaveLength(1);
    expect(body.data.cells[0].count).toBe(3);
    expect(body.data.cells[0].lat).toBe(40.7);
  });

  it('surfaces a KNOWN single-contributor cell regardless of the anonymous floor', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'crew-1' },
    ]);
    // One KNOWN contribution — must surface even though N=1.
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([
      contributionRow({
        id: 'k1',
        userId: 'crew-1',
        identityMode: HeatmapIdentityMode.KNOWN,
        cellLat: 41.0,
        cellLng: -74.0,
        sourceId: 'k-src-1',
      }),
    ]);
    mockPrismaCrewSetting.findMany.mockResolvedValueOnce([]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toHaveLength(1);
    expect(body.data.cells[0].count).toBe(1);
  });

  it('counts KNOWN contributions but drops sub-floor ANONYMOUS ones in the same cell', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'crew-1' },
      { userAId: 'viewer-1', userBId: 'crew-2' },
    ]);
    // 1 KNOWN + 2 ANONYMOUS in one cell. Anon (2) is below floor -> dropped.
    // Result count should be just the KNOWN one (1).
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([
      contributionRow({ id: 'k', userId: 'crew-1', identityMode: HeatmapIdentityMode.KNOWN, cellLat: 40.5, cellLng: -73.5, sourceId: 'sk' }),
      contributionRow({ id: 'a1', userId: 'crew-2', identityMode: HeatmapIdentityMode.ANONYMOUS, cellLat: 40.5, cellLng: -73.5, sourceId: 'sa1' }),
      contributionRow({ id: 'a2', userId: 'crew-2', identityMode: HeatmapIdentityMode.ANONYMOUS, cellLat: 40.5, cellLng: -73.5, sourceId: 'sa2' }),
    ]);
    mockPrismaCrewSetting.findMany.mockResolvedValueOnce([]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toHaveLength(1);
    expect(body.data.cells[0].count).toBe(1);
  });
});

// ===========================================================================
// Crew HIDDEN relationship setting
// ===========================================================================
describe('GET /api/heatmap — Crew HIDDEN relationship setting', () => {
  it('drops contributions from a Crew partner the viewer has set to HIDDEN', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'crew-hidden' },
      { userAId: 'viewer-1', userBId: 'crew-visible' },
    ]);
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([
      contributionRow({ id: 'h', userId: 'crew-hidden', identityMode: HeatmapIdentityMode.KNOWN, cellLat: 40.1, cellLng: -73.1, sourceId: 'src-h' }),
      contributionRow({ id: 'v', userId: 'crew-visible', identityMode: HeatmapIdentityMode.KNOWN, cellLat: 40.2, cellLng: -73.2, sourceId: 'src-v' }),
    ]);
    // Viewer hid crew-hidden via HIDDEN granularityMode.
    mockPrismaCrewSetting.findMany.mockResolvedValueOnce([
      { targetId: 'crew-hidden', granularityMode: HeatmapGranularityMode.HIDDEN },
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Only the visible partner's cell remains.
    expect(body.data.cells).toHaveLength(1);
    expect(body.data.cells[0].lat).toBe(40.2);
    expect(body.data.cells[0].count).toBe(1);
  });
});

// ===========================================================================
// FoF tier scoping
// ===========================================================================
describe('GET /api/heatmap — FoF tier scoping', () => {
  it('returns empty when the viewer has no Crew (no FoF reachable)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    // getFofSet: viewer crew lookup returns no edges.
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'fof' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tier).toBe('fof');
    expect(body.data.cells).toEqual([]);
    expect(body.data.venueMarkers).toEqual([]);
  });

  it('excludes a stranger (no mutual-Crew anchor) — only true FoF users aggregate', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('viewer-1'));

    // getFofSet call #1: viewer's accepted Crew = [anchor-1].
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'anchor-1' },
    ]);
    // getFofSet call #2: edges touching the viewer's crew (anchor-1).
    //   anchor-1 <-> fof-1   => fof-1 is a real FoF (anchored by anchor-1)
    //   stranger <-> nobody-in-crew is simply absent, so it never appears.
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'anchor-1', userBId: 'fof-1' },
    ]);

    // aggregateFoF then pre-fetches anchor users, viewer<->anchor edges, subcrew.
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: 'anchor-1', name: 'Anchor One' },
    ]);
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'anchor-1', createdAt: new Date('2026-01-01') },
    ]);
    mockPrismaSubCrewMember.findMany.mockResolvedValueOnce([]);

    // Contributions: fof-1 has a FULL_CREW contribution; "stranger" also has one
    // but stranger is NOT in the FoF userIds, so the route never queries them.
    // We assert the heatmap query was scoped to fof-1 only.
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([
      contributionRow({
        id: 'f1',
        userId: 'fof-1',
        identityMode: HeatmapIdentityMode.CREW_ANCHORED,
        socialScope: HeatmapSocialScope.FULL_CREW,
        cellLat: 40.73,
        cellLng: -73.99,
        sourceId: 'fsrc-1',
      }),
    ]);
    mockPrismaIntent.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq({ type: 'interest', tier: 'fof' }));

    expect(res.status).toBe(200);
    const body = await res.json();

    // The contribution fetch must be scoped to fof-1 only (stranger excluded).
    const fetchWhere = mockPrismaHeatmap.findMany.mock.calls[0]?.[0]?.where;
    expect(fetchWhere?.userId?.in).toEqual(['fof-1']);
    expect(fetchWhere?.userId?.in).not.toContain('stranger');
    // FoF queries are scoped to FULL_CREW only (never a FoF user's SUBGROUP_ONLY).
    expect(fetchWhere?.socialScope?.in).toEqual([HeatmapSocialScope.FULL_CREW]);
  });

  it('returns empty cells when no FoF user clears the mutualThreshold', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('viewer-1'));

    // Viewer crew = [anchor-1].
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'anchor-1' },
    ]);
    // fof-1 is anchored by a single mutual (anchor-1) => mutualCount = 1.
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'anchor-1', userBId: 'fof-1' },
    ]);

    // Require 2 mutual anchors — fof-1 (count 1) is filtered out -> empty FoF set.
    const res = await GET(
      makeGetReq({ type: 'interest', tier: 'fof', mutualThreshold: '2' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cells).toEqual([]);
    // Empty FoF set short-circuits before fetching contributions.
    expect(mockPrismaHeatmap.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Presence tier + venue markers (CheckIn source path)
// ===========================================================================
describe('GET /api/heatmap — presence type', () => {
  it('derives venue markers from CheckIn sources for presence contributions', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'viewer-1', userBId: 'crew-1' },
    ]);
    mockPrismaHeatmap.findMany.mockResolvedValueOnce([
      contributionRow({
        id: 'p1',
        userId: 'crew-1',
        type: HeatmapContributionType.PRESENCE,
        identityMode: HeatmapIdentityMode.KNOWN,
        cellLat: 40.9,
        cellLng: -73.8,
        sourceId: 'checkin-1',
      }),
    ]);
    mockPrismaCrewSetting.findMany.mockResolvedValueOnce([]);
    // PRESENCE path queries checkIn (not intent) for venue derivation.
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([
      { id: 'checkin-1', venueId: 'venue-1' },
    ]);
    mockPrismaVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-1', name: 'Rooftop Bar', latitude: 40.9, longitude: -73.8 },
    ]);

    const res = await GET(makeGetReq({ type: 'presence', tier: 'crew' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.type).toBe('presence');
    // checkIn was consulted, not intent.
    expect(mockPrismaCheckIn.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrismaIntent.findMany).not.toHaveBeenCalled();
    expect(body.data.venueMarkers).toHaveLength(1);
    expect(body.data.venueMarkers[0].venueId).toBe('venue-1');
    expect(body.data.venueMarkers[0].count).toBe(1);
  });
});

// ===========================================================================
// 500 path — Prisma throw -> captureException
// ===========================================================================
describe('GET /api/heatmap — failure path', () => {
  it('returns 500 and calls captureException when aggregation throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    // First prisma call inside aggregation throws.
    mockPrismaCrew.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeGetReq({ type: 'interest', tier: 'crew' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to load heatmap');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
