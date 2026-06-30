/**
 * @module hotness/score
 * @description Compute the "hotness boost" applied to venue ranking in
 * recommendations (R10, R18).
 *
 * V1 Phase 4 wiring: a venue's hotness is derived from the density of recent
 * `HeatmapContribution` rows that fall in the *same anonymized cell* as the
 * venue, within `HOTNESS_CONFIG.rollingWindowHours`. Each contribution is
 * weighted by a linear time-decay (newer counts more) and, when the viewer
 * enables the "weight by my Crew" filter (R10), contributions authored by the
 * viewer's Crew are boosted by `HOTNESS_CONFIG.crewWeightFactor`.
 *
 * Design constraints (so this stays unit-testable):
 *   - PURE function: no DB access, no `Date.now()` baked in. The caller (the
 *     recommendations route) loads the candidate `HeatmapContribution` rows and
 *     the viewer's Crew ids and passes them in. The clock is injectable via
 *     `opts.now` (defaults to `new Date()`).
 *   - Reuses the contribution-writer's cell-quantization rule: a venue lat/lng
 *     is snapped to the cell grid with `anonymizeCell` (BLOCK precision, the
 *     same precision PRESENCE/most contributions are written at) before density
 *     is counted, since contribution rows carry `cellLat`/`cellLng` and no
 *     `venueId`.
 *   - Returns a multiplier in [1.0, MAX_BOOST]. An empty cell yields exactly
 *     1.0, and the boost is monotonically non-decreasing in weighted density.
 */

import { HeatmapContributionType, HeatmapGranularityMode } from '@prisma/client';
import { anonymizeCell } from '@/lib/subcrew/cell-anonymize';
import { HOTNESS_CONFIG } from './config';

/** A boost multiplier applied to a venue's base relevance score. */
export type HotnessBoost = number;

/**
 * Neutral boost: applied to a venue with no recent contributions in its cell.
 * Exported so callers/tests can assert against the canonical no-op value.
 */
export const NEUTRAL_BOOST: HotnessBoost = 1.0;

/**
 * Upper bound of the boost multiplier. The signal saturates here so a single
 * very-hot venue cannot dominate the entire ranking (R18). Chosen to match the
 * config doc's "roughly [1.0, 2.5]" target.
 */
export const MAX_BOOST: HotnessBoost = 2.5;

/**
 * Saturation constant: weighted density (in "effective contributions") at which
 * the boost reaches ~63% of the way from NEUTRAL to MAX. Tuned so a handful of
 * fresh contributions produces a meaningful — but not maxed-out — lift, and the
 * curve approaches MAX_BOOST asymptotically rather than clipping abruptly.
 */
const DENSITY_HALF_SATURATION = 6;

/**
 * The minimal slice of a `HeatmapContribution` row this function needs. The
 * recommendations route selects exactly these fields. `cellLat`/`cellLng` are
 * the pre-anonymized cell center (raw coordinates never reach this layer);
 * `createdAt` drives the linear time-decay; `userId` drives the optional
 * Crew-weight. `type` lets a caller pass a mixed set and have us count only the
 * INTEREST/PRESENCE surfaces that feed hotness.
 */
export interface HotnessContributionRow {
  /** Contributor user id — matched against `viewerCrewIds` for Crew-weight. */
  userId: string;
  /** INTEREST or PRESENCE — both count toward hotness (R13). */
  type: HeatmapContributionType;
  /** Anonymized cell-center latitude the contribution was written at. */
  cellLat: number;
  /** Anonymized cell-center longitude the contribution was written at. */
  cellLng: number;
  /** When the contribution was written — drives linear time-decay. */
  createdAt: Date;
}

/** The geographic anchor of the venue being scored. */
export interface HotnessVenue {
  /** Venue latitude in decimal degrees (WGS84). May be `null` for venues with no geo. */
  latitude: number | null;
  /** Venue longitude in decimal degrees (WGS84). May be `null` for venues with no geo. */
  longitude: number | null;
}

/** Inputs to {@link computeHotnessBoost}. */
export interface HotnessBoostInput {
  /** The venue under consideration (its lat/lng is snapped to a cell). */
  venue: HotnessVenue;
  /**
   * Candidate contribution rows. The caller may pass the full recent set for
   * the city — this function filters to the venue's cell and the rolling
   * window itself. Rows outside the cell/window are ignored.
   */
  contributions: ReadonlyArray<HotnessContributionRow>;
  /** Whether the viewer enabled "weight by my Crew" (R10). */
  weightByCrew?: boolean;
  /**
   * The viewer's accepted-Crew user ids. Only consulted when
   * `weightByCrew` is true; contributions from these users are weighted by
   * `HOTNESS_CONFIG.crewWeightFactor`. Pass `[]` (or omit) when not weighting.
   */
  viewerCrewIds?: ReadonlyArray<string>;
  /**
   * Injectable clock for the rolling-window cutoff and decay reference.
   * Defaults to `new Date()`. Provided so the function is deterministic in tests.
   */
  now?: Date;
}

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Snap a venue lat/lng to the same cell grid the contribution writer uses, so
 * a venue can be matched against pre-anonymized `cellLat`/`cellLng` rows.
 *
 * Contributions are written at BLOCK precision (the PRESENCE default, and the
 * coarsest non-hidden tier); matching at BLOCK groups any finer-grained
 * (DYNAMIC_CELL) contributions that share the same block, which is the correct
 * behavior for a venue-level density signal.
 */
