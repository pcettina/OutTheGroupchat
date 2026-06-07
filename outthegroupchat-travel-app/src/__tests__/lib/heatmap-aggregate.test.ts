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

  it('type=presence maps to PRESENCE contribution type filter', async () => {
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

  it('omits topicId/windowPreset filters from where clause when not provided', async () => {
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

  it('cells are sorted descending by count', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      // Cell A: 1 contribution
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.700, cellLng: -73.900, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      // Cell B: 3 contributions
      { id: 'h2', userId: 'p1', sourceId: 's2', cellLat: 40.800, cellLng: -73.800, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h3', userId: 'p1', sourceId: 's3', cellLat: 40.800, cellLng: -73.800, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h4', userId: 'p1', sourceId: 's4', cellLat: 40.800, cellLng: -73.800, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      // Cell C: 2 contributions
      { id: 'h5', userId: 'p1', sourceId: 's5', cellLat: 40.750, cellLng: -73.850, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h6', userId: 'p1', sourceId: 's6', cellLat: 40.750, cellLng: -73.850, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    expect(result.cells.map((c) => c.count)).toEqual([3, 2, 1]);
  });

  it('mixed KNOWN + ANONYMOUS in same cell sums both when anonymous bucket >= 3', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
      { userAId: 'v1', userBId: 'p4' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h3', userId: 'p3', sourceId: 's3', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h4', userId: 'p4', sourceId: 's4', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    // 1 KNOWN + 3 ANONYMOUS (>= floor) = 4
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(4);
  });

  it('venue markers skip venues with null lat/lng', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 'i1', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h2', userId: 'p1', sourceId: 'i2', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);
    mockIntent.findMany.mockResolvedValueOnce([
      { id: 'i1', venueId: 'venue-good' },
      { id: 'i2', venueId: 'venue-bad' },
    ]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-good', name: 'Good', latitude: 40.7, longitude: -73.9 },
      { id: 'venue-bad', name: 'Bad', latitude: null, longitude: null },
    ]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    expect(result.venueMarkers).toHaveLength(1);
    expect(result.venueMarkers[0].venueId).toBe('venue-good');
  });

  it('venue markers are sorted descending by count', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 'i1', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h2', userId: 'p1', sourceId: 'i2', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h3', userId: 'p1', sourceId: 'i3', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);
    mockIntent.findMany.mockResolvedValueOnce([
      { id: 'i1', venueId: 'venue-A' },
      { id: 'i2', venueId: 'venue-B' },
      { id: 'i3', venueId: 'venue-A' },
    ]);
    mockVenue.findMany.mockResolvedValueOnce([
      { id: 'venue-A', name: 'A', latitude: 40.7, longitude: -73.9 },
      { id: 'venue-B', name: 'B', latitude: 40.71, longitude: -73.91 },
    ]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    expect(result.venueMarkers.map((m) => m.count)).toEqual([2, 1]);
    expect(result.venueMarkers[0].venueId).toBe('venue-A');
  });

  it('passes cityArea filter through to Intent venue lookup for INTEREST type', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 'i1', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
      cityArea: 'brooklyn',
    });

    expect(mockIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cityArea: 'brooklyn' }),
      }),
    );
  });

  it('returns empty venueMarkers when no source rows have venueId', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 'i1', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);
    // Intent rows fetched but none have a venueId (filtered by venueId: { not: null } at the query layer; mock returns empty)
    mockIntent.findMany.mockResolvedValueOnce([]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    expect(result.cells).toHaveLength(1);
    expect(result.venueMarkers).toEqual([]);
    // Venue table should not be queried when sourceVenueMap is empty
    expect(mockVenue.findMany).not.toHaveBeenCalled();
  });

  it('multiple HIDDEN settings drop all hidden contributors', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h3', userId: 'p3', sourceId: 's3', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([
      { targetId: 'p1', granularityMode: 'HIDDEN' },
      { targetId: 'p2', granularityMode: 'HIDDEN' },
      // p3 has no setting → still visible (default)
    ]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(1);
  });

  it('non-HIDDEN granularity settings (e.g. BLOCK, DYNAMIC_CELL) do NOT drop the contributor', async () => {
    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'p1', sourceId: 's1', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
      { id: 'h2', userId: 'p2', sourceId: 's2', cellLat: 40.7, cellLng: -73.9, cellPrecision: 'BLOCK', identityMode: 'KNOWN', socialScope: 'FULL_CREW', windowPreset: null, topicId: null, type: 'INTEREST' },
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([
      { targetId: 'p1', granularityMode: 'BLOCK' },
      { targetId: 'p2', granularityMode: 'DYNAMIC_CELL' },
    ]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(2);
  });

  it('returns empty when contributions query yields no rows (no venue queries fire)', async () => {
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    const result = await aggregateContributions({ viewerId: 'v1', type: 'interest', tier: 'crew' });
    expect(result.cells).toEqual([]);
    expect(result.venueMarkers).toEqual([]);
    expect(mockIntent.findMany).not.toHaveBeenCalled();
    expect(mockCheckIn.findMany).not.toHaveBeenCalled();
    expect(mockVenue.findMany).not.toHaveBeenCalled();
  });
});
