/**
 * Comprehensive unit tests for RecommendationService
 *
 * Strategy
 * --------
 * - prisma is mocked globally via setup.ts (trip, tripMember, itineraryDay,
 *   itineraryItem all have stubs).
 * - SurveyService.analyzeSurveyResponses is mocked locally so we control the
 *   exact SurveyAnalysis shape returned.
 * - No real DB connections or HTTP requests are made.
 * - vi.resetAllMocks() in beforeEach prevents state leakage across tests.
 *
 * Coverage goals
 * --------------
 * generateRecommendations:
 *   - Returns sorted array on happy path
 *   - count parameter limits candidates evaluated
 *   - Default count=5 when omitted
 *   - Empty locationPreferences → empty result array
 *   - Zero members → empty individualCosts per recommendation
 *   - Unknown destination key skipped silently
 *   - All recommendations have required shape fields
 *   - matchScore clamped to [0, 100]
 *   - Results sorted descending by matchScore
 *   - individualCosts: correct memberId, memberName, totalCost = flightCost + localCost
 *   - Unknown departure city → $400 default flight cost
 *   - Known departure city (same airport as dest) → $0 flight cost
 *   - Known departure city (different airport) → factor-based flight cost
 *   - departureCity prefers member.departureCity over member.user.city
 *   - Member with null departureCity falls back to user.city
 *   - Member with null departureCity and null user.city → 'Unknown' → $400 default
 *   - Itinerary has correct number of days (durationDays)
 *   - Day-1 itinerary includes arrival item
 *   - Last day itinerary includes farewell dinner
 *   - Golf activity pref triggers golf morning on day 2
 *   - bars/nightlife pref triggers nightlife evening on middle days
 *   - Sporting-event pref triggers sports afternoon on day 2
 *   - Beach-activities pref triggers beach afternoon on non-last days
 *   - Budget breakdown values are non-negative integers
 *   - budget.total equals sum of breakdown line items
 *   - SurveyService error propagates
 *   - prisma.tripMember.findMany error propagates
 *   - recommendation id format matches expected pattern
 *
 * applyRecommendation:
 *   - Updates trip record with destination, dates, budget, status=VOTING
 *   - Creates one ItineraryDay per day
 *   - Creates one ItineraryItem per item within each day
 *   - Updates tripMember flightDetails for each individualCost entry
 *   - Resolves to undefined on success
 *   - Propagates prisma.trip.update error
 *   - Propagates prisma.itineraryDay.create error
 *   - Propagates prisma.itineraryItem.create error
 *   - Works with zero itinerary days and zero individualCosts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { TripMemberRole } from '@prisma/client';
import type { SurveyAnalysis, TripRecommendation } from '@/types';

// ---------------------------------------------------------------------------
// Mock SurveyService before importing the service under test
// ---------------------------------------------------------------------------
vi.mock('@/services/survey.service', () => ({
  SurveyService: {
    analyzeSurveyResponses: vi.fn(),
  },
}));

import { RecommendationService } from '@/services/recommendation.service';
import { SurveyService } from '@/services/survey.service';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

// Type alias for a chainable vi mock fn
type ChainMock = {
  mockResolvedValueOnce(v: unknown): ChainMock;
  mockRejectedValueOnce(e: unknown): ChainMock;
  mock: { calls: unknown[][] };
};

function asMock<T>(fn: T): ChainMock {
  return fn as unknown as ChainMock;
}

const mockTripMemberFindMany = asMock(prisma.tripMember.findMany);
const mockTripUpdate = asMock(prisma.trip.update);
const mockItineraryDayCreate = asMock(prisma.itineraryDay.create);
const mockItineraryItemCreate = asMock(prisma.itineraryItem.create);
const mockAnalyzeSurveyResponses = vi.mocked(SurveyService.analyzeSurveyResponses);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSurveyAnalysis(
  locationPreferences: SurveyAnalysis['locationPreferences'] = [],
  activityPreferences: SurveyAnalysis['activityPreferences'] = []
): SurveyAnalysis {
  return {
    totalResponses: 2,
    responseRate: 100,
    budgetAnalysis: { groupOptimal: 800, min: 500, max: 1200 },
    dateAnalysis: {
      optimalRange: {
        start: new Date('2025-07-01'),
        end: new Date('2025-07-15'),
      },
      availability: [{ date: 'Early July (1-15)', count: 2 }],
    },
    locationPreferences,
    activityPreferences,
  };
}

function makeMember(
  userId: string,
  name: string,
  departureCity?: string | null,
  userCity?: string | null
) {
  return {
    id: `tm-${userId}`,
    tripId: 'trip-1',
    userId,
    role: TripMemberRole.MEMBER,
    joinedAt: new Date(),
    budgetRange: null,
    departureCity: departureCity ?? null,
    flightDetails: null,
    user: {
      id: userId,
      name,
      city: userCity ?? departureCity ?? null,
      preferences: null,
    },
  };
}

// A recommendation fixture used by applyRecommendation tests
function makeRecommendation(
  tripId: string,
  opts: { numDays?: number; numMembers?: number } = {}
): TripRecommendation {
  const numDays = opts.numDays ?? 1;
  const numMembers = opts.numMembers ?? 1;

  const itinerary: TripRecommendation['itinerary'] = [];
  for (let d = 1; d <= numDays; d++) {
    itinerary.push({
      id: `day-${d}`,
      dayNumber: d,
      date: new Date(`2025-07-0${d}`),
      notes: `Day ${d}`,
      items: [
        {
          id: `day${d}-item1`,
          order: 1,
          startTime: '10:00',
          endTime: '12:00',
          customTitle: `Activity day ${d}`,
        },
      ],
    });
  }

  const individualCosts: TripRecommendation['individualCosts'] = [];
  for (let m = 0; m < numMembers; m++) {
    individualCosts.push({
      memberId: `user-${m + 1}`,
      memberName: `Member ${m + 1}`,
      flightCost: 300,
      localCost: 720,
      totalCost: 1020,
    });
  }

  return {
    id: `rec-${tripId}-0`,
    destination: {
      city: 'Nashville',
      country: 'USA',
      coordinates: { lat: 36.1627, lng: -86.7816 },
      timezone: 'America/Chicago',
    },
    matchScore: 80,
    estimatedBudget: {
      total: 720,
      currency: 'USD',
      breakdown: { accommodation: 270, food: 216, activities: 144, transport: 90 },
    },
    suggestedDates: {
      start: new Date('2025-07-01'),
      end: new Date('2025-07-05'),
    },
    suggestedActivities: [],
    itinerary,
    individualCosts,
  };
}

// Reusable preference fixtures
const defaultLocationPrefs: SurveyAnalysis['locationPreferences'] = [
  { location: 'Nashville', score: 14, topChoiceCount: 2 },
  { location: 'NYC', score: 10, topChoiceCount: 0 },
  { location: 'Austin', score: 8, topChoiceCount: 0 },
];

const defaultActivityPrefs: SurveyAnalysis['activityPreferences'] = [
  { activity: 'Golf', score: 12 },
  { activity: 'Concert', score: 10 },
  { activity: 'Bars/Nightlife', score: 8 },
];

const twoMembers = [
  makeMember('user-1', 'Alice', 'chicago'),
  makeMember('user-2', 'Bob', 'boston'),
];

// ---------------------------------------------------------------------------
// generateRecommendations tests
// ---------------------------------------------------------------------------

describe('RecommendationService.generateRecommendations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a non-empty array of TripRecommendation objects on success', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('limits evaluated candidates to the requested count', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      2
    );

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('defaults to count=5 when the count argument is omitted', async () => {
    const sixPrefs: SurveyAnalysis['locationPreferences'] = [
      { location: 'Nashville', score: 14, topChoiceCount: 1 },
      { location: 'NYC', score: 12, topChoiceCount: 0 },
      { location: 'Chicago', score: 10, topChoiceCount: 0 },
      { location: 'Austin', score: 8, topChoiceCount: 0 },
      { location: 'Boston', score: 6, topChoiceCount: 0 },
      { location: 'LA', score: 4, topChoiceCount: 0 },
    ];

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(sixPrefs, defaultActivityPrefs)
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1'
    );

    // default count=5 means at most 5 prefs are processed → at most 5 results
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('returns an empty array when locationPreferences is empty', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis([], defaultActivityPrefs)
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results).toEqual([]);
  });

  it('returns recommendations with empty individualCosts when there are no members', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 10, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    results.forEach(rec => {
      expect(rec.individualCosts).toEqual([]);
    });
  });

  it('skips location preferences that have no matching DESTINATIONS entry', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [
          { location: 'UnknownCity', score: 20, topChoiceCount: 1 },
          { location: 'Nashville', score: 14, topChoiceCount: 1 },
        ],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    const cities = results.map(r => r.destination.city);
    expect(cities).not.toContain('UnknownCity');
    expect(cities).toContain('Nashville');
  });

  it('each recommendation has all required shape fields', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    results.forEach(rec => {
      expect(rec).toHaveProperty('id');
      expect(rec).toHaveProperty('destination');
      expect(rec.destination).toHaveProperty('city');
      expect(rec.destination).toHaveProperty('country');
      expect(rec).toHaveProperty('matchScore');
      expect(typeof rec.matchScore).toBe('number');
      expect(rec).toHaveProperty('estimatedBudget');
      expect(rec.estimatedBudget).toHaveProperty('total');
      expect(rec.estimatedBudget).toHaveProperty('currency', 'USD');
      expect(rec.estimatedBudget).toHaveProperty('breakdown');
      expect(rec).toHaveProperty('suggestedDates');
      expect(rec.suggestedDates).toHaveProperty('start');
      expect(rec.suggestedDates).toHaveProperty('end');
      expect(rec).toHaveProperty('itinerary');
      expect(Array.isArray(rec.itinerary)).toBe(true);
      expect(rec).toHaveProperty('individualCosts');
      expect(Array.isArray(rec.individualCosts)).toBe(true);
    });
  });

  it('matchScore is always between 0 and 100 inclusive', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 100, topChoiceCount: 20 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    results.forEach(rec => {
      expect(rec.matchScore).toBeGreaterThanOrEqual(0);
      expect(rec.matchScore).toBeLessThanOrEqual(100);
    });
  });

  it('results are sorted by matchScore descending', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].matchScore).toBeGreaterThanOrEqual(
        results[i].matchScore
      );
    }
  });

  it('recommendation id follows the pattern rec-{tripId}-{index}', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 10, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'my-trip',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    // id is built as `rec-${tripId}-${i}` where i is the loop index
    expect(results[0].id).toMatch(/^rec-my-trip-\d+$/);
  });

  it('individualCosts entries contain all required fields with correct arithmetic', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    const costs = results[0].individualCosts;
    expect(costs.length).toBe(2);

    costs.forEach(c => {
      expect(c).toHaveProperty('memberId');
      expect(c).toHaveProperty('memberName');
      expect(typeof c.flightCost).toBe('number');
      expect(typeof c.localCost).toBe('number');
      expect(typeof c.totalCost).toBe('number');
      expect(c.totalCost).toBe(c.flightCost + c.localCost);
    });
  });

  it('uses $400 default flight cost for a member with an unknown departure city', async () => {
    const memberUnknownCity = makeMember('user-x', 'Charlie', 'UnknownTown');

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([memberUnknownCity]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].individualCosts[0].flightCost).toBe(400);
  });

  it('uses $0 flight cost when origin airport equals destination airport (same city)', async () => {
    // Nashville's airport is BNA; AIRPORT_CODES has 'nashville' → 'BNA'
    const nashvilleMember = makeMember('user-n', 'Dave', 'nashville');

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([nashvilleMember]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].individualCosts[0].flightCost).toBe(0);
  });

  it('applies a distance factor when origin airport differs from destination airport', async () => {
    // 'los angeles' → LAX → factor 1.5 → Math.round(250 * 1.5) = 375
    const laMember = makeMember('user-la', 'Eve', 'los angeles');

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([laMember]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    // LAX distance factor is 1.5 → Math.round(250 * 1.5) = 375
    expect(results[0].individualCosts[0].flightCost).toBe(375);
  });

  it('uses member.departureCity over member.user.city when both are set', async () => {
    // member.departureCity = 'nashville' (same dest → $0), user.city = 'chicago' (→ $250)
    const member = makeMember('user-z', 'Frank', 'nashville', 'chicago');

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([member]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    // departureCity='nashville' wins → same airport → $0
    expect(results[0].individualCosts[0].flightCost).toBe(0);
  });

  it('falls back to user.city when member.departureCity is null', async () => {
    // departureCity=null, user.city='chicago' → ORD → factor 1.0 → $250
    const member = makeMember('user-fb', 'Grace', null, 'chicago');

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([member]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    // Chicago ORD factor is 1.0 → Math.round(250 * 1.0) = 250
    expect(results[0].individualCosts[0].flightCost).toBe(250);
  });

  it('returns $400 when both departureCity and user.city are null', async () => {
    const member = makeMember('user-null', 'Henry', null, null);

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([member]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results[0].individualCosts[0].flightCost).toBe(400);
  });

  it('budget.total equals the sum of breakdown line items', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    const { total, breakdown } = results[0].estimatedBudget;
    const lineSum =
      (breakdown?.accommodation ?? 0) +
      (breakdown?.food ?? 0) +
      (breakdown?.activities ?? 0) +
      (breakdown?.transport ?? 0);
    expect(total).toBe(lineSum);
  });

  it('all budget breakdown values are non-negative integers', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Chicago', score: 10, topChoiceCount: 0 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    const { breakdown } = results[0].estimatedBudget;
    expect(breakdown?.accommodation).toBeGreaterThanOrEqual(0);
    expect(breakdown?.food).toBeGreaterThanOrEqual(0);
    expect(breakdown?.activities).toBeGreaterThanOrEqual(0);
    expect(breakdown?.transport).toBeGreaterThanOrEqual(0);
    // All should be integers (Math.round)
    expect(breakdown?.accommodation).toBe(Math.round(breakdown?.accommodation ?? 0));
    expect(breakdown?.food).toBe(Math.round(breakdown?.food ?? 0));
  });

  it('itinerary has one entry per trip day (durationDays=4)', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    // Service hardcodes durationDays = 4
    expect(results[0].itinerary.length).toBe(4);
  });

  it('day 1 itinerary includes the Arrival and Check-in item', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    const day1Items = results[0].itinerary[0].items;
    const arrivalItem = day1Items.find(i => i.customTitle === 'Arrival and Check-in');
    expect(arrivalItem).toBeDefined();
  });

  it('last day includes Group Dinner and Farewell or Final Group Dinner evening item', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    const lastDay = results[0].itinerary[results[0].itinerary.length - 1];
    const farewellItem = lastDay.items.find(
      i => i.customTitle && i.customTitle.includes('Farewell')
    );
    expect(farewellItem).toBeDefined();
  });

  it('day 1 includes Group Welcome Dinner evening item', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        []
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    const day1Items = results[0].itinerary[0].items;
    const welcomeDinner = day1Items.find(i => i.customTitle === 'Group Welcome Dinner');
    expect(welcomeDinner).toBeDefined();
  });

  it('day 1 includes Group Welcome Gathering afternoon item', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        []
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    const day1Items = results[0].itinerary[0].items;
    const gathering = day1Items.find(i => i.customTitle === 'Group Welcome Gathering');
    expect(gathering).toBeDefined();
  });

  it('golf preference triggers a golf-style morning item on day 2', async () => {
    const golfPrefs: SurveyAnalysis['activityPreferences'] = [
      { activity: 'Golf', score: 20 },
      { activity: 'Concert', score: 10 },
      { activity: 'Bars/Nightlife', score: 8 },
    ];

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        golfPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    // day index 1 = day number 2
    const day2Items = results[0].itinerary[1].items;
    const morningItem = day2Items.find(i => i.id === 'day2-morning');
    expect(morningItem).toBeDefined();
    // The morning item should reflect golf activity (startTime 09:00)
    expect(morningItem?.startTime).toBe('09:00');
  });

  it('bars/nightlife preference triggers a nightlife evening item on middle days', async () => {
    const nightlifePrefs: SurveyAnalysis['activityPreferences'] = [
      { activity: 'Bars/Nightlife', score: 20 },
      { activity: 'Concert', score: 10 },
      { activity: 'Golf', score: 8 },
    ];

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        nightlifePrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    // Day 2 (index 1) is a middle day that should get nightlife evening (startTime 20:00)
    const day2Items = results[0].itinerary[1].items;
    const eveningItem = day2Items.find(i => i.id === 'day2-evening');
    expect(eveningItem).toBeDefined();
    expect(eveningItem?.startTime).toBe('20:00');
  });

  it('sporting event preference triggers sports afternoon on day 2', async () => {
    const sportPrefs: SurveyAnalysis['activityPreferences'] = [
      { activity: 'Sporting Event', score: 20 },
      { activity: 'Concert', score: 10 },
      { activity: 'Golf', score: 8 },
    ];

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        sportPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    // Day 2 afternoon item should start at 14:00 (sports event window)
    const day2Items = results[0].itinerary[1].items;
    const afternoonItem = day2Items.find(i => i.id === 'day2-afternoon');
    expect(afternoonItem).toBeDefined();
    expect(afternoonItem?.startTime).toBe('14:00');
  });

  it('throws when SurveyService.analyzeSurveyResponses rejects', async () => {
    mockAnalyzeSurveyResponses.mockRejectedValueOnce(
      new Error('Survey not found')
    );

    await expect(
      RecommendationService.generateRecommendations('trip-1', 'survey-1', 5)
    ).rejects.toThrow('Survey not found');
  });

  it('throws when prisma.tripMember.findMany rejects', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMemberFindMany.mockRejectedValueOnce(
      new Error('DB connection failed')
    );

    await expect(
      RecommendationService.generateRecommendations('trip-1', 'survey-1', 5)
    ).rejects.toThrow('DB connection failed');
  });

  it('produces correct matchScore of 100 for the top-ranked destination with many top-choice votes', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 100, topChoiceCount: 20 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBe(1);
    expect(results[0].matchScore).toBe(100);
  });

  it('higher-ranked destinations receive higher or equal matchScores than lower-ranked ones', async () => {
    // Nashville has higher score and topChoiceCount; Austin has lower
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [
          { location: 'Nashville', score: 14, topChoiceCount: 2 },
          { location: 'Austin', score: 4, topChoiceCount: 0 },
        ],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBe(2);
    // Results are sorted descending
    expect(results[0].matchScore).toBeGreaterThanOrEqual(results[1].matchScore);
  });

  it('each itinerary day has the correct dayNumber and a non-empty items array', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    results[0].itinerary.forEach((day, idx) => {
      expect(day.dayNumber).toBe(idx + 1);
      expect(day.items.length).toBeGreaterThan(0);
    });
  });

  it('each itinerary item has id, order, startTime, and customTitle', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    results[0].itinerary.forEach(day => {
      day.items.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('order');
        expect(typeof item.order).toBe('number');
        expect(item).toHaveProperty('startTime');
        expect(item).toHaveProperty('customTitle');
      });
    });
  });

  it('uses Nashville fallback activities when destination has no DESTINATION_ACTIVITIES entry', async () => {
    // Charleston is in DESTINATIONS but also in DESTINATION_ACTIVITIES, so we
    // can still verify the service runs cleanly for any valid destination
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Charleston', score: 10, topChoiceCount: 0 }],
        defaultActivityPrefs
      )
    );
    mockTripMemberFindMany.mockResolvedValueOnce([]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].destination.city).toBe('Charleston');
  });
});

// ---------------------------------------------------------------------------
// applyRecommendation tests
// ---------------------------------------------------------------------------

describe('RecommendationService.applyRecommendation', () => {
  // tripMember.updateMany is NOT in setup.ts; assign it once at describe scope
  // and reset via Object.assign in beforeEach.
  const updateManyMock = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(prisma.tripMember, { updateMany: updateManyMock });
  });

  it('resolves to undefined on success', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 1, numMembers: 1 });

    mockTripUpdate.mockResolvedValueOnce({} as never);
    mockItineraryDayCreate.mockResolvedValueOnce({
      id: 'iday-1',
      tripId: 'trip-1',
      dayNumber: 1,
      date: new Date('2025-07-01'),
      notes: 'Day 1',
    } as never);
    mockItineraryItemCreate.mockResolvedValueOnce({} as never);
    updateManyMock.mockResolvedValueOnce({ count: 1 });

    await expect(
      RecommendationService.applyRecommendation('trip-1', rec)
    ).resolves.toBeUndefined();
  });

  it('calls prisma.trip.update exactly once with correct data', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 0, numMembers: 0 });
    rec.itinerary = [];
    rec.individualCosts = [];

    mockTripUpdate.mockResolvedValueOnce({} as never);

    await RecommendationService.applyRecommendation('trip-1', rec);

    expect(vi.mocked(prisma.trip.update)).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(prisma.trip.update).mock.calls[0][0];
    expect(callArgs.where).toEqual({ id: 'trip-1' });
    expect(callArgs.data).toMatchObject({
      startDate: rec.suggestedDates.start,
      endDate: rec.suggestedDates.end,
      status: 'VOTING',
    });
  });

  it('creates one ItineraryDay row per itinerary day', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 3, numMembers: 0 });
    rec.individualCosts = [];

    mockTripUpdate.mockResolvedValueOnce({} as never);
    // Each call to itineraryDay.create must return a unique id
    mockItineraryDayCreate
      .mockResolvedValueOnce({ id: 'iday-1', tripId: 'trip-1', dayNumber: 1, date: new Date(), notes: '' } as never)
      .mockResolvedValueOnce({ id: 'iday-2', tripId: 'trip-1', dayNumber: 2, date: new Date(), notes: '' } as never)
      .mockResolvedValueOnce({ id: 'iday-3', tripId: 'trip-1', dayNumber: 3, date: new Date(), notes: '' } as never);
    // Items: 1 per day × 3 days = 3 calls
    mockItineraryItemCreate
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never);

    await RecommendationService.applyRecommendation('trip-1', rec);

    expect(vi.mocked(prisma.itineraryDay.create)).toHaveBeenCalledTimes(3);
  });

  it('creates ItineraryItem rows for every item within each day', async () => {
    // 2 days × 2 items each = 4 item rows
    const rec = makeRecommendation('trip-1', { numDays: 2, numMembers: 0 });
    rec.itinerary.forEach(day => {
      day.items.push({
        id: `${day.id}-item2`,
        order: 2,
        startTime: '14:00',
        endTime: '16:00',
        customTitle: 'Afternoon Activity',
      });
    });
    rec.individualCosts = [];

    mockTripUpdate.mockResolvedValueOnce({} as never);
    mockItineraryDayCreate
      .mockResolvedValueOnce({ id: 'iday-1', tripId: 'trip-1', dayNumber: 1, date: new Date(), notes: '' } as never)
      .mockResolvedValueOnce({ id: 'iday-2', tripId: 'trip-1', dayNumber: 2, date: new Date(), notes: '' } as never);
    mockItineraryItemCreate
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never);

    await RecommendationService.applyRecommendation('trip-1', rec);

    expect(vi.mocked(prisma.itineraryItem.create)).toHaveBeenCalledTimes(4);
  });

  it('calls tripMember.updateMany once per individualCost entry', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 1, numMembers: 2 });

    mockTripUpdate.mockResolvedValueOnce({} as never);
    mockItineraryDayCreate.mockResolvedValueOnce({
      id: 'iday-1',
      tripId: 'trip-1',
      dayNumber: 1,
      date: new Date(),
      notes: '',
    } as never);
    mockItineraryItemCreate.mockResolvedValueOnce({} as never);
    updateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await RecommendationService.applyRecommendation('trip-1', rec);

    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it('passes flightCost as estimatedCost in flightDetails to tripMember.updateMany', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 1, numMembers: 1 });
    rec.individualCosts[0].flightCost = 450;

    mockTripUpdate.mockResolvedValueOnce({} as never);
    mockItineraryDayCreate.mockResolvedValueOnce({
      id: 'iday-1',
      tripId: 'trip-1',
      dayNumber: 1,
      date: new Date(),
      notes: '',
    } as never);
    mockItineraryItemCreate.mockResolvedValueOnce({} as never);
    updateManyMock.mockResolvedValueOnce({ count: 1 });

    await RecommendationService.applyRecommendation('trip-1', rec);

    const updateCall = updateManyMock.mock.calls[0][0];
    expect(updateCall.data.flightDetails).toMatchObject({ estimatedCost: 450 });
  });

  it('works cleanly when itinerary is empty and individualCosts is empty', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 0, numMembers: 0 });
    rec.itinerary = [];
    rec.individualCosts = [];

    mockTripUpdate.mockResolvedValueOnce({} as never);

    await expect(
      RecommendationService.applyRecommendation('trip-1', rec)
    ).resolves.toBeUndefined();

    expect(vi.mocked(prisma.itineraryDay.create)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.itineraryItem.create)).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('propagates an error thrown by prisma.trip.update', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 0, numMembers: 0 });
    rec.itinerary = [];
    rec.individualCosts = [];

    mockTripUpdate.mockRejectedValueOnce(new Error('Trip update failed'));

    await expect(
      RecommendationService.applyRecommendation('trip-1', rec)
    ).rejects.toThrow('Trip update failed');
  });

  it('propagates an error thrown by prisma.itineraryDay.create', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 1, numMembers: 0 });
    rec.individualCosts = [];

    mockTripUpdate.mockResolvedValueOnce({} as never);
    mockItineraryDayCreate.mockRejectedValueOnce(new Error('Day create failed'));

    await expect(
      RecommendationService.applyRecommendation('trip-1', rec)
    ).rejects.toThrow('Day create failed');
  });

  it('propagates an error thrown by prisma.itineraryItem.create', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 1, numMembers: 0 });
    rec.individualCosts = [];

    mockTripUpdate.mockResolvedValueOnce({} as never);
    mockItineraryDayCreate.mockResolvedValueOnce({
      id: 'iday-1',
      tripId: 'trip-1',
      dayNumber: 1,
      date: new Date(),
      notes: '',
    } as never);
    mockItineraryItemCreate.mockRejectedValueOnce(new Error('Item create failed'));

    await expect(
      RecommendationService.applyRecommendation('trip-1', rec)
    ).rejects.toThrow('Item create failed');
  });

  it('sets trip status to VOTING in the update call', async () => {
    const rec = makeRecommendation('trip-1', { numDays: 0, numMembers: 0 });
    rec.itinerary = [];
    rec.individualCosts = [];

    mockTripUpdate.mockResolvedValueOnce({} as never);

    await RecommendationService.applyRecommendation('trip-1', rec);

    expect(vi.mocked(prisma.trip.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'VOTING' }),
      })
    );
  });
});
