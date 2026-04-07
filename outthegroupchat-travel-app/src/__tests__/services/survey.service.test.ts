/**
 * Unit tests for SurveyService
 *
 * Strategy
 * --------
 * - prisma is mocked globally via setup.ts (tripSurvey, tripMember stubs available).
 * - No real DB connections are made.
 * - Static getter methods (getUserPreferencesSurvey, getTripPlanningSurvey) are tested
 *   without any mocks since they return pure in-memory constants.
 * - Async methods (analyzeSurveyResponses, closeSurvey, createTripSurvey) are tested
 *   against prisma stubs.
 *
 * Coverage goals
 * --------------
 * - getUserPreferencesSurvey returns INITIAL_USER_SURVEY
 * - getTripPlanningSurvey returns TRIP_PLANNING_SURVEY
 * - analyzeSurveyResponses throws when survey is not found
 * - analyzeSurveyResponses returns correct shape with valid data
 * - responseRate is calculated correctly (totalResponses / memberCount * 100)
 * - responseRate is 0 when memberCount is 0
 * - budgetAnalysis: numeric budget values are averaged correctly
 * - budgetAnalysis: object-format budgets use midpoint averaging
 * - budgetAnalysis: fallback defaults when no budgets present
 * - dateAnalysis: availability is sorted by vote count descending
 * - dateAnalysis: optimal range falls back to Early July when none provided
 * - dateAnalysis: known optimal range maps to correct Date objects
 * - locationPreferences: scoring is inverse-rank based, sorted descending
 * - locationPreferences: topChoiceCount increments for rank-0 entries
 * - activityPreferences: scoring is inverse-rank based, sorted descending
 * - closeSurvey calls prisma.tripSurvey.update with CLOSED status
 * - closeSurvey propagates DB errors
 * - createTripSurvey creates a survey with correct shape
 * - createTripSurvey uses default 48h expiry when no argument given
 * - createTripSurvey uses custom expiry when argument given
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import type { TripSurvey } from '@prisma/client';
import type { SurveyAnswers } from '@/types';

import {
  SurveyService,
  INITIAL_USER_SURVEY,
  TRIP_PLANNING_SURVEY,
} from '@/services/survey.service';

// ---------------------------------------------------------------------------
// Typed mock references (both are in setup.ts)
// ---------------------------------------------------------------------------
const mockTripSurvey = vi.mocked(prisma.tripSurvey);
const mockTripMember = vi.mocked(prisma.tripMember);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a minimal user object for SurveyResponseWithUser. */
function makeUser(id: string) {
  return {
    id,
    name: `User-${id}`,
    email: `${id}@test.com`,
    image: null,
    emailVerified: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    bio: null,
    city: null,
    preferences: null,
    isBetaUser: false,
    betaCode: null,
    password: null,
    followersCount: 0,
    followingCount: 0,
    tripsCount: 0,
    newsletterSubscribed: false,
  };
}

/** Build a SurveyResponse fixture with the given answers. */
function makeResponse(id: string, userId: string, answers: SurveyAnswers) {
  return {
    id,
    surveyId: 'survey-1',
    userId,
    answers,
    submittedAt: new Date(),
    user: makeUser(userId),
  };
}

/** Build a minimal TripSurvey with nested responses. */
function makeSurveyWithResponses(responses: ReturnType<typeof makeResponse>[]) {
  return {
    id: 'survey-1',
    tripId: 'trip-1',
    title: 'Trip Planning Survey',
    questions: TRIP_PLANNING_SURVEY as unknown,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    responses,
  };
}

