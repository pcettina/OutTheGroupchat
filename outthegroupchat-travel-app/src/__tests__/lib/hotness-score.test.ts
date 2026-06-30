/**
 * Unit tests for src/lib/hotness/score.ts — the now-real `computeHotnessBoost`.
 *
 * `computeHotnessBoost(input)` is a PURE function (no DB, no baked-in clock):
 * it snaps the venue lat/lng to a BLOCK cell (3-decimal quantization, via
 * `anonymizeCell`), keeps only INTEREST/PRESENCE contributions in that cell
 * within `HOTNESS_CONFIG.rollingWindowHours` of `now`, weights each by a linear
 * time-decay, optionally multiplies Crew-authored rows by `crewWeightFactor`,
 * sums into an effective density, and maps it through a saturating curve into a
 * multiplier in [NEUTRAL_BOOST (1.0), MAX_BOOST (2.5)].
 *
 * The clock is injected explicitly via `input.now` so every test is
 * deterministic (no reliance on real time / fake timers needed).
 *
 * V1 spec references:
 *  - R10: "weight by my Crew" toggle (weightByCrew / viewerCrewIds)
 *  - R13: INTEREST + PRESENCE both feed hotness
 *  - R18: hotness boost applied to venue ranking, saturates at MAX_BOOST
 *  - rollingWindowHours = 6, linear decay (decayCoefficient = 1.0),
 *    crewWeightFactor = 1.5
 */

import { describe, it, expect } from 'vitest';
import { HeatmapContributionType } from '@prisma/client';
import type { HotnessContributionRow } from '@/lib/hotness/score';
import {
  computeHotnessBoost,
  HOTNESS_CONFIG,
  NEUTRAL_BOOST,
  MAX_BOOST,
} from '@/lib/hotness/score';

// A reference "now" — fixed so the rolling window and decay are deterministic.
const NOW = new Date('2026-06-29T22:00:00.000Z');

// BLOCK quantization rounds lat/lng to 3 decimal places. Using coordinates that
// are already clean at 3 decimals means the venue cell and the contribution
// cells coincide exactly. The venue and in-cell contributions all sit at this
// point; the OTHER_* coordinates round to a different 3-decimal cell.
const CELL_LAT = 40.713;
const CELL_LNG = -74.006;
const VENUE_IN_CELL = { latitude: CELL_LAT, longitude: CELL_LNG };

// A coordinate that quantizes to a DIFFERENT block (>= 0.001 away in both axes).
const OTHER_LAT = 41.5;
const OTHER_LNG = -73.5;

/** Build a contribution `ageHours` before NOW, in the venue's cell by default. */
function contribution(
  overrides: Partial<HotnessContributionRow> & { ageHours?: number } = {},
): HotnessContributionRow {
  const { ageHours = 0, ...rest } = overrides;
  return {
    userId: 'u1',
    type: HeatmapContributionType.INTEREST,
    cellLat: CELL_LAT,
    cellLng: CELL_LNG,
    createdAt: new Date(NOW.getTime() - ageHours * 60 * 60 * 1000),
    ...rest,
  };
}

