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
