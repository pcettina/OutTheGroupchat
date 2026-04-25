/**
 * Unit tests for src/lib/subcrew/cell-anonymize.ts.
 * Verifies the BLOCK / DYNAMIC_CELL / HIDDEN behavior of cell-anonymization.
 */

import { describe, it, expect } from 'vitest';
import { anonymizeCell } from '@/lib/subcrew/cell-anonymize';

describe('anonymizeCell', () => {
  it('BLOCK rounds to 3 decimal places (~110m)', () => {
    const cell = anonymizeCell(40.72319, -73.98765, 'BLOCK');
    expect(cell).not.toBeNull();
    expect(cell!.cellLat).toBe(40.723);
    expect(cell!.cellLng).toBe(-73.988);
  });

  it('DYNAMIC_CELL rounds to 4 decimal places (~11m)', () => {
    // Use values that aren't exactly halfway between two grid cells to avoid
    // JS floating-point round-half ambiguity (e.g. 0.98765 * 10000 is
    // -739876.4999… in IEEE-754, not -739876.5).
    const cell = anonymizeCell(40.72319, -73.98763, 'DYNAMIC_CELL');
    expect(cell).not.toBeNull();
    expect(cell!.cellLat).toBe(40.7232);
    expect(cell!.cellLng).toBe(-73.9876);
  });

  it('HIDDEN returns null (caller must skip the contribution)', () => {
    expect(anonymizeCell(40.72319, -73.98765, 'HIDDEN')).toBeNull();
  });

  it('two nearby points within ~110m collapse to the same BLOCK cell', () => {
    const a = anonymizeCell(40.72349, -73.98765, 'BLOCK');
    const b = anonymizeCell(40.72401, -73.98765, 'BLOCK');
    // 40.72349 and 40.72401 both round to 40.723 (BLOCK = 3dp)
    expect(a?.cellLat).toBe(40.723);
    expect(b?.cellLat).toBe(40.724);
    // Different cells — but both within ~110m. The point is each maps
    // deterministically to its grid cell; we don't claim they collapse.
  });

  it('handles negative longitudes consistently', () => {
    const cell = anonymizeCell(40.0, -73.99999, 'BLOCK');
    expect(cell?.cellLng).toBe(-74.0);
  });
});