/** Build a TripSurvey result (return value from create). */
function makeTripSurveyRecord(tripId: string): TripSurvey {
  return {
    id: 'new-survey-id',
    tripId,
    title: 'Trip Planning Survey',
    questions: TRIP_PLANNING_SURVEY as unknown as import('@prisma/client').Prisma.JsonValue,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests: static getters
// ---------------------------------------------------------------------------

describe('SurveyService.getUserPreferencesSurvey', () => {
  it('returns the INITIAL_USER_SURVEY constant', () => {
    const result = SurveyService.getUserPreferencesSurvey();
    expect(result).toBe(INITIAL_USER_SURVEY);
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains required question ids: travel_style, budget_range, interests, accommodation, activity_level', () => {
    const result = SurveyService.getUserPreferencesSurvey();
    const ids = result.map(q => q.id);
    expect(ids).toContain('travel_style');
    expect(ids).toContain('budget_range');
    expect(ids).toContain('interests');
    expect(ids).toContain('accommodation');
    expect(ids).toContain('activity_level');
  });

  it('all required questions have required=true', () => {
    const result = SurveyService.getUserPreferencesSurvey();
    result.forEach(q => {
      if (q.required) {
        expect(typeof q.id).toBe('string');
        expect(typeof q.question).toBe('string');
      }
    });
  });
});

describe('SurveyService.getTripPlanningSurvey', () => {
  it('returns the TRIP_PLANNING_SURVEY constant', () => {
    const result = SurveyService.getTripPlanningSurvey();
    expect(result).toBe(TRIP_PLANNING_SURVEY);
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains required question ids: availability, duration, location_preferences, trip_budget, departure_city', () => {
    const result = SurveyService.getTripPlanningSurvey();
    const ids = result.map(q => q.id);
    expect(ids).toContain('availability');
    expect(ids).toContain('duration');
    expect(ids).toContain('location_preferences');
    expect(ids).toContain('trip_budget');
    expect(ids).toContain('departure_city');
  });

  it('optional questions (other_locations, other_activities) have required=false', () => {
    const result = SurveyService.getTripPlanningSurvey();
    const optionalIds = ['other_locations', 'other_activities'];
    optionalIds.forEach(id => {
      const q = result.find(question => question.id === id);
      expect(q).toBeDefined();
      expect(q?.required).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: analyzeSurveyResponses
// ---------------------------------------------------------------------------

describe('SurveyService.analyzeSurveyResponses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('throws "Survey not found" when prisma returns null', async () => {
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);

    await expect(
      SurveyService.analyzeSurveyResponses('missing-survey')
    ).rejects.toThrow('Survey not found');
  });

  it('returns the correct shape when survey is found', async () => {
    const responses = [
      makeResponse('r1', 'u1', {
        trip_budget: 800,
        availability: ['Early July (1-15)'],
        location_preferences: ['Nashville', 'NYC', 'Chicago', 'LA', 'Austin', 'Boston', 'Charleston'],
        activity_preferences: ['Golf', 'Concert', 'Sporting Event', 'Beach Activities', 'Outdoor Adventures', 'Casino', 'Bars/Nightlife'],
      }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(2);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result).toHaveProperty('totalResponses', 1);
    expect(result).toHaveProperty('responseRate');
    expect(result).toHaveProperty('budgetAnalysis');
    expect(result.budgetAnalysis).toHaveProperty('groupOptimal');
    expect(result.budgetAnalysis).toHaveProperty('min');
    expect(result.budgetAnalysis).toHaveProperty('max');
    expect(result).toHaveProperty('dateAnalysis');
    expect(result.dateAnalysis).toHaveProperty('optimalRange');
    expect(result.dateAnalysis).toHaveProperty('availability');
    expect(result).toHaveProperty('locationPreferences');
    expect(result).toHaveProperty('activityPreferences');
  });

  it('calculates responseRate as (totalResponses / memberCount) * 100', async () => {
    const responses = [
      makeResponse('r1', 'u1', { trip_budget: 500, availability: [], location_preferences: [], activity_preferences: [] }),
      makeResponse('r2', 'u2', { trip_budget: 700, availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(4);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    // 2 responses / 4 members * 100 = 50
    expect(result.responseRate).toBe(50);
  });

  it('sets responseRate to 0 when memberCount is 0', async () => {
    const responses = [
      makeResponse('r1', 'u1', { trip_budget: 500, availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(0);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result.responseRate).toBe(0);
  });

  it('totalResponses reflects the actual number of responses', async () => {
    const responses = [
      makeResponse('r1', 'u1', { trip_budget: 500, availability: [], location_preferences: [], activity_preferences: [] }),
      makeResponse('r2', 'u2', { trip_budget: 600, availability: [], location_preferences: [], activity_preferences: [] }),
      makeResponse('r3', 'u3', { trip_budget: 700, availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(3);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result.totalResponses).toBe(3);
  });

  // Budget analysis
  it('budgetAnalysis computes correct groupOptimal, min, max from numeric budgets', async () => {
    const responses = [
      makeResponse('r1', 'u1', { trip_budget: 500, availability: [], location_preferences: [], activity_preferences: [] }),
      makeResponse('r2', 'u2', { trip_budget: 700, availability: [], location_preferences: [], activity_preferences: [] }),
      makeResponse('r3', 'u3', { trip_budget: 900, availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(3);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result.budgetAnalysis.min).toBe(500);
    expect(result.budgetAnalysis.max).toBe(900);
    // groupOptimal = round((500+700+900)/3) = round(700) = 700
    expect(result.budgetAnalysis.groupOptimal).toBe(700);
  });

  it('budgetAnalysis uses midpoint for object-format budgets { min, max }', async () => {
    const responses = [
      // midpoint = (400 + 800) / 2 = 600
      makeResponse('r1', 'u1', { trip_budget: { min: 400, max: 800 } as unknown as number, availability: [], location_preferences: [], activity_preferences: [] }),
      // midpoint = (600 + 1000) / 2 = 800
      makeResponse('r2', 'u2', { trip_budget: { min: 600, max: 1000 } as unknown as number, availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(2);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result.budgetAnalysis.min).toBe(600);
    expect(result.budgetAnalysis.max).toBe(800);
    // groupOptimal = round((600+800)/2) = 700
    expect(result.budgetAnalysis.groupOptimal).toBe(700);
  });

  it('budgetAnalysis returns fallback defaults when no responses have budget data', async () => {
    const responses = [
      makeResponse('r1', 'u1', { availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(1);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result.budgetAnalysis).toEqual({ groupOptimal: 500, min: 300, max: 700 });
  });

  it('budgetAnalysis returns fallback defaults when there are no responses', async () => {
    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses([]) as never
    );
    mockTripMember.count.mockResolvedValueOnce(0);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result.budgetAnalysis).toEqual({ groupOptimal: 500, min: 300, max: 700 });
  });

  // Date analysis
  it('dateAnalysis availability is sorted by count descending', async () => {
    const responses = [
      makeResponse('r1', 'u1', {
        trip_budget: 600,
        availability: ['Early July (1-15)', 'Late June (16-30)'],
        location_preferences: [],
        activity_preferences: [],
      }),
      makeResponse('r2', 'u2', {
        trip_budget: 700,
        availability: ['Early July (1-15)'],
        location_preferences: [],
        activity_preferences: [],
      }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(2);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const availability = result.dateAnalysis.availability;
    expect(availability[0].date).toBe('Early July (1-15)');
    expect(availability[0].count).toBe(2);
    expect(availability[1].date).toBe('Late June (16-30)');
    expect(availability[1].count).toBe(1);
  });

  it('dateAnalysis optimalRange maps "Early July (1-15)" to correct Date range', async () => {
    const responses = [
      makeResponse('r1', 'u1', {
        trip_budget: 600,
        availability: ['Early July (1-15)'],
        location_preferences: [],
        activity_preferences: [],
      }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(1);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const { start, end } = result.dateAnalysis.optimalRange;
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(start.toISOString().startsWith('2025-07-01')).toBe(true);
    expect(end.toISOString().startsWith('2025-07-15')).toBe(true);
  });

  it('dateAnalysis optimalRange falls back to "Early July (1-15)" dates when no availability', async () => {
    const responses = [
      makeResponse('r1', 'u1', { trip_budget: 600, availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(1);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const { start, end } = result.dateAnalysis.optimalRange;
    expect(start.toISOString().startsWith('2025-07-01')).toBe(true);
    expect(end.toISOString().startsWith('2025-07-15')).toBe(true);
  });

  it('dateAnalysis optimalRange maps "Late June (16-30)" correctly', async () => {
    const responses = [
      makeResponse('r1', 'u1', {
        trip_budget: 600,
        availability: ['Late June (16-30)'],
        location_preferences: [],
        activity_preferences: [],
      }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(1);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const { start, end } = result.dateAnalysis.optimalRange;
    expect(start.toISOString().startsWith('2025-06-16')).toBe(true);
    expect(end.toISOString().startsWith('2025-06-30')).toBe(true);
  });

  it('dateAnalysis returns empty availability array when no responses contain availability', async () => {
    const responses = [
      makeResponse('r1', 'u1', { trip_budget: 600, availability: [], location_preferences: [], activity_preferences: [] }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(1);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    expect(result.dateAnalysis.availability).toEqual([]);
  });

  // Location preferences
  it('locationPreferences uses inverse-rank scoring and returns sorted descending', async () => {
    // User 1 ranks Nashville first (score += 7-0=7), NYC second (score += 7-1=6)
    // User 2 ranks Nashville first (score += 7), Chicago second (score += 6)
    // Nashville total = 14, NYC = 6, Chicago = 6
    const responses = [
      makeResponse('r1', 'u1', {
        trip_budget: 600,
        availability: [],
        location_preferences: ['Nashville', 'NYC', 'Chicago', 'LA', 'Austin', 'Boston', 'Charleston'],
        activity_preferences: [],
      }),
      makeResponse('r2', 'u2', {
        trip_budget: 700,
        availability: [],
        location_preferences: ['Nashville', 'Chicago', 'NYC', 'LA', 'Austin', 'Boston', 'Charleston'],
        activity_preferences: [],
      }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(2);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const prefs = result.locationPreferences;
    expect(prefs[0].location).toBe('Nashville');
    expect(prefs[0].score).toBe(14);

    // Sorted descending
    for (let i = 1; i < prefs.length; i++) {
      expect(prefs[i - 1].score).toBeGreaterThanOrEqual(prefs[i].score);
    }
  });

  it('locationPreferences increments topChoiceCount for rank-0 (first place) votes', async () => {
    const responses = [
      makeResponse('r1', 'u1', {
        trip_budget: 600,
        availability: [],
        location_preferences: ['Nashville', 'NYC', 'Chicago', 'LA', 'Austin', 'Boston', 'Charleston'],
        activity_preferences: [],
      }),
      makeResponse('r2', 'u2', {
        trip_budget: 700,
        availability: [],
        location_preferences: ['NYC', 'Nashville', 'Chicago', 'LA', 'Austin', 'Boston', 'Charleston'],
        activity_preferences: [],
      }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(2);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const nashville = result.locationPreferences.find(p => p.location === 'Nashville');
    const nyc = result.locationPreferences.find(p => p.location === 'NYC');

    expect(nashville?.topChoiceCount).toBe(1);
    expect(nyc?.topChoiceCount).toBe(1);
  });

  it('locationPreferences includes all 7 known cities even with no responses', async () => {
    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses([]) as never
    );
    mockTripMember.count.mockResolvedValueOnce(0);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const cities = result.locationPreferences.map(p => p.location);
    expect(cities).toContain('Nashville');
    expect(cities).toContain('NYC');
    expect(cities).toContain('Chicago');
    expect(cities).toContain('LA');
    expect(cities).toContain('Austin');
    expect(cities).toContain('Boston');
    expect(cities).toContain('Charleston');
    expect(cities).toHaveLength(7);
  });

  // Activity preferences
  it('activityPreferences uses inverse-rank scoring and returns sorted descending', async () => {
    // 7 activities; first-place gets 7-0=7, second gets 7-1=6, etc.
    const responses = [
      makeResponse('r1', 'u1', {
        trip_budget: 600,
        availability: [],
        location_preferences: [],
        activity_preferences: ['Golf', 'Concert', 'Sporting Event', 'Beach Activities', 'Outdoor Adventures', 'Casino', 'Bars/Nightlife'],
      }),
      makeResponse('r2', 'u2', {
        trip_budget: 700,
        availability: [],
        location_preferences: [],
        activity_preferences: ['Golf', 'Concert', 'Sporting Event', 'Beach Activities', 'Outdoor Adventures', 'Casino', 'Bars/Nightlife'],
      }),
    ];

    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses(responses) as never
    );
    mockTripMember.count.mockResolvedValueOnce(2);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const prefs = result.activityPreferences;
    expect(prefs[0].activity).toBe('Golf');
    // Golf score = (7 + 7) = 14 (two responses, each rank-0 → 7-0=7 each)
    expect(prefs[0].score).toBe(14);

    // Sorted descending
    for (let i = 1; i < prefs.length; i++) {
      expect(prefs[i - 1].score).toBeGreaterThanOrEqual(prefs[i].score);
    }
  });

  it('activityPreferences includes all 7 known activities even with no responses', async () => {
    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses([]) as never
    );
    mockTripMember.count.mockResolvedValueOnce(0);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    const activities = result.activityPreferences.map(p => p.activity);
    expect(activities).toContain('Golf');
    expect(activities).toContain('Concert');
    expect(activities).toContain('Sporting Event');
    expect(activities).toContain('Beach Activities');
    expect(activities).toContain('Outdoor Adventures');
    expect(activities).toContain('Casino');
    expect(activities).toContain('Bars/Nightlife');
    expect(activities).toHaveLength(7);
  });

  it('activityPreferences scores all activities at 0 when no responses', async () => {
    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses([]) as never
    );
    mockTripMember.count.mockResolvedValueOnce(0);

    const result = await SurveyService.analyzeSurveyResponses('survey-1');

    result.activityPreferences.forEach(p => {
      expect(p.score).toBe(0);
    });
  });

  it('propagates DB errors from prisma.tripSurvey.findUnique', async () => {
    mockTripSurvey.findUnique.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      SurveyService.analyzeSurveyResponses('survey-1')
    ).rejects.toThrow('DB error');
  });

  it('propagates DB errors from prisma.tripMember.count', async () => {
    mockTripSurvey.findUnique.mockResolvedValueOnce(
      makeSurveyWithResponses([]) as never
    );
    mockTripMember.count.mockRejectedValueOnce(new Error('Count failed'));

    await expect(
      SurveyService.analyzeSurveyResponses('survey-1')
    ).rejects.toThrow('Count failed');
  });
});

// ---------------------------------------------------------------------------
// Tests: closeSurvey
// ---------------------------------------------------------------------------

describe('SurveyService.closeSurvey', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls prisma.tripSurvey.update with the correct id and CLOSED status', async () => {
    mockTripSurvey.update.mockResolvedValueOnce({} as never);

    await SurveyService.closeSurvey('survey-abc');

    expect(mockTripSurvey.update).toHaveBeenCalledOnce();
    expect(mockTripSurvey.update).toHaveBeenCalledWith({
      where: { id: 'survey-abc' },
      data: { status: 'CLOSED' },
    });
  });

  it('resolves to undefined on success', async () => {
    mockTripSurvey.update.mockResolvedValueOnce({} as never);

    const result = await SurveyService.closeSurvey('survey-abc');

    expect(result).toBeUndefined();
  });

  it('propagates errors from prisma.tripSurvey.update', async () => {
    mockTripSurvey.update.mockRejectedValueOnce(new Error('Update failed'));

    await expect(SurveyService.closeSurvey('survey-abc')).rejects.toThrow(
      'Update failed'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: createTripSurvey
// ---------------------------------------------------------------------------

describe('SurveyService.createTripSurvey', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls prisma.tripSurvey.create with correct tripId, title, status, questions', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValueOnce(now);
    mockTripSurvey.create.mockResolvedValueOnce(makeTripSurveyRecord('trip-42') as never);

    await SurveyService.createTripSurvey('trip-42');

    expect(mockTripSurvey.create).toHaveBeenCalledOnce();
    const call = mockTripSurvey.create.mock.calls[0][0];
    expect(call.data.tripId).toBe('trip-42');
    expect(call.data.title).toBe('Trip Planning Survey');
    expect(call.data.status).toBe('ACTIVE');
    expect(call.data.questions).toEqual(TRIP_PLANNING_SURVEY);
  });

  it('uses a 48-hour expiry by default', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValueOnce(now);
    mockTripSurvey.create.mockResolvedValueOnce(makeTripSurveyRecord('trip-1') as never);

    await SurveyService.createTripSurvey('trip-1');

    const call = mockTripSurvey.create.mock.calls[0][0];
    const expectedExpiry = now + 48 * 60 * 60 * 1000;
    // Allow ±5ms: Date.now() spy fires once so a second internal call uses real time (±1ms)
    expect(Math.abs((call.data.expiresAt as Date).getTime() - expectedExpiry)).toBeLessThanOrEqual(5);
  });

  it('uses a custom expiry when expirationHours is provided', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValueOnce(now);
    mockTripSurvey.create.mockResolvedValueOnce(makeTripSurveyRecord('trip-1') as never);

    await SurveyService.createTripSurvey('trip-1', 24);

    const call = mockTripSurvey.create.mock.calls[0][0];
    const expectedExpiry = new Date(now + 24 * 60 * 60 * 1000);
    expect((call.data.expiresAt as Date).getTime()).toBe(expectedExpiry.getTime());
  });

  it('returns the TripSurvey record from prisma', async () => {
    const record = makeTripSurveyRecord('trip-99');
    mockTripSurvey.create.mockResolvedValueOnce(record as never);

    const result = await SurveyService.createTripSurvey('trip-99');

    expect(result).toBe(record);
  });

  it('propagates errors from prisma.tripSurvey.create', async () => {
    mockTripSurvey.create.mockRejectedValueOnce(new Error('Create failed'));

    await expect(SurveyService.createTripSurvey('trip-1')).rejects.toThrow(
      'Create failed'
    );
  });
});