describe('computeHotnessBoost', () => {
  describe('1. empty-cell neutral', () => {
    it('returns exactly NEUTRAL_BOOST with no contributions', () => {
      const boost = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [],
        now: NOW,
      });
      expect(boost).toBe(NEUTRAL_BOOST);
      expect(boost).toBe(1.0);
    });

    it('returns NEUTRAL_BOOST when all contributions are in a different cell', () => {
      const boost = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [
          contribution({ ageHours: 0, cellLat: OTHER_LAT, cellLng: OTHER_LNG }),
          contribution({ ageHours: 1, cellLat: OTHER_LAT, cellLng: OTHER_LNG }),
        ],
        now: NOW,
      });
      expect(boost).toBe(NEUTRAL_BOOST);
    });

    it('returns NEUTRAL_BOOST when the venue has no geo (null lat/lng)', () => {
      const boost = computeHotnessBoost({
        venue: { latitude: null, longitude: null },
        contributions: [contribution({ ageHours: 0 })],
        now: NOW,
      });
      expect(boost).toBe(NEUTRAL_BOOST);
    });
  });

  describe('2. hot cell', () => {
    it('returns > 1.0 and <= MAX_BOOST for several recent in-cell contributions', () => {
      const contributions = [
        contribution({ ageHours: 0, type: HeatmapContributionType.INTEREST }),
        contribution({ ageHours: 0.5, type: HeatmapContributionType.PRESENCE }),
        contribution({ ageHours: 1, type: HeatmapContributionType.INTEREST }),
        contribution({ ageHours: 2, type: HeatmapContributionType.PRESENCE }),
      ];
      const boost = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions,
        now: NOW,
      });
      expect(boost).toBeGreaterThan(1.0);
      expect(boost).toBeLessThanOrEqual(MAX_BOOST);
    });

    it('counts both INTEREST and PRESENCE (R13)', () => {
      const interestOnly = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [contribution({ type: HeatmapContributionType.INTEREST })],
        now: NOW,
      });
      const presenceOnly = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [contribution({ type: HeatmapContributionType.PRESENCE })],
        now: NOW,
      });
      expect(interestOnly).toBeGreaterThan(1.0);
      expect(presenceOnly).toBeGreaterThan(1.0);
      // Type does not change the weight — only recency / crew do.
      expect(presenceOnly).toBe(interestOnly);
    });
  });

  describe('3. monotonic in density', () => {
    it('more in-cell recent contributions yield a non-decreasing boost', () => {
      const boostFor = (count: number) =>
        computeHotnessBoost({
          venue: VENUE_IN_CELL,
          contributions: Array.from({ length: count }, (_, i) =>
            // all fresh (ageHours 0) so only count varies
            contribution({ ageHours: 0, userId: `u${i}` }),
          ),
          now: NOW,
        });

      const b1 = boostFor(1);
      const b3 = boostFor(3);
      const b8 = boostFor(8);
      expect(b3).toBeGreaterThanOrEqual(b1);
      expect(b8).toBeGreaterThanOrEqual(b3);
      // Strictly increasing here since the curve is not yet saturated.
      expect(b3).toBeGreaterThan(b1);
      expect(b8).toBeGreaterThan(b3);
    });
  });

  describe('4. window cutoff', () => {
    it('ignores contributions older than rollingWindowHours -> NEUTRAL_BOOST', () => {
      const stale = HOTNESS_CONFIG.rollingWindowHours + 1; // 7h ago, outside 6h window
      const boost = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [
          contribution({ ageHours: stale }),
          contribution({ ageHours: stale + 5, userId: 'u2' }),
          contribution({ ageHours: stale + 10, userId: 'u3' }),
        ],
        now: NOW,
      });
      expect(boost).toBe(NEUTRAL_BOOST);
    });

    it('a contribution exactly at the window edge contributes no weight', () => {
      const boost = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [contribution({ ageHours: HOTNESS_CONFIG.rollingWindowHours })],
        now: NOW,
      });
      // decayWeight at full window = 0 -> filtered out -> neutral.
      expect(boost).toBe(NEUTRAL_BOOST);
    });
  });

  describe('5. linear decay', () => {
    it('a fresh contribution yields a higher boost than the same aged one', () => {
      const fresh = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [contribution({ ageHours: 0 })],
        now: NOW,
      });
      const aged = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions: [contribution({ ageHours: 3 })], // halfway through the 6h window
        now: NOW,
      });
      expect(fresh).toBeGreaterThan(aged);
      // Both still above neutral (the aged row is in-window).
      expect(aged).toBeGreaterThan(1.0);
    });
  });

  describe('6. crew weighting (R10)', () => {
    it('weightByCrew=true with matching viewerCrewIds boosts >= weightByCrew=false', () => {
      const contributions = [
        contribution({ ageHours: 0, userId: 'crew-a' }),
        contribution({ ageHours: 0.5, userId: 'crew-b' }),
        contribution({ ageHours: 1, userId: 'crew-c' }),
      ];
      const withCrew = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions,
        weightByCrew: true,
        viewerCrewIds: ['crew-a', 'crew-b', 'crew-c'],
        now: NOW,
      });
      const withoutCrew = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions,
        weightByCrew: false,
        now: NOW,
      });
      // crewWeightFactor (1.5) > 1 raises effective density -> boost cannot demote.
      expect(withCrew).toBeGreaterThanOrEqual(withoutCrew);
      expect(withCrew).toBeGreaterThan(withoutCrew);
      expect(withCrew).toBeLessThanOrEqual(MAX_BOOST);
    });

    it('non-Crew contributors are unaffected by the weightByCrew toggle', () => {
      const contributions = [contribution({ ageHours: 0, userId: 'stranger' })];
      const withCrew = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions,
        weightByCrew: true,
        viewerCrewIds: ['crew-a'], // does not include 'stranger'
        now: NOW,
      });
      const withoutCrew = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions,
        weightByCrew: false,
        now: NOW,
      });
      expect(withCrew).toBe(withoutCrew);
    });
  });

  describe('7. clamp at MAX_BOOST', () => {
    it('a very dense cell saturates at <= MAX_BOOST', () => {
      const contributions = Array.from({ length: 5000 }, (_, i) =>
        contribution({ ageHours: 0, userId: `u${i}` }),
      );
      const boost = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions,
        now: NOW,
      });
      expect(boost).toBeGreaterThan(1.0);
      expect(boost).toBeLessThanOrEqual(MAX_BOOST);
      // Saturating curve approaches but never exceeds the cap.
      expect(boost).toBeCloseTo(MAX_BOOST, 2);
    });

    it('even crew-weighted dense input never exceeds MAX_BOOST', () => {
      const ids = Array.from({ length: 2000 }, (_, i) => `crew-${i}`);
      const contributions = ids.map((id) => contribution({ ageHours: 0, userId: id }));
      const boost = computeHotnessBoost({
        venue: VENUE_IN_CELL,
        contributions,
        weightByCrew: true,
        viewerCrewIds: ids,
        now: NOW,
      });
      expect(boost).toBeLessThanOrEqual(MAX_BOOST);
    });
  });

  describe('8. non-counted types', () => {
    it('SKIPPED: the HeatmapContributionType enum only has INTEREST and PRESENCE', () => {
      // The Prisma `HeatmapContributionType` enum contains exactly INTEREST and
      // PRESENCE, both of which feed hotness (R13). There is no third, non-counted
      // value to construct under TypeScript strict mode, so this case is a no-op.
      // Documenting the enum shape so a future enum addition flags this gap.
      const values = Object.values(HeatmapContributionType);
      expect(new Set(values)).toEqual(new Set(['INTEREST', 'PRESENCE']));
    });
  });

  describe('config / bounds sanity', () => {
    it('NEUTRAL_BOOST is 1.0 and MAX_BOOST is 2.5', () => {
      expect(NEUTRAL_BOOST).toBe(1.0);
      expect(MAX_BOOST).toBe(2.5);
    });

    it('every returned boost stays within [NEUTRAL_BOOST, MAX_BOOST]', () => {
      for (let count = 0; count <= 30; count++) {
        const boost = computeHotnessBoost({
          venue: VENUE_IN_CELL,
          contributions: Array.from({ length: count }, (_, i) =>
            contribution({ ageHours: i % HOTNESS_CONFIG.rollingWindowHours, userId: `u${i}` }),
          ),
          now: NOW,
        });
        expect(boost).toBeGreaterThanOrEqual(NEUTRAL_BOOST);
        expect(boost).toBeLessThanOrEqual(MAX_BOOST);
      }
    });
  });
});
