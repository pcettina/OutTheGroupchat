/**
 * Unit tests for src/lib/heatmap/aggregate.ts.
 *
 * Covers:
 *   - Empty Crew set short-circuits to empty payload.
 *   - Crew filter (only contributions from accepted Crew partners).
 *   - Expiry filter (expired contributions excluded — Prisma where clause asserted).
 *   - HIDDEN granularity per CrewRelationshipSetting drops the contributor.
 *   - R14 N>=3 anonymous floor.
 *   - Mixed KNOWN + ANONYMOUS in same cell only floors the anonymous bucket.
 *   - Venue marker derivation from INTEREST contributions with venueId.
 *   - Topic + windowPreset filter pass-through.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aggregateContributions } from '@/lib/heatmap/aggregate';
import { __resetFofCacheForTests } from '@/lib/heatmap/fof-graph';
import { prisma } from '@/lib/prisma';

type MockFn = ReturnType<typeof vi.fn>;
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { findMany: MockFn };
const mockRelSetting = prisma.crewRelationshipSetting as unknown as { findMany: MockFn };
const mockIntent = prisma.intent as unknown as { findMany: MockFn };
const mockCheckIn = prisma.checkIn as unknown as { findMany: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };
const mockUser = prisma.user as unknown as { findMany: MockFn };
const mockSubCrewMember = prisma.subCrewMember as unknown as { findMany: MockFn };

beforeEach(() => {
  vi.resetAllMocks();
  __resetFofCacheForTests();
  mockCrew.findMany.mockResolvedValue([]);
  mockHeatmap.findMany.mockResolvedValue([]);
  mockRelSetting.findMany.mockResolvedValue([]);
  mockIntent.findMany.mockResolvedValue([]);
  mockCheckIn.findMany.mockResolvedValue([]);
  mockVenue.findMany.mockResolvedValue([]);
  mockUser.findMany.mockResolvedValue([]);
  mockSubCrewMember.findMany.mockResolvedValue([]);
});

// Helper to construct a contribution row with sensible defaults.
function row(overrides: Partial<{
  id: string;
  userId: string;
  sourceId: string;
  cellLat: number;
  cellLng: number;
  cellPrecision: string;
  identityMode: string;
  socialScope: string;
  windowPreset: string | null;
  topicId: string | null;
  type: string;
}> = {}) {
  return {
    id: 'h1',
    userId: 'p1',
    sourceId: 's1',
    cellLat: 40.728,
    cellLng: -73.984,
    cellPrecision: 'BLOCK',
    identityMode: 'KNOWN',
    socialScope: 'FULL_CREW',
    windowPreset: 'EVENING',
    topicId: 't1',
    type: 'INTEREST',
    ...overrides,
  };
}

describe('aggregateContributions', () => {
  it('returns empty when viewer has no Crew', async () => {
    mockCrew.findMany.mockResolvedValueOnce([]);
    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });
    expect(result.cells).toEqual([]);
    expect(result.venueMarkers).toEqual([]);
    expect(mockHeatmap.findMany).not.toHaveBeenCalled();
  });

  it('queries contributions only for accepted Crew partner ids', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'p2', userBId: 'v1' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(mockHeatmap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['p1', 'p2'] },
          type: 'INTEREST',
          expiresAt: { gt: expect.any(Date) },
          socialScope: { in: ['FULL_CREW', 'SUBGROUP_ONLY'] },
        }),
      }),
    );
  });

  it('groups contributions by cell and counts them', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'p1', sourceId: 's2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h3', userId: 'p1', sourceId: 's3', cellLat: 40.708, cellLng: -73.957, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(2);
    // Sorted desc by count
    expect(result.cells[0]).toEqual({ lat: 40.728, lng: -73.984, count: 2 });
    expect(result.cells[1]).toEqual({ lat: 40.708, lng: -73.957, count: 1 });
  });

  it('drops contributions from contributors with HIDDEN granularity setting', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([
      { targetId: 'p2', granularityMode: 'HIDDEN' },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(1);
  });

  it('R14 — drops anonymous contributions when N<3 in their cell', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    // 2 anonymous in cell — below floor of 3 → cell drops out
    expect(result.cells).toHaveLength(0);
  });

  it('R14 — surfaces anonymous when N>=3 in cell', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h3', userId: 'p3', sourceId: 's3', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(3);
  });

  it('R14 — KNOWN contributions surface even when ANONYMOUS bucket is below floor', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    // KNOWN survives, ANONYMOUS (1 < 3) drops → count = 1
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(1);
  });

  it('derives venue markers from INTEREST contributions whose source Intent has venueId', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 'i1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'p1', sourceId: 'i2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);
    mockIntent.findMany.mockResolvedValueOnce([
      { id: 'i1', venueId: 'venue-A' },
      { id: 'i2', venueId: 'venue-A' },
    ]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-A', name: 'Ten Bells', latitude: 40.7281, longitude: -73.9836 },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.venueMarkers).toHaveLength(1);
    expect(result.venueMarkers[0]).toEqual({
      venueId: 'venue-A',
      lat: 40.7281,
      lng: -73.9836,
      count: 2,
      venueName: 'Ten Bells',
    });
  });

  it('derives venue markers from PRESENCE contributions whose source CheckIn has venueId', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 'ci1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'PRESENCE' },
    ]);
    mockCheckIn.findMany.mockResolvedValueOnce([{ id: 'ci1', venueId: 'venue-B' }]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-B', name: 'Sunny’s', latitude: 40.7035, longitude: -74.0151 },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'presence',
      tier: 'crew',
    });

    expect(result.venueMarkers).toHaveLength(1);
    expect(result.venueMarkers[0].venueId).toBe('venue-B');
  });

  it('passes topicId and windowPreset filters through to the contributions query', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
      topicId: 'topic-drinks',
      windowPreset: 'EVENING',
    });

    expect(mockHeatmap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          topicId: 'topic-drinks',
          windowPreset: 'EVENING',
        }),
      }),
    );
  });

  it('omits topicId/windowPreset from where clause when not provided', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    const call = mockHeatmap.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('topicId');
    expect(call.where).not.toHaveProperty('windowPreset');
  });

  it('returns empty when contributions query yields nothing', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toEqual([]);
    expect(result.venueMarkers).toEqual([]);
    // crewRelationshipSetting is not queried when contributions empty
    expect(mockRelSetting.findMany).not.toHaveBeenCalled();
  });

  it('uses PRESENCE contribution type when type=presence', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'presence',
      tier: 'crew',
    });

    expect(mockHeatmap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'PRESENCE' }),
      }),
    );
  });

  it('handles a single KNOWN contribution producing a single cell with count=1', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([row({ id: 'h1', userId: 'p1' })]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toEqual([{ lat: 40.728, lng: -73.984, count: 1 }]);
  });

  it('uses cellPrecision granularity to dedupe cells via 6-decimal key (different lat/lng → separate cells)', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      row({ id: 'h1', sourceId: 's1', cellLat: 40.728001, cellLng: -73.984 }),
      row({ id: 'h2', sourceId: 's2', cellLat: 40.728002, cellLng: -73.984 }),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(2);
    expect(result.cells.every((c) => c.count === 1)).toBe(true);
  });

  it('omits anchorSummary on Crew-tier cells', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([row({ id: 'h1', userId: 'p1' })]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells[0]).not.toHaveProperty('anchorSummary');
  });

  it('drops venue markers when the venue has null lat or lng', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([row({ id: 'h1', userId: 'p1', sourceId: 'i1' })]);
    mockIntent.findMany.mockResolvedValueOnce([{ id: 'i1', venueId: 'venue-X' }]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-X', name: 'Unmapped', latitude: null, longitude: null },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.venueMarkers).toEqual([]);
  });

  it('returns empty venueMarkers when no intents map to a venueId', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([row({ id: 'h1', userId: 'p1', sourceId: 'i1' })]);
    mockIntent.findMany.mockResolvedValueOnce([]); // no venue rows
    mockVenue.findMany.mockResolvedValue([]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.venueMarkers).toEqual([]);
    expect(mockVenue.findMany).not.toHaveBeenCalled();
  });

  it('forwards cityArea to the intent filter', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([row({ id: 'h1', userId: 'p1', sourceId: 'i1' })]);
    mockIntent.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
      cityArea: 'brooklyn-bk09',
    });

    expect(mockIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cityArea: 'brooklyn-bk09' }),
      }),
    );
  });

  it('sorts venue markers by count desc', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      row({ id: 'h1', sourceId: 'i1' }),
      row({ id: 'h2', sourceId: 'i2' }),
      row({ id: 'h3', sourceId: 'i3' }),
    ]);
    mockIntent.findMany.mockResolvedValueOnce([
      { id: 'i1', venueId: 'venue-A' },
      { id: 'i2', venueId: 'venue-A' },
      { id: 'i3', venueId: 'venue-B' },
    ]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-A', name: 'A-bar', latitude: 1, longitude: 2 },
      { id: 'venue-B', name: 'B-bar', latitude: 3, longitude: 4 },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.venueMarkers).toHaveLength(2);
    expect(result.venueMarkers[0].venueId).toBe('venue-A');
    expect(result.venueMarkers[0].count).toBe(2);
    expect(result.venueMarkers[1].venueId).toBe('venue-B');
    expect(result.venueMarkers[1].count).toBe(1);
  });

  it('filters contributions from HIDDEN contributor out of venue marker counts too', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      row({ id: 'h1', userId: 'p1', sourceId: 'i1' }),
      row({ id: 'h2', userId: 'p2', sourceId: 'i2' }),
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([
      { targetId: 'p2', granularityMode: 'HIDDEN' },
    ]);
    mockIntent.findMany.mockResolvedValueOnce([
      { id: 'i1', venueId: 'venue-A' },
      { id: 'i2', venueId: 'venue-A' },
    ]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-A', name: 'Bar', latitude: 1, longitude: 2 },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    // p2 is HIDDEN — only p1's contribution counts
    expect(result.venueMarkers).toHaveLength(1);
    expect(result.venueMarkers[0].count).toBe(1);
  });

  it('queries with socialScope=[FULL_CREW] only when tier=fof (excludes SUBGROUP_ONLY)', async () => {
    // Viewer's direct Crew (used by getFofSet seed query)
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'a1' }]) // viewer Crew
      .mockResolvedValueOnce([
        // FoF edges: a1 - fof1
        { userAId: 'a1', userBId: 'fof1' },
      ])
      // anchor user crewEdges fetch in aggregateFoF
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'a1', createdAt: new Date('2026-01-01') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([{ id: 'a1', name: 'Alex' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]); // no contributions

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
    });

    expect(mockHeatmap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          socialScope: { in: ['FULL_CREW'] },
        }),
      }),
    );
  });

  it('FoF tier — empty FoF set short-circuits to empty payload', async () => {
    mockCrew.findMany.mockResolvedValueOnce([]); // viewer has no Crew → no FoF

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
    });

    expect(result.cells).toEqual([]);
    expect(result.venueMarkers).toEqual([]);
    expect(mockHeatmap.findMany).not.toHaveBeenCalled();
  });

  it('FoF tier — attaches anchorSummary "via Alex" to cells with single anchor', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'a1' }]) // viewer Crew
      .mockResolvedValueOnce([{ userAId: 'a1', userBId: 'fof1' }]) // FoF edges
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'a1', createdAt: new Date('2026-01-01') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([{ id: 'a1', name: 'Alex' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      row({ id: 'h1', userId: 'fof1', sourceId: 's1' }),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
    });

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].anchorSummary).toBe('via Alex');
  });

  it('FoF tier — looks up subCrew members when subCrewId is provided', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'a1' }])
      .mockResolvedValueOnce([{ userAId: 'a1', userBId: 'fof1' }])
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'a1', createdAt: new Date('2026-01-01') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([{ id: 'a1', name: 'Alex' }]);
    mockSubCrewMember.findMany.mockResolvedValueOnce([{ userId: 'a1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
      subCrewId: 'subcrew-1',
    });

    expect(mockSubCrewMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subCrewId: 'subcrew-1' },
      }),
    );
  });

  it('FoF tier — skips subCrewMember query when no subCrewId provided', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'a1' }])
      .mockResolvedValueOnce([{ userAId: 'a1', userBId: 'fof1' }])
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'a1', createdAt: new Date('2026-01-01') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([{ id: 'a1', name: 'Alex' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
    });

    expect(mockSubCrewMember.findMany).not.toHaveBeenCalled();
  });

  it('uses an injected prismaClient when provided instead of the default singleton', async () => {
    const injectedCrew = vi.fn().mockResolvedValue([{ userAId: 'v1', userBId: 'p1' }]);
    const injectedHeatmap = vi.fn().mockResolvedValue([]);
    const injectedRel = vi.fn().mockResolvedValue([]);
    const injected = {
      crew: { findMany: injectedCrew },
      heatmapContribution: { findMany: injectedHeatmap },
      crewRelationshipSetting: { findMany: injectedRel },
      intent: { findMany: vi.fn().mockResolvedValue([]) },
      checkIn: { findMany: vi.fn().mockResolvedValue([]) },
      venue: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      subCrewMember: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
      prismaClient: injected as never,
    });

    expect(injectedCrew).toHaveBeenCalled();
    expect(injectedHeatmap).toHaveBeenCalled();
    // The global mocks must NOT have been called when a client is injected
    expect(mockCrew.findMany).not.toHaveBeenCalled();
    expect(mockHeatmap.findMany).not.toHaveBeenCalled();
  });

  it('uses expiresAt filter with current time (now-gating)', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);
    const before = Date.now();

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });
    const after = Date.now();

    const call = mockHeatmap.findMany.mock.calls[0][0];
    expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
    const ts = (call.where.expiresAt.gt as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
