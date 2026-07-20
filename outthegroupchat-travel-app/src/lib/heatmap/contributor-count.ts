/**
 * @module heatmap/contributor-count
 * @description V1 Phase 4 — lightweight "will my anonymity hold?" probe backing
 * `GET /api/heatmap/contributor-count`.
 *
 * The read-side aggregator (`@/lib/heatmap/aggregate`) enforces the R14
 * anonymous floor: a cell's ANONYMOUS bucket is suppressed entirely unless it
 * holds at least {@link ANONYMOUS_FLOOR} contributions. Before this module the
 * privacy picker let a user choose ANONYMOUS with no signal that their
 * contribution would be silently dropped. This module answers the single
 * question the picker needs — "how many live ANONYMOUS contributions already
 * sit in the cell I am about to write into?" — and never returns anything that
 * identifies WHO those contributors are.
 *
 * Cell resolution deliberately mirrors `heatmap/contribution-writer`: venue
 * lat/lng when a `venueId` is supplied, else the `cityArea` neighborhood
 * centroid, then `anonymizeCell` at the requested granularity. Using the same
 * snapping keeps the probe and the eventual write in the same cell.
 */

import {
  HeatmapContributionType,
  HeatmapGranularityMode,
  HeatmapIdentityMode,
} from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';
import { anonymizeCell } from '@/lib/subcrew/cell-anonymize';
import { getNeighborhoodCentroid } from '@/lib/intent/neighborhoods';
import { ANONYMOUS_FLOOR } from '@/lib/heatmap/anonymous-floor';

/**
 * Re-exported for convenience. The single definition lives in
 * `@/lib/heatmap/anonymous-floor` (dependency-free so the client bundle can
 * import it too).
 *
 * `@/lib/heatmap/aggregate` imports the same constant, so the floor this probe
 * reports and the floor the aggregator enforces cannot drift apart.
 */
export { ANONYMOUS_FLOOR };

type PrismaLike = Pick<typeof defaultPrisma, 'heatmapContribution' | 'venue'>;

export interface ContributorCountInput {
  /** `'interest'` (Intent/commit surface) or `'presence'` (CheckIn surface). */
  type: 'interest' | 'presence';
  /** Venue to resolve the cell from. Preferred when present. */
  venueId?: string;
  /** Neighborhood slug fallback when no venue is bound. */
  cityArea?: string;
  /** Granularity the contribution would be written at. HIDDEN is not probeable. */
  granularity: HeatmapGranularityMode;
  /** Test-injectable Prisma client. */
  prismaClient?: PrismaLike;
}

export interface ContributorCountResult {
  /**
   * Number of live ANONYMOUS contributions already in the resolved cell,
   * counting the requester's own prospective contribution. Aggregate counts
   * rows (not distinct users) when applying the floor, so this does too.
   */
  count: number;
  /** The R14 floor the count is compared against. */
  floor: number;
  /** `true` when choosing ANONYMOUS would actually surface on the map. */
  meetsFloor: boolean;
  /** `false` when no cell could be resolved (no venue coords, unknown area). */
  cellResolved: boolean;
}

/**
 * Count the live ANONYMOUS contributions sitting in the cell a prospective
 * contribution would land in, so the privacy picker can tell the truth about
 * whether the R14 floor will hold.
 *
 * Privacy invariants: only an aggregate integer is produced — no user ids, no
 * names, no per-contribution rows ever leave this function. Raw coordinates are
 * never persisted or echoed; the caller-supplied venue/neighborhood is snapped
 * through {@link anonymizeCell} exactly as the write path does.
 *
 * The count is an upper bound on what any single viewer sees: the aggregator
 * applies the floor to the slice of contributions visible to that viewer's
 * social graph. A cell that clears the floor globally may still fall short for
 * a viewer with a narrow graph, so the picker treats this as "anonymity is
 * plausible", never as a guarantee of a specific viewer's experience.
 *
 * @param input Cell descriptor — see {@link ContributorCountInput}.
 * @returns `{ count, floor, meetsFloor, cellResolved }`. When no cell can be
 *   resolved (HIDDEN granularity, venue without coords, unknown `cityArea`, or
 *   neither identifier supplied), returns `count: 0` with `cellResolved: false`
 *   so the caller fails safe rather than promising anonymity.
 */
export async function getAnonymousContributorCount(
  input: ContributorCountInput,
): Promise<ContributorCountResult> {
  const client = input.prismaClient ?? defaultPrisma;
  const unresolved: ContributorCountResult = {
    count: 0,
    floor: ANONYMOUS_FLOOR,
    meetsFloor: false,
    cellResolved: false,
  };

  if (input.granularity === HeatmapGranularityMode.HIDDEN) return unresolved;

  let latLng: { lat: number; lng: number } | null = null;

  if (input.venueId) {
    const venue = await client.venue.findUnique({
      where: { id: input.venueId },
      select: { latitude: true, longitude: true },
    });
    if (venue && venue.latitude !== null && venue.longitude !== null) {
      latLng = { lat: venue.latitude, lng: venue.longitude };
    }
  }
  if (!latLng && input.cityArea) {
    latLng = getNeighborhoodCentroid(input.cityArea);
  }
  if (!latLng) return unresolved;

  const cell = anonymizeCell(latLng.lat, latLng.lng, input.granularity);
  if (!cell) return unresolved;

  const existing = await client.heatmapContribution.count({
    where: {
      type:
        input.type === 'interest'
          ? HeatmapContributionType.INTEREST
          : HeatmapContributionType.PRESENCE,
      identityMode: HeatmapIdentityMode.ANONYMOUS,
      cellLat: cell.cellLat,
      cellLng: cell.cellLng,
      expiresAt: { gt: new Date() },
    },
  });

  // +1 projects the requester's own contribution into the bucket — the picker
  // is asking about the cell as it would look after they commit.
  const count = existing + 1;
  return {
    count,
    floor: ANONYMOUS_FLOOR,
    meetsFloor: count >= ANONYMOUS_FLOOR,
    cellResolved: true,
  };
}
