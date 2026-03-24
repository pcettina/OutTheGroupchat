/**
 * Unit tests for RecommendationService
 *
 * Strategy
 * --------
 * - prisma is mocked globally via setup.ts (tripMember.findMany stubbed).
 * - SurveyService.analyzeSurveyResponses is mocked locally so we control the
 *   analysis shape returned.
 * - No real DB connections or HTTP requests are made.
 *
 * Coverage goals
 * --------------
 * - generateRecommendations returns an array on success
 * - result is limited to the requested count
 * - zero members yields an empty individualCosts array per recommendation
 * - empty locationPreferences yields an empty recommendations array
 * - SurveyService error propagates
 * - prisma.tripMember.findMany error propagates
 * - each recommendation has the required shape fields
 * - matchScore is clamped to [0, 100]
 * - destinations not in DESTINATIONS map are skipped
 * - results are sorted by matchScore descending
 * - applyRecommendation writes to trip, itineraryDay, itineraryItem, tripMember
 * - departure city unknown → default flight cost of $400
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { TripMemberRole } from '@prisma/client';
import type { SurveyAnalysis } from '@/types';

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
const mockTripMember = vi.mocked(prisma.tripMember);
const mockTrip = vi.mocked(prisma.trip);
const mockItineraryDay = vi.mocked(prisma.itineraryDay);
const mockItineraryItem = vi.mocked(prisma.itineraryItem);
const mockAnalyzeSurveyResponses = vi.mocked(SurveyService.analyzeSurveyResponses);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal valid SurveyAnalysis with the supplied locationPreferences.
 */
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

/** Builds a minimal TripMemberWithUser fixture. */
function makeMember(
  userId: string,
  name: string,
  departureCity?: string
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
      city: departureCity ?? null,
      preferences: null,
    },
  };
}

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
// Tests
// ---------------------------------------------------------------------------

