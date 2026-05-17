/**
 * Unit tests for src/lib/utils/costs.ts.
 *
 * Covers every exported function:
 *   - calculateDailyCosts(tier)
 *   - calculateTripCost(numberOfDays, tier, additionalCosts)
 *   - suggestBudget(numberOfDays, preferredTier, buffer)
 *   - calculatePerPersonCost(totalCost, numberOfPeople)
 *   - estimateAccommodationCost(tier, numberOfNights, numberOfRooms)
 *
 * Tier constants from costs.ts (verified at write time):
 *   accommodation budget/moderate/luxury = 50 / 150 / 300
 *   food                                 = 30 / 60  / 100
 *   activities                           = 20 / 50  / 100
 *   transportation                       = 10 / 30  / 60
 *   per-day totals                       = 110 / 290 / 560
 */

import { describe, it, expect } from 'vitest';
import {
  calculateDailyCosts,
  calculateTripCost,
  suggestBudget,
  calculatePerPersonCost,
  estimateAccommodationCost,
} from '@/lib/utils/costs';

describe('calculateDailyCosts', () => {
  it('returns budget-tier per-category costs with correct total', () => {
    const costs = calculateDailyCosts('budget');
    expect(costs).toEqual({
      accommodation: 50,
      food: 30,
      activities: 20,
      transportation: 10,
      total: 110,
    });
  });

  it('returns moderate-tier per-category costs with correct total', () => {
    const costs = calculateDailyCosts('moderate');
    expect(costs).toEqual({
      accommodation: 150,
      food: 60,
      activities: 50,
      transportation: 30,
      total: 290,
    });
  });

  it('returns luxury-tier per-category costs with correct total', () => {
    const costs = calculateDailyCosts('luxury');
    expect(costs).toEqual({
      accommodation: 300,
      food: 100,
      activities: 100,
      transportation: 60,
      total: 560,
    });
  });

  it('defaults to moderate tier when no argument is provided', () => {
    expect(calculateDailyCosts()).toEqual(calculateDailyCosts('moderate'));
  });

  it('total is the sum of the four per-category fields', () => {
    const costs = calculateDailyCosts('luxury');
    expect(costs.total).toBe(
      costs.accommodation + costs.food + costs.activities + costs.transportation,
    );
  });
});

describe('calculateTripCost', () => {
  it('multiplies daily total by numberOfDays for moderate tier', () => {
    // 7 days × $290/day = $2030
    expect(calculateTripCost(7, 'moderate')).toBe(2030);
  });

  it('adds additionalCosts on top of the per-day subtotal', () => {
    // 7 × 290 + 500 = 2530
    expect(calculateTripCost(7, 'moderate', 500)).toBe(2530);
  });

  it('defaults to moderate tier and zero additional costs', () => {
    // 3 × 290 = 870
    expect(calculateTripCost(3)).toBe(870);
  });

  it('returns 0 when numberOfDays is 0 and no additional costs', () => {
    expect(calculateTripCost(0, 'budget')).toBe(0);
  });

  it('returns only additional costs when numberOfDays is 0', () => {
    expect(calculateTripCost(0, 'luxury', 250)).toBe(250);
  });

  it('handles budget tier across multiple days', () => {
    // 5 × 110 = 550
    expect(calculateTripCost(5, 'budget')).toBe(550);
  });

  it('handles luxury tier across multiple days with extras', () => {
    // 10 × 560 + 1200 = 6800
    expect(calculateTripCost(10, 'luxury', 1200)).toBe(6800);
  });

  it('handles a single-day trip', () => {
    // 1 × 290 = 290
    expect(calculateTripCost(1, 'moderate')).toBe(290);
  });

  it('handles negative numberOfDays arithmetically (no guard in implementation)', () => {
    // Document existing behavior: -2 × 290 = -580
    expect(calculateTripCost(-2, 'moderate')).toBe(-580);
  });
});

