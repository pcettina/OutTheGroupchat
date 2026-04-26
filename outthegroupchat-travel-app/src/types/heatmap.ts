/**
 * Client-side TypeScript shapes for V1 Phase 4 Heatmap endpoints.
 *
 * Server-side aggregation lives in `src/lib/heatmap/aggregate.ts`; these are
 * the JSON-serialized shapes the UI consumes from `GET /api/heatmap`.
 */

import type { WindowPreset } from '@prisma/client';

export type HeatmapType = 'interest' | 'presence';
export type HeatmapTier = 'crew' | 'fof';

export interface HeatmapCell {
  lat: number;
  lng: number;
  count: number;
  /** Phase 4b — undefined in 4a (no FoF aggregation yet). */
  anchorSummary?: string;
}

export interface HeatmapVenueMarker {
  venueId: string;
  lat: number;
  lng: number;
  count: number;
  venueName?: string | null;
}

export interface HeatmapResponse {
  success: boolean;
  data?: {
    type: HeatmapType;
    tier: HeatmapTier;
    cells: HeatmapCell[];
    venueMarkers: HeatmapVenueMarker[];
    /** ISO 8601 timestamp of when the response was assembled. */
    generatedAt: string;
  };
  error?: string;
}

export interface HeatmapQuery {
  type: HeatmapType;
  tier: HeatmapTier;
  cityArea?: string;
  topicId?: string;
  windowPreset?: WindowPreset;
  /** Phase 4b only — ignored when tier=crew. */
  mutualThreshold?: number;
  /** Phase 4b only — used for R24 anchor priority. */
  subCrewId?: string;
}
