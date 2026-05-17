/**
 * Unit tests for src/lib/subcrew/window-adjacency.ts
 *
 * Covers the WindowPreset adjacency map (R11/R17):
 *   - adjacentPresets: returns self + immediate neighbors in day-order
 *   - presetsAdjacent: boolean adjacency check (symmetric)
 *   - presetDistance: 0 for self, 1 for adjacent, Infinity otherwise
 *
 * Canonical day-order: EARLY_MORNING → MORNING → BRUNCH → AFTERNOON → EVENING → NIGHT
 */

import { describe, it, expect } from 'vitest';
import type { WindowPreset } from '@prisma/client';
import {
  adjacentPresets,
  presetsAdjacent,
  presetDistance,
} from '@/lib/subcrew/window-adjacency';

const ALL_PRESETS: WindowPreset[] = [
  'EARLY_MORNING',
  'MORNING',
  'BRUNCH',
  'AFTERNOON',
  'EVENING',
  'NIGHT',
];

// ---------------------------------------------------------------------------
// adjacentPresets
// ---------------------------------------------------------------------------
describe('adjacentPresets', () => {
  it('includes self for every preset', () => {
    for (const preset of ALL_PRESETS) {
      expect(adjacentPresets(preset)).toContain(preset);
    }
  });

  it('EARLY_MORNING is an endpoint — only self + MORNING', () => {
    expect(adjacentPresets('EARLY_MORNING')).toEqual(['EARLY_MORNING', 'MORNING']);
  });

  it('NIGHT is an endpoint — only self + EVENING', () => {
    expect(adjacentPresets('NIGHT')).toEqual(['NIGHT', 'EVENING']);
  });

  it('endpoints return exactly 2 entries (self + one neighbor)', () => {
    expect(adjacentPresets('EARLY_MORNING')).toHaveLength(2);
    expect(adjacentPresets('NIGHT')).toHaveLength(2);
  });

  it('middle presets return exactly 3 entries (self + both neighbors)', () => {
    expect(adjacentPresets('MORNING')).toHaveLength(3);
    expect(adjacentPresets('BRUNCH')).toHaveLength(3);
    expect(adjacentPresets('AFTERNOON')).toHaveLength(3);
    expect(adjacentPresets('EVENING')).toHaveLength(3);
  });

  it('MORNING — neighbors are EARLY_MORNING and BRUNCH', () => {
    expect(adjacentPresets('MORNING').sort()).toEqual(
      ['EARLY_MORNING', 'MORNING', 'BRUNCH'].sort(),
    );
  });

  it('BRUNCH — neighbors are MORNING and AFTERNOON', () => {
    expect(adjacentPresets('BRUNCH').sort()).toEqual(
      ['MORNING', 'BRUNCH', 'AFTERNOON'].sort(),
    );
  });

  it('AFTERNOON — neighbors are BRUNCH and EVENING', () => {
    expect(adjacentPresets('AFTERNOON').sort()).toEqual(
      ['BRUNCH', 'AFTERNOON', 'EVENING'].sort(),
    );
  });

  it('EVENING — neighbors are AFTERNOON and NIGHT', () => {
    expect(adjacentPresets('EVENING').sort()).toEqual(
      ['AFTERNOON', 'EVENING', 'NIGHT'].sort(),
    );
  });

  it('returned arrays are non-empty for every WindowPreset', () => {
    for (const preset of ALL_PRESETS) {
      const result = adjacentPresets(preset);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// presetsAdjacent
// ---------------------------------------------------------------------------
describe('presetsAdjacent', () => {
  it('returns true when both presets are identical (self-adjacency)', () => {
    for (const preset of ALL_PRESETS) {
      expect(presetsAdjacent(preset, preset)).toBe(true);
    }
  });

  it('returns true for immediate neighbors in canonical order', () => {
    expect(presetsAdjacent('EARLY_MORNING', 'MORNING')).toBe(true);
    expect(presetsAdjacent('MORNING', 'BRUNCH')).toBe(true);
    expect(presetsAdjacent('BRUNCH', 'AFTERNOON')).toBe(true);
    expect(presetsAdjacent('AFTERNOON', 'EVENING')).toBe(true);
    expect(presetsAdjacent('EVENING', 'NIGHT')).toBe(true);
  });

  it('is symmetric — order of arguments does not matter', () => {
    expect(presetsAdjacent('MORNING', 'EARLY_MORNING')).toBe(true);
    expect(presetsAdjacent('NIGHT', 'EVENING')).toBe(true);
    expect(presetsAdjacent('AFTERNOON', 'BRUNCH')).toBe(true);
  });

  it('returns false for presets two steps apart', () => {
    expect(presetsAdjacent('EARLY_MORNING', 'BRUNCH')).toBe(false);
    expect(presetsAdjacent('MORNING', 'AFTERNOON')).toBe(false);
    expect(presetsAdjacent('BRUNCH', 'EVENING')).toBe(false);
    expect(presetsAdjacent('AFTERNOON', 'NIGHT')).toBe(false);
  });

  it('returns false for opposite endpoints', () => {
    expect(presetsAdjacent('EARLY_MORNING', 'NIGHT')).toBe(false);
    expect(presetsAdjacent('NIGHT', 'EARLY_MORNING')).toBe(false);
  });

  it('returns false for presets three or more steps apart', () => {
    expect(presetsAdjacent('EARLY_MORNING', 'AFTERNOON')).toBe(false);
    expect(presetsAdjacent('MORNING', 'EVENING')).toBe(false);
    expect(presetsAdjacent('BRUNCH', 'NIGHT')).toBe(false);
  });

  it('every preset is adjacent to itself + at most 2 others (total 3 max)', () => {
    for (const a of ALL_PRESETS) {
      const matches = ALL_PRESETS.filter((b) => presetsAdjacent(a, b));
      expect(matches.length).toBeGreaterThanOrEqual(2); // self + at least 1 neighbor
      expect(matches.length).toBeLessThanOrEqual(3); // self + at most 2 neighbors
    }
  });
});

// ---------------------------------------------------------------------------
// presetDistance
// ---------------------------------------------------------------------------
describe('presetDistance', () => {
  it('returns 0 for identical presets', () => {
    for (const preset of ALL_PRESETS) {
      expect(presetDistance(preset, preset)).toBe(0);
    }
  });

  it('returns 1 for immediate neighbors (forward direction)', () => {
    expect(presetDistance('EARLY_MORNING', 'MORNING')).toBe(1);
    expect(presetDistance('MORNING', 'BRUNCH')).toBe(1);
    expect(presetDistance('BRUNCH', 'AFTERNOON')).toBe(1);
    expect(presetDistance('AFTERNOON', 'EVENING')).toBe(1);
    expect(presetDistance('EVENING', 'NIGHT')).toBe(1);
  });

  it('returns 1 for immediate neighbors (reverse direction — symmetric)', () => {
    expect(presetDistance('MORNING', 'EARLY_MORNING')).toBe(1);
    expect(presetDistance('NIGHT', 'EVENING')).toBe(1);
    expect(presetDistance('AFTERNOON', 'BRUNCH')).toBe(1);
  });

  it('returns Infinity for presets two steps apart', () => {
    expect(presetDistance('EARLY_MORNING', 'BRUNCH')).toBe(Infinity);
    expect(presetDistance('MORNING', 'AFTERNOON')).toBe(Infinity);
    expect(presetDistance('BRUNCH', 'EVENING')).toBe(Infinity);
    expect(presetDistance('AFTERNOON', 'NIGHT')).toBe(Infinity);
  });

  it('returns Infinity for opposite endpoints', () => {
    expect(presetDistance('EARLY_MORNING', 'NIGHT')).toBe(Infinity);
    expect(presetDistance('NIGHT', 'EARLY_MORNING')).toBe(Infinity);
  });

  it('returns Infinity for presets three steps apart', () => {
    expect(presetDistance('EARLY_MORNING', 'AFTERNOON')).toBe(Infinity);
    expect(presetDistance('MORNING', 'EVENING')).toBe(Infinity);
    expect(presetDistance('BRUNCH', 'NIGHT')).toBe(Infinity);
  });

  it('returns Infinity for an invalid first preset', () => {
    expect(presetDistance('NOT_A_PRESET' as WindowPreset, 'EVENING')).toBe(Infinity);
  });

  it('returns Infinity for an invalid second preset', () => {
    expect(presetDistance('EVENING', 'NOT_A_PRESET' as WindowPreset)).toBe(Infinity);
  });

  it('returns Infinity when both presets are invalid', () => {
    expect(
      presetDistance('FOO' as WindowPreset, 'BAR' as WindowPreset),
    ).toBe(Infinity);
  });

  it('agrees with presetsAdjacent — finite distance iff adjacent', () => {
    for (const a of ALL_PRESETS) {
      for (const b of ALL_PRESETS) {
        const adj = presetsAdjacent(a, b);
        const dist = presetDistance(a, b);
        if (adj) {
          expect(dist).toBeLessThanOrEqual(1);
          expect(Number.isFinite(dist)).toBe(true);
        } else {
          expect(dist).toBe(Infinity);
        }
      }
    }
  });

  it('distance is symmetric across all preset pairs', () => {
    for (const a of ALL_PRESETS) {
      for (const b of ALL_PRESETS) {
        expect(presetDistance(a, b)).toBe(presetDistance(b, a));
      }
    }
  });

  it('R17 collapse — EVENING (focal) prefers EVENING (d=0) over NIGHT (d=1)', () => {
    // The collapse logic uses presetDistance to pick the closest Intent when
    // a single user has hedged with multiple adjacent windows.
    const focalEvening: WindowPreset = 'EVENING';
    expect(presetDistance(focalEvening, 'EVENING')).toBeLessThan(
      presetDistance(focalEvening, 'NIGHT'),
    );
  });

  it('R17 collapse — distances rank candidates correctly', () => {
    // Given focal=BRUNCH, MORNING (d=1) and AFTERNOON (d=1) tie, AFTERNOON > EVENING.
    expect(presetDistance('BRUNCH', 'BRUNCH')).toBe(0);
    expect(presetDistance('BRUNCH', 'MORNING')).toBe(1);
    expect(presetDistance('BRUNCH', 'AFTERNOON')).toBe(1);
    expect(presetDistance('BRUNCH', 'EVENING')).toBe(Infinity);
  });
});
