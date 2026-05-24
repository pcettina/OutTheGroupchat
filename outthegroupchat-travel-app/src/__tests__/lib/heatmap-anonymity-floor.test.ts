/**
 * R14 N>=3 anonymity floor edge-case tests for aggregateContributions.
 *
 * Complements src/__tests__/lib/heatmap-aggregate.test.ts (which has the
 * basic floor cases) by exercising the boundary conditions:
 *   - exactly N=3 (passes), N=2/1 (fails), N=0 (cell missing entirely)
 *   - mixed-tier per-cell evaluation (some cells pass, some don't, in one pass)
 *   - count fidelity when KNOWN survives but ANONYMOUS is floored
 *   - INTEREST and PRESENCE contribution types both respect floor
 *   - multiple cells, each evaluated independently against the floor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aggregateContributions } from '@/lib/heatmap/aggregate';
import { prisma } from '@/lib/prisma';

type MockFn = ReturnType<typeof vi.fn>;
const mockCrew = prisma.crew as unknown as { findMany: MockFn };
const mockHeatmap = prisma.heatmapContribution as unknown as { findMany: MockFn };
const mockRelSetting = prisma.crewRelationshipSetting as unknown as { findMany: MockFn };
const mockIntent = prisma.intent as unknown as { findMany: MockFn };
const mockCheckIn = prisma.checkIn as unknown as { findMany: MockFn };
const mockVenue = prisma.venue as unknown as { findMany: MockFn };

// Helper to build a contribution row succinctly.
function contrib(
  userId: string,
  cellLat: number,
  cellLng: number,
  identityMode: 'ANONYMOUS' | 'KNOWN',
  type: 'INTEREST' | 'PRESENCE' = 'INTEREST',
) {
  return {
    id: `h-${userId}-${cellLat}-${cellLng}-${identityMode}-${Math.random()}`,
    userId,
    sourceId: `s-${userId}-${Math.random()}`,
    cellLat,
    cellLng,
    cellPrecision: 'BLOCK',
    identityMode,
    socialScope: 'FULL_CREW',
    windowPreset: type === 'INTEREST' ? 'EVENING' : null,
    topicId: type === 'INTEREST' ? 't1' : null,
    type,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCrew.findMany.mockResolvedValueOnce([]);
  mockHeatmap.findMany.mockResolvedValueOnce([]);
  mockRelSetting.findMany.mockResolvedValueOnce([]);
  mockIntent.findMany.mockResolvedValueOnce([]);
  mockCheckIn.findMany.mockResolvedValueOnce([]);
  mockVenue.findMany.mockResolvedValueOnce([]);
});

describe('R14 anonymity floor — boundary conditions', () => {
  it('exactly N=3 anonymous contributors in a cell — passes floor and surfaces', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      contrib('p1', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p2', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p3', 40.728, -73.984, 'ANONYMOUS'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(3);
  });

  it('N=2 anonymous contributors — below floor, cell drops out entirely', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      contrib('p1', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p2', 40.728, -73.984, 'ANONYMOUS'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(0);
  });

  it('N=1 anonymous contributor — below floor, cell drops out entirely', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      contrib('p1', 40.728, -73.984, 'ANONYMOUS'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(0);
  });

  it('N=0 (no contributions at all) — no cell appears in output', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }]);
    mockHeatmap.findMany.mockResolvedValueOnce([]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toEqual([]);
    expect(result.venueMarkers).toEqual([]);
  });

  it('mixed cells — only those passing the floor surface; sub-floor cells are silently dropped', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
      { userAId: 'v1', userBId: 'p4' },
      { userAId: 'v1', userBId: 'p5' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      // Cell A: 3 anonymous → passes
      contrib('p1', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p2', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p3', 40.728, -73.984, 'ANONYMOUS'),
      // Cell B: 2 anonymous → fails
      contrib('p4', 40.700, -73.900, 'ANONYMOUS'),
      contrib('p5', 40.700, -73.900, 'ANONYMOUS'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]).toEqual({ lat: 40.728, lng: -73.984, count: 3 });
  });

  it('count is accurate when KNOWN survives but ANONYMOUS bucket is floored (sub-floor anonymous still counted as 0, not leaked)', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
    ]);
    // Same cell: 2 KNOWN + 2 ANONYMOUS. ANONYMOUS (2) below floor → contributes 0.
    // Total = 2 KNOWN + 0 anon = 2.
    mockHeatmap.findMany.mockResolvedValueOnce([
      contrib('p1', 40.728, -73.984, 'KNOWN'),
      contrib('p2', 40.728, -73.984, 'KNOWN'),
      contrib('p3', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p3', 40.728, -73.984, 'ANONYMOUS'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(1);
    // Anonymous bucket below floor → suppressed; only the 2 KNOWN show.
    expect(result.cells[0].count).toBe(2);
  });

  it('INTEREST tier respects the floor independently (3 anon INTEREST contributions pass)', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      contrib('p1', 40.728, -73.984, 'ANONYMOUS', 'INTEREST'),
      contrib('p2', 40.728, -73.984, 'ANONYMOUS', 'INTEREST'),
      contrib('p3', 40.728, -73.984, 'ANONYMOUS', 'INTEREST'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].count).toBe(3);
    // Verify the contribution type filter was applied at the query level
    expect(mockHeatmap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'INTEREST' }),
      }),
    );
  });

  it('PRESENCE tier respects the floor independently (2 anon PRESENCE contributions fail)', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      contrib('p1', 40.728, -73.984, 'ANONYMOUS', 'PRESENCE'),
      contrib('p2', 40.728, -73.984, 'ANONYMOUS', 'PRESENCE'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'presence',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(0);
    // Verify the contribution type filter was applied at the query level
    expect(mockHeatmap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'PRESENCE' }),
      }),
    );
  });

  it('multiple cells in same neighborhood with different N values — each evaluated independently', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
      { userAId: 'v1', userBId: 'p4' },
      { userAId: 'v1', userBId: 'p5' },
      { userAId: 'v1', userBId: 'p6' },
      { userAId: 'v1', userBId: 'p7' },
      { userAId: 'v1', userBId: 'p8' },
      { userAId: 'v1', userBId: 'p9' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      // Cell A: N=4 anonymous → passes (count=4)
      contrib('p1', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p2', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p3', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p4', 40.728, -73.984, 'ANONYMOUS'),
      // Cell B: N=3 anonymous → passes (count=3, exactly at floor)
      contrib('p5', 40.730, -73.985, 'ANONYMOUS'),
      contrib('p6', 40.730, -73.985, 'ANONYMOUS'),
      contrib('p7', 40.730, -73.985, 'ANONYMOUS'),
      // Cell C: N=2 anonymous → fails (dropped)
      contrib('p8', 40.732, -73.986, 'ANONYMOUS'),
      contrib('p9', 40.732, -73.986, 'ANONYMOUS'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    // 2 cells (A and B) survive; C is dropped. Sorted by count desc.
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0]).toEqual({ lat: 40.728, lng: -73.984, count: 4 });
    expect(result.cells[1]).toEqual({ lat: 40.730, lng: -73.985, count: 3 });

    // Verify cell C (40.732, -73.986) does NOT appear
    const cellLats = result.cells.map((c) => c.lat);
    expect(cellLats).not.toContain(40.732);
  });

  it('mixed KNOWN+ANONYMOUS where ANONYMOUS exactly hits N=3 — both surface (KNOWN + 3 anon = total)', async () => {
    mockCrew.findMany.mockReset();
    mockHeatmap.findMany.mockReset();
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    mockCrew.findMany.mockResolvedValueOnce([
      { userAId: 'v1', userBId: 'p1' },
      { userAId: 'v1', userBId: 'p2' },
      { userAId: 'v1', userBId: 'p3' },
      { userAId: 'v1', userBId: 'p4' },
    ]);
    mockHeatmap.findMany.mockResolvedValueOnce([
      contrib('p1', 40.728, -73.984, 'KNOWN'),
      contrib('p2', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p3', 40.728, -73.984, 'ANONYMOUS'),
      contrib('p4', 40.728, -73.984, 'ANONYMOUS'),
    ]);

    const result = await aggregateContributions({
      viewerId: 'v1',
      type: 'interest',
      tier: 'crew',
    });

    expect(result.cells).toHaveLength(1);
    // 1 KNOWN + 3 ANONYMOUS (at floor) = 4
    expect(result.cells[0].count).toBe(4);
  });
});