function venueCellKey(venue: HotnessVenue): string | null {
  if (venue.latitude === null || venue.longitude === null) return null;
  const cell = anonymizeCell(
    venue.latitude,
    venue.longitude,
    HeatmapGranularityMode.BLOCK,
  );
  if (!cell) return null;
  return `${cell.cellLat.toFixed(6)},${cell.cellLng.toFixed(6)}`;
}

/** Cell key for a contribution row, snapped to the same BLOCK grid as the venue. */
function contributionCellKey(row: HotnessContributionRow): string | null {
  const cell = anonymizeCell(row.cellLat, row.cellLng, HeatmapGranularityMode.BLOCK);
  if (!cell) return null;
  return `${cell.cellLat.toFixed(6)},${cell.cellLng.toFixed(6)}`;
}

/**
 * Linear time-decay weight for a contribution, in [0, 1].
 *
 * At `ageHours = 0` the weight is 1.0; it falls linearly to 0 at the window
 * edge (`rollingWindowHours`). `decayCoefficient` scales the slope: 1.0 is the
 * plain linear ramp described in the config; >1 decays faster, <1 slower. The
 * weight is clamped to [0, 1] so an out-of-window or future-dated row never
 * contributes negative or >1 weight.
 */
function decayWeight(ageHours: number, windowHours: number, decayCoefficient: number): number {
  if (windowHours <= 0) return 0;
  const fractionElapsed = (ageHours / windowHours) * decayCoefficient;
  const weight = 1 - fractionElapsed;
  if (weight <= 0) return 0;
  if (weight >= 1) return 1;
  return weight;
}

/**
 * Map a non-negative weighted density to a boost in [NEUTRAL_BOOST, MAX_BOOST]
 * via a saturating curve. Monotonically non-decreasing in `density`, equals
 * exactly NEUTRAL_BOOST at `density = 0`, and asymptotically approaches
 * MAX_BOOST. Uses a bounded rational saturation
 * (`density / (density + half)`) so it never overshoots the cap.
 */
function densityToBoost(density: number): HotnessBoost {
  if (density <= 0) return NEUTRAL_BOOST;
  const saturation = density / (density + DENSITY_HALF_SATURATION);
  return NEUTRAL_BOOST + (MAX_BOOST - NEUTRAL_BOOST) * saturation;
}

/**
 * Compute a per-venue hotness boost from recent heatmap contribution density.
 *
 * The function snaps the venue to a BLOCK cell, keeps only INTEREST/PRESENCE
 * contributions in that cell whose `createdAt` falls within the rolling window
 * `[now - rollingWindowHours, now]`, weights each by a linear time-decay
 * (`decayCoefficient`), optionally multiplies Crew-authored contributions by
 * `crewWeightFactor` when `weightByCrew` is set, sums the weights into an
 * "effective density", and maps that through a saturating curve into a
 * multiplier.
 *
 * Pure and deterministic for a fixed `now`. Performs no I/O.
 *
 * @param input See {@link HotnessBoostInput}.
 * @returns A multiplier in `[NEUTRAL_BOOST, MAX_BOOST]` (i.e. roughly
 *   `[1.0, 2.5]`). Exactly `NEUTRAL_BOOST` (1.0) when the venue has no geo or
 *   no in-cell, in-window contributions. Monotonically non-decreasing in the
 *   weighted contribution density.
 */
export function computeHotnessBoost(input: HotnessBoostInput): HotnessBoost {
  const { venue, contributions, weightByCrew = false, viewerCrewIds, now = new Date() } = input;

  const targetCell = venueCellKey(venue);
  if (targetCell === null) return NEUTRAL_BOOST;
  if (contributions.length === 0) return NEUTRAL_BOOST;

  const { rollingWindowHours, decayCoefficient, crewWeightFactor } = HOTNESS_CONFIG;
  const nowMs = now.getTime();
  const crewSet =
    weightByCrew && viewerCrewIds && viewerCrewIds.length > 0
      ? new Set(viewerCrewIds)
      : null;

  let density = 0;
  for (const row of contributions) {
    if (
      row.type !== HeatmapContributionType.INTEREST &&
      row.type !== HeatmapContributionType.PRESENCE
    ) {
      continue;
    }
    if (contributionCellKey(row) !== targetCell) continue;

    const ageHours = (nowMs - row.createdAt.getTime()) / MS_PER_HOUR;
    if (ageHours < 0) continue; // future-dated row; ignore rather than over-weight
    const timeWeight = decayWeight(ageHours, rollingWindowHours, decayCoefficient);
    if (timeWeight <= 0) continue; // outside the rolling window

    const crewWeight = crewSet && crewSet.has(row.userId) ? crewWeightFactor : 1;
    density += timeWeight * crewWeight;
  }

  return densityToBoost(density);
}

/** Re-export the config so call sites only need to import this module. */
export { HOTNESS_CONFIG };
