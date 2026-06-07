/**
 * @module subcrew/cell-anonymize
 * @description Snap a precise (lat, lng) to a coarse cell-center per the
 * granularity mode (R4). Used at HeatmapContribution write time so raw
 * coordinates never leave the aggregation layer.
 *
 * BLOCK mode rounds to 3 decimal places (~110m at NYC latitudes).
 * DYNAMIC_CELL rounds to 4 decimal places (~11m). HIDDEN never writes a
 * contribution — handled at the call site, not here.
 */

import type { HeatmapGranularityMode } from '@prisma/client';

const PRECISION_BY_MODE: Record<Exclude<HeatmapGranularityMode, 'HIDDEN'>, number> = {
  BLOCK: 3,
  DYNAMIC_CELL: 4,
};

/**
 * Snap a precise GPS coordinate to a coarse cell-center so raw, user-level
 * location precision is discarded before it is persisted as a
 * HeatmapContribution. This is the first line of the V1 location-privacy
 * pipeline: callers must store the returned `cellLat`/`cellLng`, never the
 * original `lat`/`lng`.
 *
 * @param lat Precise latitude in decimal degrees (WGS84).
 * @param lng Precise longitude in decimal degrees (WGS84).
 * @param mode Per-contributor granularity setting. `BLOCK` rounds to 3 decimal
 *   places (~110m at NYC latitudes); `DYNAMIC_CELL` rounds to 4 (~11m);
 *   `HIDDEN` opts the contributor out entirely.
 * @returns `{ cellLat, cellLng }` — the rounded cell-center in decimal degrees
 *   to attach to the contribution — or `null` when `mode === 'HIDDEN'`, which
 *   signals the caller to write no contribution at all.
 *
 * Privacy invariant: the output is deterministically quantized to the cell grid
 * for the given mode, so two contributors within the same cell are
 * indistinguishable by coordinate. The function never returns precision finer
 * than the mode allows, and `HIDDEN` always yields `null` (no location leaves
 * this layer).
 */
export function anonymizeCell(
  lat: number,
  lng: number,
  mode: HeatmapGranularityMode,
): { cellLat: number; cellLng: number } | null {
  if (mode === 'HIDDEN') return null;
  const decimals = PRECISION_BY_MODE[mode];
  const factor = Math.pow(10, decimals);
  return {
    cellLat: Math.round(lat * factor) / factor,
    cellLng: Math.round(lng * factor) / factor,
  };
}
