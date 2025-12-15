export interface CostTier {
  budget: number;
  moderate: number;
  luxury: number;
}

export interface DailyCosts {
  accommodation: number;
  food: number;
  activities: number;
  transportation: number;
  total: number;
}

const ACCOMMODATION_TIERS: CostTier = {
  budget: 50,
  moderate: 150,
  luxury: 300,
};

const FOOD_TIERS: CostTier = {
  budget: 30,
  moderate: 60,
  luxury: 100,
};

const ACTIVITIES_TIERS: CostTier = {
  budget: 20,
  moderate: 50,
  luxury: 100,
};

const TRANSPORTATION_TIERS: CostTier = {
  budget: 10,
  moderate: 30,
  luxury: 60,
};

export type TierType = 'budget' | 'moderate' | 'luxury';

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

export function calculateTripCost(
  numberOfDays: number,
  tier: TierType = 'moderate',
  additionalCosts: number = 0
): number {
  const dailyCosts = calculateDailyCosts(tier);
  return dailyCosts.total * numberOfDays + additionalCosts;
}

export function suggestBudget(
  numberOfDays: number,
  preferredTier: TierType = 'moderate',
  buffer: number = 0.1
): number {
  const baseCost = calculateTripCost(numberOfDays, preferredTier);
  const bufferAmount = baseCost * buffer;
  return Math.ceil(baseCost + bufferAmount);
}

export function calculatePerPersonCost(
  totalCost: number,
  numberOfPeople: number
): number {
  if (numberOfPeople <= 0) {
    throw new Error('Number of people must be greater than 0');
  }
  return Math.ceil(totalCost / numberOfPeople);
}

export function estimateAccommodationCost(
  tier: TierType = 'moderate',
  numberOfNights: number,
  numberOfRooms: number = 1
): number {
  const nightlyRate = ACCOMMODATION_TIERS[tier];
  return nightlyRate * numberOfNights * numberOfRooms;
} 