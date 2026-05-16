/**
 * @module heatmap/fof-graph
 * @description V1 Phase 4b — Friend-of-friend (FoF) set computation.
 *
 * "FoF" = users who share at least N accepted-Crew edges with the viewer
 * (R5). A user's mutual-Crew count is the size of the intersection between
 * their accepted-Crew set and the viewer's accepted-Crew set. Anyone the
 * viewer is *already* directly Crew with is excluded — they belong on the
 * Crew-tier surface, not FoF.
 *
 * Result is capped at 200 users sorted by mutualCount desc to keep read-side
 * fan-out bounded for users with broadly connected Crews (Known Risk #2 in
 * the implementation plan).
 *
 * Cache: in-memory LRU keyed by `viewerId:mutualThreshold`, 60s TTL. Bound
 * to a single Node process, which is fine for v1 — Vercel functions are
 * stateless across invocations so cache hits are best-effort. v1.5 may
 * promote to Redis once read volume grows.
 */

import { prisma as defaultPrisma } from '@/lib/prisma';

type PrismaLike = Pick<typeof defaultPrisma, 'crew'>;

/**
 * One row in the FoF set returned by {@link getFofSet}. The `anchorIds` are
 * fed directly to {@link pickAnchor} to derive the per-cell "via Alex" label
 * for the FoF heatmap surface (R24).
 */
export interface FofEntry {
  /** The FoF user id (a non-Crew user 1-hop from the viewer). */
  userId: string;
  /** Number of mutual Crew shared with the viewer (R5 threshold). */
  mutualCount: number;
  /** Mutual-Crew anchor user ids (i.e. members of the viewer's direct Crew
   *  who are *also* Crew with this FoF user). */
  anchorIds: string[];
}

const FOF_CAP = 200;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 100;

interface CacheEntry {
  expires: number;
  value: FofEntry[];
}

const fofCache = new Map<string, CacheEntry>();

function cacheKey(viewerId: string, mutualThreshold: number): string {
  return `${viewerId}:${mutualThreshold}`;
}

function readCache(key: string): FofEntry[] | null {
  const entry = fofCache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    fofCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key: string, value: FofEntry[]): void {
  fofCache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
  if (fofCache.size > CACHE_MAX_ENTRIES) {
    const oldest = fofCache.keys().next().value;
    if (oldest) fofCache.delete(oldest);
  }
}

/** Test-only — clear the FoF cache between runs. */
export function __resetFofCacheForTests(): void {
  fofCache.clear();
}

/**
 * Compute the viewer's friend-of-friend set: users 1-hop via accepted Crew
 * with `mutualCount >= mutualThreshold` (R5). Direct Crew of the viewer are
 * excluded — they belong on the Crew-tier surface.
 *
 * Result is capped at 200 entries sorted by `mutualCount` desc to bound
 * read-side fan-out on highly-connected viewers. Cached in-process for 60s
 * keyed by `viewerId:mutualThreshold`.
 *
 * @param opts.viewerId Caller's user id.
 * @param opts.mutualThreshold Minimum mutual-Crew count. Defaults to 1.
 *   Floored to 1 — values below have no semantic meaning.
 * @param opts.prismaClient Test-injectable Prisma client.
 * @param opts.bypassCache When true, skips the LRU cache (test use only).
 * @returns Up to 200 FoF entries sorted by mutualCount desc.
 */
export async function getFofSet(opts: {
  viewerId: string;
  mutualThreshold?: number;
  prismaClient?: PrismaLike;
  /** Skip the cache (used by tests). */
  bypassCache?: boolean;
}): Promise<FofEntry[]> {
  const threshold = Math.max(1, opts.mutualThreshold ?? 1);
  const client = opts.prismaClient ?? defaultPrisma;
  const key = cacheKey(opts.viewerId, threshold);

  if (!opts.bypassCache) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  const viewerCrewRows = await client.crew.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: opts.viewerId }, { userBId: opts.viewerId }],
    },
    select: { userAId: true, userBId: true },
  });

  const viewerCrewIds = new Set(
    viewerCrewRows.map((r) =>
      r.userAId === opts.viewerId ? r.userBId : r.userAId,
    ),
  );

  if (viewerCrewIds.size === 0) {
    writeCache(key, []);
    return [];
  }

  const viewerCrewArray = Array.from(viewerCrewIds);

  // All accepted Crew edges where at least one side is in the viewer's
  // Crew. Each such edge points to a candidate FoF (the other side, when
  // it's not the viewer and not already in viewer's Crew).
  const fofEdges = await client.crew.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userAId: { in: viewerCrewArray } },
        { userBId: { in: viewerCrewArray } },
      ],
    },
    select: { userAId: true, userBId: true },
  });

  const fofAnchors = new Map<string, Set<string>>();

  for (const edge of fofEdges) {
    const aIsAnchor = viewerCrewIds.has(edge.userAId);
    const bIsAnchor = viewerCrewIds.has(edge.userBId);

    let anchorId: string | null = null;
    let candidateId: string | null = null;
    if (aIsAnchor && !bIsAnchor) {
      anchorId = edge.userAId;
      candidateId = edge.userBId;
    } else if (bIsAnchor && !aIsAnchor) {
      anchorId = edge.userBId;
      candidateId = edge.userAId;
    } else {
      // both anchors — direct Crew-Crew edge, not FoF
      continue;
    }

    if (candidateId === opts.viewerId) continue;
    if (viewerCrewIds.has(candidateId)) continue; // already direct Crew

    let anchors = fofAnchors.get(candidateId);
    if (!anchors) {
      anchors = new Set();
      fofAnchors.set(candidateId, anchors);
    }
    anchors.add(anchorId);
  }

  const entries: FofEntry[] = Array.from(fofAnchors.entries())
    .map(([userId, anchors]) => ({
      userId,
      mutualCount: anchors.size,
      anchorIds: Array.from(anchors),
    }))
    .filter((e) => e.mutualCount >= threshold)
    .sort((a, b) => b.mutualCount - a.mutualCount)
    .slice(0, FOF_CAP);

  writeCache(key, entries);
  return entries;
}
