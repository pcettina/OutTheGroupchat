/**
 * Unit tests for src/lib/heatmap/fof-graph.ts
 *
 * Covers V1 R5: friend-of-friend (FoF) set computation — direct Crew
 * exclusion, mutual-Crew threshold filtering, dedup of nodes reached via
 * multiple anchor paths, FOF_CAP truncation, sort order, caching behavior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetFofCacheForTests,
  getFofSet,
} from '@/lib/heatmap/fof-graph';

type CrewEdge = { userAId: string; userBId: string };

function makePrismaClient(
  viewerCrewRows: CrewEdge[],
  fofEdges: CrewEdge[],
) {
  return {
    crew: {
      findMany: vi
        .fn()
        // First call: viewer's direct Crew rows.
        .mockResolvedValueOnce(viewerCrewRows)
        // Second call: edges where one side is in viewer's Crew (FoF
        // candidate edges).
        .mockResolvedValueOnce(fofEdges),
    },
  } as unknown as Parameters<typeof getFofSet>[0]['prismaClient'];
}

describe('getFofSet', () => {
  beforeEach(() => {
    __resetFofCacheForTests();
    vi.clearAllMocks();
  });

  it('returns empty array when viewer has no direct Crew', async () => {
    const client = makePrismaClient([], []);
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toEqual([]);
  });

  it('does not call the second query when viewer has no direct Crew', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([]);
    const client = { crew: { findMany } } as unknown as Parameters<
      typeof getFofSet
    >[0]['prismaClient'];
    await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when viewer has one direct Crew but no FoF edges', async () => {
    const client = makePrismaClient(
      [{ userAId: 'viewer', userBId: 'anchor1' }],
      // Only the direct edge re-surfaces in the second query — no FoF.
      [{ userAId: 'viewer', userBId: 'anchor1' }],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toEqual([]);
  });

  it('returns a single FoF when one anchor has one non-viewer connection', async () => {
    const client = makePrismaClient(
      [{ userAId: 'viewer', userBId: 'anchor1' }],
      [
        // Direct viewer-anchor edge — must be ignored (both anchors path
        // not triggered, but candidate would be viewer itself, skipped).
        { userAId: 'viewer', userBId: 'anchor1' },
        // anchor1 -> fof1
        { userAId: 'anchor1', userBId: 'fof1' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: 'fof1',
      mutualCount: 1,
      anchorIds: ['anchor1'],
    });
  });

  it('excludes the viewer from the FoF set (self-exclusion)', async () => {
    const client = makePrismaClient(
      [{ userAId: 'viewer', userBId: 'anchor1' }],
      [
        // Edge where the candidate-side resolves to the viewer itself.
        { userAId: 'anchor1', userBId: 'viewer' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toEqual([]);
  });

  it('excludes users who are already direct Crew of the viewer', async () => {
    const client = makePrismaClient(
      [
        { userAId: 'viewer', userBId: 'anchor1' },
        { userAId: 'viewer', userBId: 'anchor2' },
      ],
      [
        // anchor1 and anchor2 are both direct Crew of viewer; the edge
        // between them is a direct Crew-Crew edge (both anchors), must
        // not produce FoF entries.
        { userAId: 'anchor1', userBId: 'anchor2' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toEqual([]);
  });

  it('dedupes anchorIds when the same FoF appears via the same anchor twice', async () => {
    // Two records of the same anchor->fof edge (e.g. data duplication)
    // should not inflate mutualCount.
    const client = makePrismaClient(
      [{ userAId: 'viewer', userBId: 'anchor1' }],
      [
        { userAId: 'anchor1', userBId: 'fof1' },
        { userAId: 'fof1', userBId: 'anchor1' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].mutualCount).toBe(1);
    expect(result[0].anchorIds).toEqual(['anchor1']);
  });

  it('combines anchors when the same FoF is reachable via multiple distinct anchors', async () => {
    const client = makePrismaClient(
      [
        { userAId: 'viewer', userBId: 'anchor1' },
        { userAId: 'viewer', userBId: 'anchor2' },
      ],
      [
        { userAId: 'anchor1', userBId: 'fof1' },
        { userAId: 'anchor2', userBId: 'fof1' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('fof1');
    expect(result[0].mutualCount).toBe(2);
    expect(result[0].anchorIds.sort()).toEqual(['anchor1', 'anchor2']);
  });

  it('filters FoF entries below the mutualThreshold', async () => {
    const client = makePrismaClient(
      [
        { userAId: 'viewer', userBId: 'anchor1' },
        { userAId: 'viewer', userBId: 'anchor2' },
      ],
      [
        // fofA has mutualCount=2; fofB has mutualCount=1.
        { userAId: 'anchor1', userBId: 'fofA' },
        { userAId: 'anchor2', userBId: 'fofA' },
        { userAId: 'anchor1', userBId: 'fofB' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      mutualThreshold: 2,
      prismaClient: client,
      bypassCache: true,
    });
    expect(result.map((r) => r.userId)).toEqual(['fofA']);
  });

  it('treats mutualThreshold < 1 as 1 (clamped)', async () => {
    const client = makePrismaClient(
      [{ userAId: 'viewer', userBId: 'anchor1' }],
      [{ userAId: 'anchor1', userBId: 'fof1' }],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      mutualThreshold: 0,
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].mutualCount).toBeGreaterThanOrEqual(1);
  });

  it('sorts results by mutualCount descending', async () => {
    const client = makePrismaClient(
      [
        { userAId: 'viewer', userBId: 'anchor1' },
        { userAId: 'viewer', userBId: 'anchor2' },
        { userAId: 'viewer', userBId: 'anchor3' },
      ],
      [
        // fofHigh has 3 mutuals, fofMid has 2, fofLow has 1.
        { userAId: 'anchor1', userBId: 'fofHigh' },
        { userAId: 'anchor2', userBId: 'fofHigh' },
        { userAId: 'anchor3', userBId: 'fofHigh' },
        { userAId: 'anchor1', userBId: 'fofMid' },
        { userAId: 'anchor2', userBId: 'fofMid' },
        { userAId: 'anchor1', userBId: 'fofLow' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result.map((r) => r.userId)).toEqual([
      'fofHigh',
      'fofMid',
      'fofLow',
    ]);
    expect(result.map((r) => r.mutualCount)).toEqual([3, 2, 1]);
  });

  it('caps the result at 200 entries (FOF_CAP)', async () => {
    const viewerCrewRows = [{ userAId: 'viewer', userBId: 'anchor1' }];
    const fofEdges: CrewEdge[] = [];
    for (let i = 0; i < 250; i++) {
      fofEdges.push({ userAId: 'anchor1', userBId: `fof${i}` });
    }
    const client = makePrismaClient(viewerCrewRows, fofEdges);
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toHaveLength(200);
  });

  it('handles viewer appearing as userBId on the direct Crew edge', async () => {
    const client = makePrismaClient(
      // viewer on the B side
      [{ userAId: 'anchor1', userBId: 'viewer' }],
      [{ userAId: 'anchor1', userBId: 'fof1' }],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('fof1');
  });

  it('caches results and returns cached value on a second identical call', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ userAId: 'viewer', userBId: 'anchor1' }])
      .mockResolvedValueOnce([{ userAId: 'anchor1', userBId: 'fof1' }]);
    const client = { crew: { findMany } } as unknown as Parameters<
      typeof getFofSet
    >[0]['prismaClient'];

    const r1 = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
    });
    const r2 = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
    });
    expect(r1).toEqual(r2);
    // Only the first call hits prisma (2 queries); the second is cached.
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache when bypassCache=true', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ userAId: 'viewer', userBId: 'anchor1' }])
      .mockResolvedValueOnce([{ userAId: 'anchor1', userBId: 'fof1' }])
      .mockResolvedValueOnce([{ userAId: 'viewer', userBId: 'anchor1' }])
      .mockResolvedValueOnce([{ userAId: 'anchor1', userBId: 'fof1' }]);
    const client = { crew: { findMany } } as unknown as Parameters<
      typeof getFofSet
    >[0]['prismaClient'];

    await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(findMany).toHaveBeenCalledTimes(4);
  });

  it('caches per (viewerId, mutualThreshold) — different thresholds re-query', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ userAId: 'viewer', userBId: 'anchor1' }])
      .mockResolvedValueOnce([{ userAId: 'anchor1', userBId: 'fof1' }])
      .mockResolvedValueOnce([{ userAId: 'viewer', userBId: 'anchor1' }])
      .mockResolvedValueOnce([{ userAId: 'anchor1', userBId: 'fof1' }]);
    const client = { crew: { findMany } } as unknown as Parameters<
      typeof getFofSet
    >[0]['prismaClient'];

    await getFofSet({
      viewerId: 'viewer',
      mutualThreshold: 1,
      prismaClient: client,
    });
    await getFofSet({
      viewerId: 'viewer',
      mutualThreshold: 2,
      prismaClient: client,
    });
    expect(findMany).toHaveBeenCalledTimes(4);
  });

  it('queries crew rows with status=ACCEPTED filter', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const client = { crew: { findMany } } as unknown as Parameters<
      typeof getFofSet
    >[0]['prismaClient'];

    await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    const firstCallArg = findMany.mock.calls[0][0];
    expect(firstCallArg.where.status).toBe('ACCEPTED');
    expect(firstCallArg.where.OR).toEqual([
      { userAId: 'viewer' },
      { userBId: 'viewer' },
    ]);
  });

  it('handles a fully-connected mini-graph correctly (anchor-anchor edges skipped)', async () => {
    // Triangle: viewer-A, viewer-B, A-B (both anchors of viewer).
    // Plus A-C and B-C where C is the FoF reachable via both.
    const client = makePrismaClient(
      [
        { userAId: 'viewer', userBId: 'anchorA' },
        { userAId: 'viewer', userBId: 'anchorB' },
      ],
      [
        // Both-anchors edge: must be skipped.
        { userAId: 'anchorA', userBId: 'anchorB' },
        // FoF edges:
        { userAId: 'anchorA', userBId: 'fofC' },
        { userAId: 'anchorB', userBId: 'fofC' },
      ],
    );
    const result = await getFofSet({
      viewerId: 'viewer',
      prismaClient: client,
      bypassCache: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('fofC');
    expect(result[0].mutualCount).toBe(2);
  });
});
