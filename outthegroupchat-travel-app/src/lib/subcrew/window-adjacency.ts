/**
 * @module subcrew/window-adjacency
 * @description WindowPreset adjacency map (R11/R17).
 *
 * Two Intents match for SubCrew formation when their presets are equal *or*
 * sit next to each other in the canonical day-order (EARLY_MORNING → … → NIGHT).
 * This lets users hedge with adjacent windows ("brunch or lunch?") and still
 * align with friends who picked just one.
 */

import { WindowPreset } from '@prisma/client';

const ORDER: WindowPreset[] = [
  'EARLY_MORNING',
  'MORNING',
  'BRUNCH',
  'AFTERNOON',
  'EVENING',
  'NIGHT',
];

/** Build an adjacency map: each preset → [self, prev?, next?]. */
const ADJACENCY: Record<WindowPreset, WindowPreset[]> = ORDER.reduce(
  (acc, preset, idx) => {
    const window: WindowPreset[] = [preset];
    if (idx > 0) window.push(ORDER[idx - 1]);
    if (idx < ORDER.length - 1) window.push(ORDER[idx + 1]);
    acc[preset] = window;
    return acc;
  },
  {} as Record<WindowPreset, WindowPreset[]>,
);

/** All presets that could match the given one (self + immediate neighbors). */
export function adjacentPresets(preset: WindowPreset): WindowPreset[] {
  return ADJACENCY[preset];
}

/** True when two presets could form a SubCrew together. */
export function presetsAdjacent(a: WindowPreset, b: WindowPreset): boolean {
  return ADJACENCY[a].includes(b);
}

/**
 * "Distance" between two presets — 0 for exact match, 1 for adjacent,
 * Infinity otherwise. Used by the collapse logic to pick the *best* of a
 * single user's hedged Intents when multiple match the focal preset.
 */
export function presetDistance(a: WindowPreset, b: WindowPreset): number {
  const ai = ORDER.indexOf(a);
  const bi = ORDER.indexOf(b);
  if (ai < 0 || bi < 0) return Infinity;
  const d = Math.abs(ai - bi);
  return d <= 1 ? d : Infinity;
}