describe('RecommendationService.generateRecommendations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // 1. Returns an array of recommendations on success
  it('returns an array of TripRecommendation objects on success', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  // 2. Returns recommendations limited to the requested count
  it('limits results to the requested count', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      2
    );

    // count=2 → at most 2 location prefs processed → at most 2 results
    expect(results.length).toBeLessThanOrEqual(2);
  });

  // 3. Handles zero members gracefully
  it('returns recommendations with empty individualCosts when there are no members', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 10, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMember.findMany.mockResolvedValueOnce([]);

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

  // 4. Handles empty locationPreferences gracefully
  it('returns an empty array when locationPreferences is empty', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis([], defaultActivityPrefs)
    );
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results).toEqual([]);
  });

  // 5. Propagates error when SurveyService.analyzeSurveyResponses throws
  it('throws when SurveyService.analyzeSurveyResponses rejects', async () => {
    mockAnalyzeSurveyResponses.mockRejectedValueOnce(
      new Error('Survey not found')
    );

    await expect(
      RecommendationService.generateRecommendations('trip-1', 'survey-1', 5)
    ).rejects.toThrow('Survey not found');
  });

  // 6. Propagates error when prisma.tripMember.findMany throws
  it('throws when prisma.tripMember.findMany rejects', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMember.findMany.mockRejectedValueOnce(
      new Error('DB connection failed')
    );

    await expect(
      RecommendationService.generateRecommendations('trip-1', 'survey-1', 5)
    ).rejects.toThrow('DB connection failed');
  });

  // 7. Each recommendation has the required shape
  it('each recommendation has destination, matchScore, estimatedBudget, individualCosts, itinerary, id', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

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
      expect(rec).toHaveProperty('estimatedBudget');
      expect(rec.estimatedBudget).toHaveProperty('total');
      expect(rec.estimatedBudget).toHaveProperty('currency', 'USD');
      expect(rec).toHaveProperty('suggestedDates');
      expect(rec).toHaveProperty('itinerary');
      expect(rec).toHaveProperty('individualCosts');
    });
  });

  // 8. matchScore is clamped to [0, 100]
  it('matchScore is always between 0 and 100 inclusive', async () => {
    // Give a single location pref with a very high topChoiceCount to push the score high
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 100, topChoiceCount: 20 }],
        defaultActivityPrefs
      )
    );
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

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

  // 9. Destinations not in the DESTINATIONS map are skipped
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
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    // UnknownCity should be silently skipped; Nashville should produce 1 recommendation
    const cities = results.map(r => r.destination.city);
    expect(cities).not.toContain('UnknownCity');
    expect(cities).toContain('Nashville');
  });

  // 10. Results are sorted by matchScore descending
  it('returns results sorted by matchScore descending', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(defaultLocationPrefs, defaultActivityPrefs)
    );
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

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

  // 11. individualCosts contain correct memberId and memberName
  it('individualCosts entries contain memberId, memberName, flightCost, localCost, totalCost', async () => {
    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMember.findMany.mockResolvedValueOnce(twoMembers);

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
      expect(c).toHaveProperty('flightCost');
      expect(c).toHaveProperty('localCost');
      expect(c).toHaveProperty('totalCost');
      expect(c.totalCost).toBe(c.flightCost + c.localCost);
    });
  });

  // 12. Unknown departure city falls back to default $400 flight cost
  it('uses $400 default flight cost for unknown departure city', async () => {
    const memberUnknownCity = makeMember('user-x', 'Charlie', 'UnknownTown');

    mockAnalyzeSurveyResponses.mockResolvedValueOnce(
      makeSurveyAnalysis(
        [{ location: 'Nashville', score: 14, topChoiceCount: 1 }],
        defaultActivityPrefs
      )
    );
    mockTripMember.findMany.mockResolvedValueOnce([memberUnknownCity]);

    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1',
      5
    );

    expect(results.length).toBeGreaterThan(0);
    const cost = results[0].individualCosts[0];
    expect(cost.flightCost).toBe(400);
  });

  // 13. Uses default count=5 when count argument is omitted
  it('defaults to count=5 when no count argument is provided', async () => {
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
    mockTripMember.findMany.mockResolvedValueOnce([]);

    // Omit count → service default is 5 → only 5 prefs are processed
    const results = await RecommendationService.generateRecommendations(
      'trip-1',
      'survey-1'
    );

    expect(results.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// applyRecommendation
// ---------------------------------------------------------------------------

describe('RecommendationService.applyRecommendation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('updates the trip and creates itinerary days/items and member flight details', async () => {
    const recommendation = {
      id: 'rec-trip-1-0',
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
      itinerary: [
        {
          id: 'day-1',
          dayNumber: 1,
          date: new Date('2025-07-01'),
          notes: 'Tuesday',
          items: [
            {
              id: 'day1-morning',
              order: 1,
              startTime: '12:00',
              endTime: '14:00',
              customTitle: 'Arrival and Check-in',
            },
          ],
        },
      ],
      individualCosts: [
        {
          memberId: 'user-1',
          memberName: 'Alice',
          flightCost: 250,
          localCost: 720,
          totalCost: 970,
        },
      ],
    };

    // prisma.trip.update stub
    mockTrip.update.mockResolvedValueOnce({} as never);
    // prisma.itineraryDay.create stub
    mockItineraryDay.create.mockResolvedValueOnce({
      id: 'iday-1',
      tripId: 'trip-1',
      dayNumber: 1,
      date: new Date('2025-07-01'),
      notes: 'Tuesday',
    } as never);
    // prisma.itineraryItem.create stub
    mockItineraryItem.create.mockResolvedValueOnce({} as never);
    // prisma.tripMember.updateMany — not in setup.ts mock; add dynamically
    const updateManyFn = vi.fn().mockResolvedValueOnce({ count: 1 });
    Object.assign(prisma.tripMember, { updateMany: updateManyFn });

    await expect(
      RecommendationService.applyRecommendation('trip-1', recommendation)
    ).resolves.toBeUndefined();

    expect(mockTrip.update).toHaveBeenCalledOnce();
    expect(mockItineraryDay.create).toHaveBeenCalledOnce();
    expect(mockItineraryItem.create).toHaveBeenCalledOnce();
    expect(updateManyFn).toHaveBeenCalledOnce();
  });
});
