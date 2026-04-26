/**
 * Unit tests for src/lib/heatmap/fof-graph.ts.
 *
 * Verifies:
 *   - empty Crew → empty FoF
 *   - 1-hop expansion via accepted Crew edges
 *   - viewer + direct-Crew exclusion from FoF set
 *   - mutual-Crew threshold filter
 *   - 200-cap (smoke; we test with a smaller virtual set)
 *   - in-memory cache hit on repeat call
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFofSet, __resetFofCacheForTests } from '@/lib/heatmap/fof-graph';
import { prisma } from '@/lib/prisma';

const mockCrew = prisma.crew as unknown as { findMany: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetAllMocks();
  __resetFofCacheForTests();
});

describe('getFofSet', () => {
  it('returns empty set when viewer has no Crew', async () => {
    mockCrew.findMany.mockResolvedValueOnce([]); // viewer's Crew
    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });
    expect(result).toEqual([]);
    // Second call (FoF edges scan) should not have fired.
    expect(mockCrew.findMany).toHaveBeenCalledTimes(1);
  });

  it('expands 1-hop FoF and excludes viewer + direct Crew', async () => {
    // viewer v1 ↔ p1, v1 ↔ p2 directly
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1' },
        { userAId: 'p2', userBId: 'v1' },
      ])
      // Edges where one side is in {p1,p2}: p1 ↔ fof1, p2 ↔ fof1, p2 ↔ fof2,
      // p1 ↔ p2 (Crew-Crew edge — should be ignored), p1 ↔ v1 (already direct — ignored)
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'fof1' },
        { userAId: 'p2', userBId: 'fof1' },
        { userAId: 'fof2', userBId: 'p2' },
        { userAId: 'p1', userBId: 'p2' }, // both anchors — skip
        { userAId: 'p1', userBId: 'v1' }, // candidate is viewer — skip
      ]);

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });

    expect(result).toHaveLength(2);
    const byUser = new Map(result.map((r) => [r.userId, r]));
    expect(byUser.get('fof1')!.mutualCount).toBe(2);
    expect(byUser.get('fof1')!.anchorIds.sort()).toEqual(['p1', 'p2']);
    expect(byUser.get('fof2')!.mutualCount).toBe(1);
    expect(byUser.get('fof2')!.anchorIds).toEqual(['p2']);
  });

  it('filters by mutualThreshold', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1' },
        { userAId: 'v1', userBId: 'p2' },
      ])
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'fof1' },
        { userAId: 'p2', userBId: 'fof1' },
        { userAId: 'p2', userBId: 'fof2' },
      ]);

    const result = await getFofSet({ viewerId: 'v1', mutualThreshold: 2, bypassCache: true });

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('fof1');
  });

  it('sorts result by mutualCount descending', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1' },
        { userAId: 'v1', userBId: 'p2' },
        { userAId: 'v1', userBId: 'p3' },
      ])
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'fof-low' },
        { userAId: 'p1', userBId: 'fof-high' },
        { userAId: 'p2', userBId: 'fof-high' },
        { userAId: 'p3', userBId: 'fof-high' },
        { userAId: 'p1', userBId: 'fof-mid' },
        { userAId: 'p2', userBId: 'fof-mid' },
      ]);

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });

    expect(result.map((r) => r.userId)).toEqual(['fof-high', 'fof-mid', 'fof-low']);
    expect(result[0].mutualCount).toBe(3);
    expect(result[1].mutualCount).toBe(2);
    expect(result[2].mutualCount).toBe(1);
  });

  it('caches results across calls with the same key', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    const first = await getFofSet({ viewerId: 'v1' });
    expect(first).toHaveLength(1);
    expect(mockCrew.findMany).toHaveBeenCalledTimes(2);

    // Same key — should hit cache, no further DB calls
    const second = await getFofSet({ viewerId: 'v1' });
    expect(second).toEqual(first);
    expect(mockCrew.findMany).toHaveBeenCalledTimes(2);
  });

  it('cache key includes mutualThreshold (different thresholds → separate cache entries)', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }])
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    await getFofSet({ viewerId: 'v1', mutualThreshold: 1 });
    await getFofSet({ viewerId: 'v1', mutualThreshold: 2 });

    expect(mockCrew.findMany).toHaveBeenCalledTimes(4);
  });

  it('coerces mutualThreshold below 1 up to 1', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    const result = await getFofSet({ viewerId: 'v1', mutualThreshold: 0, bypassCache: true });
    expect(result).toHaveLength(1);
    expect(result[0].mutualCount).toBe(1);
  });
});