describe('suggestBudget', () => {
  it('applies the default 10% buffer and rounds up', () => {
    // base = 5 × 290 = 1450 ; +10% = 1595 ; Math.ceil(1595) = 1595
    expect(suggestBudget(5, 'moderate')).toBe(1595);
  });

  it('honors a custom buffer fraction and rounds up to the nearest dollar', () => {
    // base = 5 × 110 = 550 ; ×1.15 = 632.5 ; Math.ceil → 633
    expect(suggestBudget(5, 'budget', 0.15)).toBe(633);
  });

  it('defaults to moderate tier when tier is omitted', () => {
    // 3 × 290 = 870 ; ×1.1 = 957 ; Math.ceil → 957
    expect(suggestBudget(3)).toBe(957);
  });

  it('returns 0 when numberOfDays is 0', () => {
    expect(suggestBudget(0, 'luxury', 0.25)).toBe(0);
  });

  it('returns the base cost when buffer is 0', () => {
    // 4 × 290 = 1160 ; ×1.0 = 1160
    expect(suggestBudget(4, 'moderate', 0)).toBe(1160);
  });

  it('rounds up fractional buffer amounts', () => {
    // 1 × 110 = 110 ; ×1.07 = 117.7 ; Math.ceil → 118
    expect(suggestBudget(1, 'budget', 0.07)).toBe(118);
  });

  it('handles luxury tier with sizable buffer', () => {
    // 7 × 560 = 3920 ; ×1.2 = 4704
    expect(suggestBudget(7, 'luxury', 0.2)).toBe(4704);
  });

  it('returns an integer (rounded up) even when arithmetic produces a fraction', () => {
    const result = suggestBudget(2, 'moderate', 0.13);
    expect(Number.isInteger(result)).toBe(true);
    // 2 × 290 = 580 ; ×1.13 = 655.4 ; Math.ceil → 656
    expect(result).toBe(656);
  });
});

describe('calculatePerPersonCost', () => {
  it('divides evenly when total is a multiple of group size', () => {
    expect(calculatePerPersonCost(900, 3)).toBe(300);
  });

  it('rounds non-evenly-divisible totals up to the nearest dollar', () => {
    // 1000 / 3 = 333.33... → 334
    expect(calculatePerPersonCost(1000, 3)).toBe(334);
  });

  it('returns the full total when there is only 1 person', () => {
    expect(calculatePerPersonCost(750, 1)).toBe(750);
  });

  it('returns 0 when totalCost is 0', () => {
    expect(calculatePerPersonCost(0, 5)).toBe(0);
  });

  it('throws when numberOfPeople is 0', () => {
    expect(() => calculatePerPersonCost(500, 0)).toThrow(
      'Number of people must be greater than 0',
    );
  });

  it('throws when numberOfPeople is negative', () => {
    expect(() => calculatePerPersonCost(500, -2)).toThrow(
      'Number of people must be greater than 0',
    );
  });

  it('always returns an integer', () => {
    const result = calculatePerPersonCost(101, 4);
    expect(Number.isInteger(result)).toBe(true);
    // 101 / 4 = 25.25 → 26
    expect(result).toBe(26);
  });
});

describe('estimateAccommodationCost', () => {
  it('multiplies nightly rate by nights for default single room', () => {
    // moderate: $150 × 5 nights × 1 room = $750
    expect(estimateAccommodationCost('moderate', 5)).toBe(750);
  });

  it('multiplies by numberOfRooms when more than one room', () => {
    // luxury: $300 × 3 × 2 = $1800
    expect(estimateAccommodationCost('luxury', 3, 2)).toBe(1800);
  });

  it('applies budget-tier nightly rate', () => {
    // $50 × 7 × 1 = $350
    expect(estimateAccommodationCost('budget', 7)).toBe(350);
  });

  it('returns 0 when numberOfNights is 0', () => {
    expect(estimateAccommodationCost('luxury', 0, 3)).toBe(0);
  });

  it('returns 0 when numberOfRooms is 0', () => {
    expect(estimateAccommodationCost('moderate', 4, 0)).toBe(0);
  });

  it('scales linearly with both nights and rooms', () => {
    // budget: $50 × 10 × 4 = $2000
    expect(estimateAccommodationCost('budget', 10, 4)).toBe(2000);
  });

  it('defaults numberOfRooms to 1 when omitted', () => {
    // moderate: $150 × 2 × 1 = $300
    expect(estimateAccommodationCost('moderate', 2)).toBe(300);
  });
});
