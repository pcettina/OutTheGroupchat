/**
 * Unit tests for src/lib/hotness/score.ts.
 *
 * Phase 3 contract: `computeHotnessBoost` returns 1.0 for every venue
 * (neutral boost). These tests pin that contract and also pin the shape of
 * the re-exported `HOTNESS_CONFIG` tuning surface so Phase 4 (heatmap)
 * cannot silently drift the call-site contract.
 *
 * V1 spec references:
 *  - R10: "weight by my Crew" toggle (HotnessContext.weightByCrew)
 *  - R18: hotness boost applied to venue ranking in recommendations
 *  - rollingWindowHours = 6 (tonight's behavior, not yesterday's)
 *  - linear decay (decayCoefficient = 1.0)
 *  - crewWeightFactor = 1.5 (50% boost when Crew weighting is enabled)
 */

import { describe, it, expect } from 'vitest';
import type { HotnessContext, HotnessBoost } from '@/lib/hotness/score';
import { computeHotnessBoost, HOTNESS_CONFIG } from '@/lib/hotness/score';

describe('computeHotnessBoost (Phase 3 stub)', () => {
  describe('neutral baseline contract', () => {
    it('returns 1.0 for a basic context with only viewerId', () => {
      expect(computeHotnessBoost('venue-1', { viewerId: 'u1' })).toBe(1.0);
    });

    it('returns exactly 1.0 (not 1, not 0.999...) — numeric identity matters for downstream multiplication', () => {
      const result = computeHotnessBoost('venue-x', { viewerId: 'viewer-x' });
      expect(result).toBe(1.0);
      expect(result).toBe(1);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('returns a HotnessBoost (number) type', () => {
      const result: HotnessBoost = computeHotnessBoost('v', { viewerId: 'u' });
      expect(typeof result).toBe('number');
    });

    it('returns 1.0 regardless of venueId (empty, long, special chars)', () => {
      expect(computeHotnessBoost('', { viewerId: 'u1' })).toBe(1.0);
      expect(computeHotnessBoost('v'.repeat(500), { viewerId: 'u1' })).toBe(1.0);
      expect(computeHotnessBoost('venue/with::weird@chars', { viewerId: 'u1' })).toBe(1.0);
    });

    it('returns 1.0 regardless of viewerId', () => {
      expect(computeHotnessBoost('v1', { viewerId: 'u1' })).toBe(1.0);
      expect(computeHotnessBoost('v1', { viewerId: 'u2' })).toBe(1.0);
      expect(computeHotnessBoost('v1', { viewerId: '' })).toBe(1.0);
    });
  });

  describe('optional HotnessContext fields', () => {
    it('returns 1.0 when cityArea is provided', () => {
      expect(
        computeHotnessBoost('venue-2', {
          viewerId: 'u1',
          cityArea: 'east-village',
        }),
      ).toBe(1.0);
    });

    it('returns 1.0 when cityArea is null (explicit null is a valid narrowing)', () => {
      expect(
        computeHotnessBoost('venue-2', {
          viewerId: 'u1',
          cityArea: null,
        }),
      ).toBe(1.0);
    });

    it('returns 1.0 when cityArea is undefined', () => {
      expect(
        computeHotnessBoost('venue-2', {
          viewerId: 'u1',
          cityArea: undefined,
        }),
      ).toBe(1.0);
    });

    it('returns 1.0 when weightByCrew is true (R10 toggle on)', () => {
      expect(
        computeHotnessBoost('venue-3', {
          viewerId: 'u1',
          weightByCrew: true,
        }),
      ).toBe(1.0);
    });

    it('returns 1.0 when weightByCrew is false (R10 toggle off)', () => {
      expect(
        computeHotnessBoost('venue-3', {
          viewerId: 'u1',
          weightByCrew: false,
        }),
      ).toBe(1.0);
    });

    it('returns 1.0 with the fully populated context', () => {
      const ctx: HotnessContext = {
        viewerId: 'u1',
        cityArea: 'soho',
        weightByCrew: true,
      };
      expect(computeHotnessBoost('venue-full', ctx)).toBe(1.0);
    });
  });

  describe('stability across many calls (Phase 4 will replace this)', () => {
    it('is deterministic: calling twice with the same args returns the same value', () => {
      const a = computeHotnessBoost('venue-1', { viewerId: 'u1' });
      const b = computeHotnessBoost('venue-1', { viewerId: 'u1' });
      expect(a).toBe(b);
    });

    it('is independent of call order — no hidden state between venues', () => {
      const first = computeHotnessBoost('a', { viewerId: 'u1' });
      computeHotnessBoost('b', { viewerId: 'u1' });
      computeHotnessBoost('c', { viewerId: 'u1' });
      const firstAgain = computeHotnessBoost('a', { viewerId: 'u1' });
      expect(firstAgain).toBe(first);
    });

    it('returns 1.0 across 100 random venue/viewer pairs', () => {
      for (let i = 0; i < 100; i++) {
        const venue = `venue-${i}`;
        const viewer = `user-${i % 10}`;
        expect(computeHotnessBoost(venue, { viewerId: viewer })).toBe(1.0);
      }
    });

    it('return value is safe to multiply into a base relevance score (identity element)', () => {
      const baseScore = 0.87;
      const boosted = baseScore * computeHotnessBoost('v', { viewerId: 'u' });
      expect(boosted).toBe(baseScore);
    });
  });

  describe('HOTNESS_CONFIG re-export', () => {
    it('re-exports the tuning config so callers only need this module', () => {
      expect(HOTNESS_CONFIG).toBeDefined();
      expect(typeof HOTNESS_CONFIG).toBe('object');
    });

    it('exposes rollingWindowHours = 6 (V1 spec: tonight, not yesterday)', () => {
      expect(HOTNESS_CONFIG.rollingWindowHours).toBe(6);
    });

    it('exposes decayCoefficient = 1.0 (V1 spec: linear decay)', () => {
      expect(HOTNESS_CONFIG.decayCoefficient).toBe(1.0);
    });

    it('exposes crewWeightFactor = 1.5 (V1 spec: 50% boost when R10 toggle on)', () => {
      expect(HOTNESS_CONFIG.crewWeightFactor).toBe(1.5);
    });

    it('crewWeightFactor is > 1.0 so enabling R10 cannot demote a venue', () => {
      expect(HOTNESS_CONFIG.crewWeightFactor).toBeGreaterThan(1.0);
    });

    it('rollingWindowHours is positive (a zero-hour window would short-circuit the signal)', () => {
      expect(HOTNESS_CONFIG.rollingWindowHours).toBeGreaterThan(0);
    });
  });
});
