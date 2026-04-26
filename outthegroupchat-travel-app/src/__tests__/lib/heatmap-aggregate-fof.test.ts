/**
 * Unit tests for the FoF branch of src/lib/heatmap/aggregate.ts.
 *
 * Verifies end-to-end FoF aggregation:
 *   - empty FoF set short-circuits
 *   - mutualThreshold passes through to fof-graph
 *   - SUBGROUP_ONLY contributions are excluded (FoF only sees FULL_CREW)
 *   - cells carry an `anchorSummary` derived from the FoF user's anchor pick
 *   - subCrewId activates R24 priority 1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aggregateContributions } from '@/lib/heatmap/aggregate';
import { __resetFofCacheForTests } from '@/lib/heatmap/fof-graph';
import { prisma } from '@/lib/prisma';

type MockFn = ReturnType<typeof vi.fn>;
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { findMany: MockFn };
const mockUser = prisma.user as unknown as { findMany: MockFn };
const mockSubCrewMember = prisma.subCrewMember as unknown as { findMany: MockFn };
const mockIntent = prisma.intent as unknown as { findMany: MockFn };
const mockCheckIn = prisma.checkIn as unknown as { findMany: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };

beforeEach(() => {
  vi.resetAllMocks();
  __resetFofCacheForTests();
  mockHeatmap.findMany.mockResolvedValue([]);
  mockUser.findMany.mockResolvedValue([]);
  mockSubCrewMember.findMany.mockResolvedValue([]);
  mockIntent.findMany.mockResolvedValue([]);
  mockCheckIn.findMany.mockResolvedValue([]);
  mockVenue.findMany.mockResolvedValue([]);
});

describe('aggregateContributions — FoF tier', () => {
  it('returns empty when FoF set is empty (viewer has no Crew)', async () => {
    mockCrew.findMany.mockResolvedValueOnce([]); // fof-graph viewer Crew query
    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
    });
    expect(result.cells).toEqual([]);
    expect(result.venueMarkers).toEqual([]);
  });

  it('aggregates contributions from FoF users with anchor attribution', async () => {
    // fof-graph: viewer v1 ↔ p1 (anchor); p1 ↔ fof1
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]) // viewer Crew
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]) // edges from p1
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1', createdAt: new Date('2026-04-20T00:00:00Z') },
      ]); // pre-fetch crewEdges in aggregateFoF
    mockUser.findMany.mockResolvedValueOnce([{ id: 'p1', name: 'Pat' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1',
        userId: 'fof1',
        sourceId: 's1',
        cellLat: 40.728,
        cellLng: -73.984,
        cellPrecision: 'BLOCK',
        identityMode: 'CREW_ANCHORED',
        socialScope: 'FULL_CREW',
        windowPreset: 'EVENING',
        topicId: 't1',
        type: 'INTEREST',
      },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
    });

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]).toEqual({
      lat: 40.728,
      lng: -73.984,
      count: 1,
      anchorSummary: 'via Pat',
    });
  });

  it('FoF query excludes SUBGROUP_ONLY (only FULL_CREW)', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }])
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1', createdAt: new Date('2026-04-20T00:00:00Z') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([{ id: 'p1', name: 'Pat' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

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

  it('mutualThreshold filters FoF users below the threshold', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1' },
        { userAId: 'v1', userBId: 'p2' },
      ])
      .mockResolvedValueOnce([
        // fof1 has 1 mutual (p1 only) — drops at threshold 2
        { userAId: 'p1', userBId: 'fof1' },
        // fof2 has 2 mutual (p1 + p2) — survives threshold 2
        { userAId: 'p1', userBId: 'fof2' },
        { userAId: 'p2', userBId: 'fof2' },
      ])
      // aggregateFoF crewEdges pre-fetch
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1', createdAt: new Date('2026-04-20T00:00:00Z') },
        { userAId: 'v1', userBId: 'p2', createdAt: new Date('2026-04-21T00:00:00Z') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Pat' },
      { id: 'p2', name: 'Sam' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'fof2', sourceId: 's1', cellLat: 40.728, cellLng: -73.984,
        cellPrecision: 'BLOCK', identityMode: 'CREW_ANCHORED', socialScope: 'FULL_CREW',
        windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST',
      },
    ]);

    await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 2,
    });

    // Heatmap query was scoped to fof2 only — fof1 was filtered out by threshold
    expect(mockHeatmap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['fof2'] },
        }),
      }),
    );
  });

  it('subCrewId pre-fetches SubCrew members and activates priority 1', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1' },
        { userAId: 'v1', userBId: 'p2' },
      ])
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'fof1' },
        { userAId: 'p2', userBId: 'fof1' },
      ])
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1', createdAt: new Date('2026-04-25T00:00:00Z') }, // p1 most recent
        { userAId: 'v1', userBId: 'p2', createdAt: new Date('2026-04-01T00:00:00Z') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Pat' },
      { id: 'p2', name: 'Sam' },
    ]);
    mockSubCrewMember.findMany.mockResolvedValueOnce([
      { userId: 'p2' }, // p2 is in the SubCrew context
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      {
        id: 'h1', userId: 'fof1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984,
        cellPrecision: 'BLOCK', identityMode: 'CREW_ANCHORED', socialScope: 'FULL_CREW',
        windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST',
      },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
      subCrewId: 'sc-1',
    });

    // Priority 1 forced p2 (SubCrew member) over p1 (most recent Crew edge)
    expect(result.cells[0].anchorSummary).toBe('via Sam');
    expect(mockSubCrewMember.findMany).toHaveBeenCalledWith({
      where: { subCrewId: 'sc-1' },
      select: { userId: true },
    });
  });

  it('R14 — anonymous floor still applies on FoF tier', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'fof1' },
        { userAId: 'p1', userBId: 'fof2' },
      ])
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1', createdAt: new Date('2026-04-20T00:00:00Z') },
      ]);
    mockUser.findMany.mockResolvedValueOnce([{ id: 'p1', name: 'Pat' }]);
    // Two anonymous in same cell — below floor of 3
    mockHeatmap.findMany.mockResolvedValueOnce([
      { id: 'h1', userId: 'fof1', sourceId: 's1', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
      { id: 'h2', userId: 'fof2', sourceId: 's2', cellLat: 40.728, cellLng: -73.984, cellPrecision: 'BLOCK', identityMode: 'ANONYMOUS', socialScope: 'FULL_CREW', windowPreset: 'EVENING', topicId: 't1', type: 'INTEREST' },
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'fof',
      mutualThreshold: 1,
    });

    expect(result.cells).toEqual([]);
  });
});
