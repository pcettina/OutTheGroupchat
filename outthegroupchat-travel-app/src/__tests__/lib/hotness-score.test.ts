/**
 * Unit tests for src/lib/hotness/score.ts.
 *
 * Phase 3 contract: returns 1.0 for every venue (neutral boost). When Phase 4
 * wires the real signal, these tests get expanded to assert the actual
 * multiplier math.
 */

import { describe, it, expect } from 'vitest';
import { computeHotnessBoost, HOTNESS_CONFIG } from '@/lib/hotness/score';

describe('computeHotnessBoost (Phase 3 stub)', () => {
  it('returns 1.0 (no boost) for any venue', () => {
    expect(computeHotnessBoost('venue-1', { viewerId: 'u1' })).toBe(1.0);
    expect(
      computeHotnessBoost('venue-2', {
        viewerId: 'u1',
        cityArea: 'east-village',
        weightByCrew: true,
      }),
    ).toBe(1.0);
  });

  it('exports the tuning config so callers only need this module', () => {
    expect(HOTNESS_CONFIG.rollingWindowHours).toBe(6);
    expect(HOTNESS_CONFIG.crewWeightFactor).toBe(1.5);
  });
});
