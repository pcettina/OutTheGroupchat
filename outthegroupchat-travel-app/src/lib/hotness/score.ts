/**
 * @module hotness/score
 * @description Compute the "hotness boost" applied to venue ranking in
 * recommendations (R10, R18).
 *
 * Phase 3: stub. Returns a neutral boost of 1.0 for every venue. This keeps
 * the recommendations API stable so Phase 4 (heatmap) can wire the real
 * input without changing call sites.
 *
 * Phase 4 plan: read recent HeatmapContribution rows within
 * `HOTNESS_CONFIG.rollingWindowHours`, weight by viewer's-Crew presence
 * (R10), apply linear decay (`HOTNESS_CONFIG.decayCoefficient`), and return
 * a multiplier in roughly [1.0, 2.5].
 */

import { HOTNESS_CONFIG } from './config';

/** A boost multiplier applied to a venue's base relevance score. */
export type HotnessBoost = number;

export interface HotnessContext {
  /** Caller's user id. */
  viewerId: string;
  /** Optional cityArea narrowing. */
  cityArea?: string | null;
  /** Whether the viewer asked for "weight by my Crew" (R10). */
  weightByCrew?: boolean;
}

/**
 * Compute a per-venue boost. Phase 3 returns `1.0` (no boost) so callers
 * have a stable contract once Phase 4 plugs in the real signal.
 *
 * @param venueId The venue under consideration.
 * @param ctx The viewer + filter context.
 * @returns A boost multiplier in [1.0, ∞). 1.0 = neutral.
 */
export function computeHotnessBoost(
  _venueId: string,
  _ctx: HotnessContext,
): HotnessBoost {
  // Phase 4 will read prisma.heatmapContribution rows here.
  return 1.0;
}

/** Re-export the config so call sites only need to import this module. */
export { HOTNESS_CONFIG };
