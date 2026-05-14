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

  it('coerces negative mutualThreshold up to 1', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    const result = await getFofSet({ viewerId: 'v1', mutualThreshold: -5, bypassCache: true });
    expect(result).toHaveLength(1);
  });

  it('handles cycles in the graph without infinite loops', async () => {
    // Triangle: v1 ↔ p1 ↔ p2 ↔ p1 (and p2 ↔ fof1, p1 ↔ fof1)
    // Multiple edges between same anchors should not blow up; FoF stays bounded.
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1' },
        { userAId: 'v1', userBId: 'p2' },
      ])
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'p2' }, // cycle edge — both anchors, skipped
        { userAId: 'p2', userBId: 'p1' }, // duplicate cycle edge, also skipped
        { userAId: 'p1', userBId: 'fof1' },
        { userAId: 'p2', userBId: 'fof1' },
      ]);

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('fof1');
    expect(result[0].mutualCount).toBe(2);
  });

  it('deduplicates anchors when same anchor→FoF edge appears twice', async () => {
    // Same edge (p1 ↔ fof1) reported twice — anchors are stored in a Set,
    // so dedup is automatic.
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'fof1' },
        { userAId: 'fof1', userBId: 'p1' }, // same edge, opposite orientation
      ]);

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });
    expect(result).toHaveLength(1);
    expect(result[0].mutualCount).toBe(1); // not 2
    expect(result[0].anchorIds).toEqual(['p1']);
  });

  it('handles viewer appearing as userBId in their own Crew rows', async () => {
    // Edge stored as (p1, v1) — viewer is userBId. Anchor extraction must
    // still pick p1.
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'v1' },
        { userAId: 'p2', userBId: 'v1' },
      ])
      .mockResolvedValueOnce([
        { userAId: 'p1', userBId: 'fof1' },
        { userAId: 'fof2', userBId: 'p2' },
      ]);

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.userId).sort();
    expect(ids).toEqual(['fof1', 'fof2']);
  });

  it('returns empty when viewer Crew exists but no FoF edges found', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([]); // p1 has no other edges

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });
    expect(result).toEqual([]);
  });

  it('returns empty when all FoF edges are Crew-Crew (no candidates)', async () => {
    // p1 and p2 are both viewer's Crew; only edge between them is a direct
    // Crew-Crew edge (skipped).
    mockCrew.findMany
      .mockResolvedValueOnce([
        { userAId: 'v1', userBId: 'p1' },
        { userAId: 'v1', userBId: 'p2' },
      ])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'p2' }]);

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });
    expect(result).toEqual([]);
  });

  it('uses injected prismaClient when provided', async () => {
    const customCrew = { findMany: vi.fn() };
    customCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    const customClient = { crew: customCrew } as unknown as Parameters<typeof getFofSet>[0]['prismaClient'];

    const result = await getFofSet({
      viewerId: 'v1',
      prismaClient: customClient,
      bypassCache: true,
    });

    expect(result).toHaveLength(1);
    expect(customCrew.findMany).toHaveBeenCalledTimes(2);
    // Default prisma mock should not have been touched.
    expect(mockCrew.findMany).not.toHaveBeenCalled();
  });

  it('bypassCache=true skips cache read but still writes', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }])
      // Second bypass call still hits DB
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    await getFofSet({ viewerId: 'v1', bypassCache: true });
    await getFofSet({ viewerId: 'v1', bypassCache: true });

    expect(mockCrew.findMany).toHaveBeenCalledTimes(4);
  });

  it('different viewerIds use separate cache entries', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }])
      .mockResolvedValueOnce([{ userAId: 'v2', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    const r1 = await getFofSet({ viewerId: 'v1' });
    const r2 = await getFofSet({ viewerId: 'v2' });

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(mockCrew.findMany).toHaveBeenCalledTimes(4);
  });

  it('cache invalidation via __resetFofCacheForTests forces re-fetch', async () => {
    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }])
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce([{ userAId: 'p1', userBId: 'fof1' }]);

    await getFofSet({ viewerId: 'v1' });
    expect(mockCrew.findMany).toHaveBeenCalledTimes(2);

    __resetFofCacheForTests();

    await getFofSet({ viewerId: 'v1' });
    expect(mockCrew.findMany).toHaveBeenCalledTimes(4);
  });

  it('caps result set at 200 entries', async () => {
    // 1 anchor with 250 FoF candidates — result must be capped at 200.
    const fofEdges = Array.from({ length: 250 }, (_, i) => ({
      userAId: 'p1',
      userBId: `fof${i}`,
    }));

    mockCrew.findMany
      .mockResolvedValueOnce([{ userAId: 'v1', userBId: 'p1' }])
      .mockResolvedValueOnce(fofEdges);

    const result = await getFofSet({ viewerId: 'v1', bypassCache: true });
    expect(result).toHaveLength(200);
  });
});
