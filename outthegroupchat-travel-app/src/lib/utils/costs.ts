/**
 * Represents a set of cost values segmented by spending level.
 * Used to define per-category pricing across budget, moderate, and luxury tiers.
 */
export interface CostTier {
  /** Cost for budget-conscious travelers, in USD per day or per unit. */
  budget: number;
  /** Cost for mid-range travelers, in USD per day or per unit. */
  moderate: number;
  /** Cost for luxury travelers, in USD per day or per unit. */
  luxury: number;
}

/**
 * Breakdown of estimated daily travel expenses across major spending categories.
 * All values are in USD.
 */
export interface DailyCosts {
  /** Estimated daily accommodation cost in USD (hotel, hostel, rental, etc.). */
  accommodation: number;
  /** Estimated daily food and dining cost in USD. */
  food: number;
  /** Estimated daily activities and entertainment cost in USD. */
  activities: number;
  /** Estimated daily local transportation cost in USD (transit, rideshare, etc.). */
  transportation: number;
  /** Sum of all per-category daily costs in USD. */
  total: number;
}

/** Nightly accommodation rate in USD by spending tier (budget: $50, moderate: $150, luxury: $300). */
const ACCOMMODATION_TIERS: CostTier = {
  budget: 50,
  moderate: 150,
  luxury: 300,
};

/** Daily food and dining cost in USD by spending tier (budget: $30, moderate: $60, luxury: $100). */
const FOOD_TIERS: CostTier = {
  budget: 30,
  moderate: 60,
  luxury: 100,
};

/** Daily activities and entertainment cost in USD by spending tier (budget: $20, moderate: $50, luxury: $100). */
const ACTIVITIES_TIERS: CostTier = {
  budget: 20,
  moderate: 50,
  luxury: 100,
};

/** Daily local transportation cost in USD by spending tier (budget: $10, moderate: $30, luxury: $60). */
const TRANSPORTATION_TIERS: CostTier = {
  budget: 10,
  moderate: 30,
  luxury: 60,
};

/**
 * Union type representing the three available spending tiers for cost calculations.
 * - `'budget'` — low-cost options (hostels, street food, free activities)
 * - `'moderate'` — mid-range options (3-star hotels, casual restaurants, paid attractions)
 * - `'luxury'` — premium options (5-star hotels, fine dining, exclusive experiences)
 */
export type TierType = 'budget' | 'moderate' | 'luxury';

/**
 * Returns estimated daily travel costs broken down by category for a given spending tier.
 *
 * @param tier - The budget tier to use for cost estimates: `'budget'`, `'moderate'`, or `'luxury'` (default: `'moderate'`).
 * @returns A `DailyCosts` object with per-day costs for accommodation, food, activities, transportation, and a total.
 *
 * @example
 * const costs = calculateDailyCosts('budget');
 * // { accommodation: 50, food: 30, activities: 20, transportation: 10, total: 110 }
 */
export function calculateDailyCosts(tier: TierType = 'moderate'): DailyCosts {
  const accommodation = ACCOMMODATION_TIERS[tier];
  const food = FOOD_TIERS[tier];
  const activities = ACTIVITIES_TIERS[tier];
  const transportation = TRANSPORTATION_TIERS[tier];

  return {
    accommodation,
    food,
    activities,
    transportation,
    total: accommodation + food + activities + transportation,
  };
}

/**
 * Calculates the total estimated cost for a trip based on duration, spending tier, and any additional expenses.
 *
 * @param numberOfDays - The number of days the trip will last.
 * @param tier - The budget tier to use for daily cost estimates (default: `'moderate'`).
 * @param additionalCosts - One-time or miscellaneous costs to add on top of daily totals, e.g. flights (default: `0`).
 * @returns The total estimated trip cost in USD.
 *
 * @example
 * const total = calculateTripCost(7, 'moderate', 500);
 * // 7 days × $290/day + $500 = $2530
 */
export function calculateTripCost(
  numberOfDays: number,
  tier: TierType = 'moderate',
  additionalCosts: number = 0
): number {
  const dailyCosts = calculateDailyCosts(tier);
  return dailyCosts.total * numberOfDays + additionalCosts;
}

/**
 * Suggests a recommended total trip budget by adding a contingency buffer to the base trip cost.
 * The result is rounded up to the nearest whole dollar to avoid under-budgeting.
 *
 * @param numberOfDays - The number of days the trip will last.
 * @param preferredTier - The budget tier to base the estimate on (default: `'moderate'`).
 * @param buffer - Fractional buffer to add as a contingency, e.g. `0.1` for 10% (default: `0.1`).
 * @returns The suggested total budget in USD, rounded up to the nearest dollar.
 *
 * @example
 * const budget = suggestBudget(5, 'budget', 0.15);
 * // Math.ceil($550 base × 1.15) = $633
 */
export function suggestBudget(
  numberOfDays: number,
  preferredTier: TierType = 'moderate',
  buffer: number = 0.1
): number {
  const baseCost = calculateTripCost(numberOfDays, preferredTier);
  const bufferAmount = baseCost * buffer;
  return Math.ceil(baseCost + bufferAmount);
}

/**
 * Divides a total trip cost evenly among a group, rounding each person's share up to the nearest dollar.
 * Throws if `numberOfPeople` is zero or negative.
 *
 * @param totalCost - The total trip cost in USD to split among the group.
 * @param numberOfPeople - The number of people sharing the cost. Must be greater than 0.
 * @returns The per-person cost in USD, rounded up to the nearest dollar.
 * @throws {Error} If `numberOfPeople` is less than or equal to 0.
 *
 * @example
 * const share = calculatePerPersonCost(1000, 3);
 * // Math.ceil(1000 / 3) = 334
 */
export function calculatePerPersonCost(
  totalCost: number,
  numberOfPeople: number
): number {
  if (numberOfPeople <= 0) {
    throw new Error('Number of people must be greater than 0');
  }
  return Math.ceil(totalCost / numberOfPeople);
}

/**
 * Estimates the total accommodation cost for a stay based on spending tier, duration, and number of rooms.
 *
 * @param tier - The budget tier that determines the nightly room rate (default: `'moderate'`).
 * @param numberOfNights - The number of nights to stay.
 * @param numberOfRooms - The number of rooms to book (default: `1`).
 * @returns The total estimated accommodation cost in USD.
 *
 * @example
 * const cost = estimateAccommodationCost('luxury', 3, 2);
 * // $300/night × 3 nights × 2 rooms = $1800
 */
export function estimateAccommodationCost(
  tier: TierType = 'moderate',
  numberOfNights: number,
  numberOfRooms: number = 1
): number {
  const nightlyRate = ACCOMMODATION_TIERS[tier];
  return nightlyRate * numberOfNights * numberOfRooms;
} 