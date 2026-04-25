/**
 * @module hotness/config
 * @description Tuning constants for the OTG "currently hot" venue signal (R10, R18).
 *
 * v1: these constants live in source. Every change is a code change + deploy. Promote
 * to a DB-backed admin surface in v1.5 only for the specific parameters that prove to
 * need runtime tuning (premature admin UI is wasted work — see R18 rationale).
 *
 * Source of truth for the math itself lives in Phase 3's `lib/hotness/compute.ts`
 * (not yet built); this module just exposes the dials.
 */

/**
 * Configuration for the hotness signal that boosts venue ranking in recommendations
 * and weights the `weight by my Crew` filter (R10).
 *
 * Defaults are intentionally conservative for v1 launch:
 * - `rollingWindowHours = 6` so the signal tracks tonight's behavior, not yesterday's
 * - `decayCoefficient = 1.0` is a linear decay — simple, predictable, easy to reason
 *   about in early debugging. Switch to exponential in v1.5 if needed.
 * - `crewWeightFactor = 1.5` boosts venues with viewer's-Crew contributions by 50%
 *   when the user enables the Crew-weight filter — preserves the city-wide base
 *   ranking while making Crew presence visibly meaningful.
 */
export const HOTNESS_CONFIG = {
  /** How many hours of past contributions count toward hotness. */
  rollingWindowHours: 6,
  /** Decay shape (linear in v1; reserved for future exponential/sigmoid). */
  decayCoefficient: 1.0,
  /** Multiplier applied at read time when the user enables the "weight by my Crew" toggle. */
  crewWeightFactor: 1.5,
} as const;

export type HotnessConfig = typeof HOTNESS_CONFIG;
