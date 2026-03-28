/**
 * Survey Service
 *
 * Handles survey template creation, response collection, and answer analysis
 * for group trip planning. Provides default templates (INITIAL_USER_SURVEY,
 * TRIP_PLANNING_SURVEY) and the SurveyService class for DB operations.
 *
 * @module survey.service
 */
import { prisma } from '@/lib/prisma';
import type { Prisma, TripSurvey } from '@prisma/client';
import type { SurveyQuestion, SurveyAnalysis, SurveyAnswers } from '@/types';

/**
 * A `SurveyResponse` record with its related `user` fully included.
 * Used internally by analysis helpers to read per-member answer payloads.
 */
type SurveyResponseWithUser = Prisma.SurveyResponseGetPayload<{
  include: { user: true };
}>;

/**
 * Default survey template for capturing individual user travel preferences.
 * Covers travel style, budget range, interests, accommodation type, and activity level.
 */
export const INITIAL_USER_SURVEY: SurveyQuestion[] = [
  {
    id: 'travel_style',
    type: 'single_choice',
    question: 'What\'s your preferred travel style?',
    description: 'This helps us match you with like-minded travelers',
    required: true,
    options: ['Adventure', 'Relaxation', 'Cultural', 'Family', 'Solo'],
  },
  {
    id: 'budget_range',
    type: 'budget',
    question: 'What\'s your typical trip budget (excluding flights)?',
    required: true,
    min: 300,
    max: 2000,
    step: 100,
  },
  {
    id: 'interests',
    type: 'multiple_choice',
    question: 'Select your travel interests (choose all that apply)',
    required: true,
    options: [
      'Beach/Water Activities',
      'Hiking/Outdoor Adventures',
      'Food & Dining',
      'Nightlife & Bars',
      'Culture & Museums',
      'Sports & Events',
      'Shopping',
      'Photography',
      'Wellness & Spa',
    ],
  },
  {
    id: 'accommodation',
    type: 'single_choice',
    question: 'What type of accommodation do you prefer?',
    required: true,
    options: [
      'Budget-friendly (hostels, budget hotels)',
      'Mid-range (nice hotels, Airbnb)',
      'Luxury (resorts, premium hotels)',
      'Unique stays (treehouses, glamping)',
    ],
  },
  {
    id: 'activity_level',
    type: 'scale',
    question: 'How active do you like to be on trips?',
    description: '1 = Very relaxed, 5 = Non-stop action',
    required: true,
    min: 1,
    max: 5,
  },
];

/**
 * Default survey template for planning a specific group trip.
 * Collects availability windows, duration ranking, destination and activity rankings,
 * budget, accommodation type, room-sharing preference, dining preferences, and departure city.
 */
export const TRIP_PLANNING_SURVEY: SurveyQuestion[] = [
  {
    id: 'availability',
    type: 'multiple_choice',
    question: 'When are you available for this trip?',
    required: true,
    options: [
      'Late June (16-30)',
      'Early July (1-15)',
      'Late July (16-31)',
      'Early August (1-15)',
      'Late August (16-31)',
    ],
  },
  {
    id: 'duration',
    type: 'ranking',
    question: 'Rank your preferred trip duration (1 = most preferred)',
    required: true,
    options: ['2 Days (Weekend)', '3-4 Days (Long weekend)', '5-7 Days (Full week)'],
  },
  {
    id: 'location_preferences',
    type: 'ranking',
    question: 'Rank these destinations by preference (1 = most interested)',
    required: true,
    options: ['Nashville', 'NYC', 'Chicago', 'LA', 'Austin', 'Boston', 'Charleston'],
  },
  {
    id: 'other_locations',
    type: 'text',
    question: 'Any other destination suggestions?',
    required: false,
  },
  {
    id: 'activity_preferences',
    type: 'ranking',
    question: 'Rank these activities by preference',
    required: true,
    options: ['Golf', 'Concert', 'Sporting Event', 'Beach Activities', 'Outdoor Adventures', 'Casino', 'Bars/Nightlife'],
  },
  {
    id: 'other_activities',
    type: 'text',
    question: 'Any other activities you\'d like to do?',
    required: false,
  },
  {
    id: 'trip_budget',
    type: 'budget',
    question: 'What\'s your budget for this trip (excluding flights)?',
    required: true,
    min: 300,
    max: 2000,
    step: 100,
  },
  {
    id: 'accommodation_type',
    type: 'single_choice',
    question: 'What type of accommodation would you prefer?',
    required: true,
    options: [
      'Cool (more expensive) Shared House (Airbnb)',
      'Cheapest Shared House (Airbnb)',
      'Depends on trip/location',
    ],
  },
  {
    id: 'room_sharing',
    type: 'single_choice',
    question: 'Room sharing preference?',
    required: true,
    options: ['Private room', '2 people to a room', 'Don\'t care'],
  },
  {
    id: 'dining_preferences',
    type: 'multiple_choice',
    question: 'Which dining experiences interest you? (select all)',
    required: true,
    options: [
      'High-end meal (1 time as whole group)',
      'Sports Bars & casual (as whole group)',
      'Group catered BBQ or similar',
      'Group Cooking Session',
    ],
  },
  {
    id: 'departure_city',
    type: 'text',
    question: 'Where would you be flying out of?',
    description: 'This helps us calculate individual flight costs',
    required: true,
  },
];

/**
 * SurveyService
 *
 * Provides static methods for managing trip surveys: retrieving default question
 * templates, creating survey records, collecting and analyzing responses, and
 * closing surveys once the group has finished responding.
 *
 * All methods are static — no instance is required.
 *
 * @example
 * ```ts
 * const survey = await SurveyService.createTripSurvey(tripId, 48);
 * const analysis = await SurveyService.analyzeSurveyResponses(survey.id);
 * await SurveyService.closeSurvey(survey.id);
 * ```
 */
export class SurveyService {
  /**
   * Return the default user-preferences survey question set.
   *
   * This template is used for initial onboarding to capture individual travel
   * style, budget range, interests, accommodation preference, and activity level.
   *
   * @returns The static {@link INITIAL_USER_SURVEY} question array.
   */
  static getUserPreferencesSurvey(): SurveyQuestion[] {
    return INITIAL_USER_SURVEY;
  }

  /**
   * Return the default trip-planning survey question set.
   *
   * This template is used when planning a specific group trip. It collects
   * availability windows, duration ranking, destination and activity rankings,
   * budget, accommodation type, room-sharing preference, dining preferences,
   * and each member's departure city.
   *
   * @returns The static {@link TRIP_PLANNING_SURVEY} question array.
   */
  static getTripPlanningSurvey(): SurveyQuestion[] {
    return TRIP_PLANNING_SURVEY;
  }

  /**
   * Aggregate all responses for a survey and return a structured analysis.
   *
   * Performs the following steps:
   *   1. Fetches the `TripSurvey` record and all associated responses from the DB.
   *   2. Counts trip members to compute a response-rate percentage.
   *   3. Analyzes budgets, date availability, location preferences, and activity
   *      preferences via private helper methods.
   *
   * @param surveyId - The ID of the `TripSurvey` to analyze.
   * @returns A promise resolving to a {@link SurveyAnalysis} object containing
   *   response counts, budget range, date availability, and ranked preferences.
   * @throws {Error} If no survey with the given `surveyId` exists in the database.
   */
  static async analyzeSurveyResponses(surveyId: string): Promise<SurveyAnalysis> {
    const survey = await prisma.tripSurvey.findUnique({
      where: { id: surveyId },
      include: {
        responses: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!survey) {
      throw new Error('Survey not found');
    }

    const responses = survey.responses;
    const totalResponses = responses.length;

    // Get trip member count for response rate
    const memberCount = await prisma.tripMember.count({
      where: { tripId: survey.tripId },
    });

    const responseRate = memberCount > 0 ? (totalResponses / memberCount) * 100 : 0;

    // Analyze budgets
    const budgetAnalysis = this.analyzeBudgets(responses);

    // Analyze date preferences
    const dateAnalysis = this.analyzeDatePreferences(responses);

    // Analyze location preferences
    const locationPreferences = this.analyzeLocationPreferences(responses);

    // Analyze activity preferences
    const activityPreferences = this.analyzeActivityPreferences(responses);

    return {
      totalResponses,
      responseRate,
      budgetAnalysis,
      dateAnalysis,
      locationPreferences,
      activityPreferences,
    };
  }

  /**
   * Derives a group-optimal budget and min/max range from individual survey responses.
   *
   * @param responses - Raw survey response records including user data.
   * @returns Budget analysis with the group-optimal figure, minimum, and maximum.
   */
  private static analyzeBudgets(responses: SurveyResponseWithUser[]): SurveyAnalysis['budgetAnalysis'] {
    const budgets = responses
      .map(r => {
        const answers = r.answers as SurveyAnswers;
        const budget = answers.trip_budget;
        if (typeof budget === 'number') return budget;
        if (typeof budget === 'object' && budget !== null && 'min' in budget && 'max' in budget) {
          const budgetObj = budget as { min: number; max: number };
          return (budgetObj.min + budgetObj.max) / 2;
        }
        return null;
      })
      .filter((b): b is number => b !== null);

    if (budgets.length === 0) {
      return { groupOptimal: 500, min: 300, max: 700 };
    }

    const min = Math.min(...budgets);
    const max = Math.max(...budgets);
    const groupOptimal = Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length);

    return { groupOptimal, min, max };
  }

  /**
   * Aggregates availability answers to identify the most popular date windows.
   *
   * @param responses - Raw survey response records including user data.
   * @returns Date analysis with the optimal range and a sorted availability list.
   */
  private static analyzeDatePreferences(responses: SurveyResponseWithUser[]): SurveyAnalysis['dateAnalysis'] {
    const availabilityCount: Record<string, number> = {};

    responses.forEach(r => {
      const answers = r.answers as SurveyAnswers;
      const availability = answers.availability;
      if (Array.isArray(availability)) {
        availability.forEach(date => {
          availabilityCount[date] = (availabilityCount[date] || 0) + 1;
        });
      }
    });

    const sortedDates = Object.entries(availabilityCount)
      .sort(([, a], [, b]) => b - a)
      .map(([date, count]) => ({ date, count }));

    // Find the optimal date range (most popular)
    const optimalRange = sortedDates[0]?.date || 'Early July (1-15)';
    
    // Convert to actual dates
    const dateRanges: Record<string, { start: Date; end: Date }> = {
      'Late June (16-30)': { start: new Date('2025-06-16'), end: new Date('2025-06-30') },
      'Early July (1-15)': { start: new Date('2025-07-01'), end: new Date('2025-07-15') },
      'Late July (16-31)': { start: new Date('2025-07-16'), end: new Date('2025-07-31') },
      'Early August (1-15)': { start: new Date('2025-08-01'), end: new Date('2025-08-15') },
      'Late August (16-31)': { start: new Date('2025-08-16'), end: new Date('2025-08-31') },
    };

    return {
      optimalRange: dateRanges[optimalRange] || dateRanges['Early July (1-15)'],
      availability: sortedDates,
    };
  }

  /**
   * Scores destinations based on ranking answers (inverse-rank scoring) and returns them
   * sorted from highest to lowest group interest.
   *
   * @param responses - Raw survey response records including user data.
   * @returns Sorted array of location preference scores with top-choice counts.
   */
  private static analyzeLocationPreferences(responses: SurveyResponseWithUser[]): SurveyAnalysis['locationPreferences'] {
    const locationScores: Record<string, { total: number; topChoice: number }> = {};
    const locations = ['Nashville', 'NYC', 'Chicago', 'LA', 'Austin', 'Boston', 'Charleston'];

    locations.forEach(loc => {
      locationScores[loc] = { total: 0, topChoice: 0 };
    });

    responses.forEach(r => {
      const answers = r.answers as SurveyAnswers;
      const rankings = answers.location_preferences;
      
      if (Array.isArray(rankings)) {
        rankings.forEach((loc, index) => {
          if (locationScores[loc as string]) {
            // Invert ranking so 1st = highest score
            locationScores[loc as string].total += (locations.length - index);
            if (index === 0) {
              locationScores[loc as string].topChoice += 1;
            }
          }
        });
      }
    });

    return Object.entries(locationScores)
      .map(([location, data]) => ({
        location,
        score: data.total,
        topChoiceCount: data.topChoice,
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Scores activities based on ranking answers (inverse-rank scoring) and returns them
   * sorted from highest to lowest group interest.
   *
   * @param responses - Raw survey response records including user data.
   * @returns Sorted array of activity preference scores.
   */
  private static analyzeActivityPreferences(responses: SurveyResponseWithUser[]): SurveyAnalysis['activityPreferences'] {
    const activityScores: Record<string, number> = {};
    const activities = ['Golf', 'Concert', 'Sporting Event', 'Beach Activities', 'Outdoor Adventures', 'Casino', 'Bars/Nightlife'];

    activities.forEach(act => {
      activityScores[act] = 0;
    });

    responses.forEach(r => {
      const answers = r.answers as SurveyAnswers;
      const rankings = answers.activity_preferences;
      
      if (Array.isArray(rankings)) {
        rankings.forEach((act, index) => {
          if (activityScores[act as string] !== undefined) {
            activityScores[act as string] += (activities.length - index);
          }
        });
      }
    });

    return Object.entries(activityScores)
      .map(([activity, score]) => ({ activity, score }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Mark a survey as closed in the database.
   *
   * Sets the survey's `status` field to `'CLOSED'`. After calling this method
   * no further responses should be accepted by the API routes that guard on
   * survey status. Call {@link analyzeSurveyResponses} before or after closing
   * to obtain the final analysis.
   *
   * @param surveyId - The ID of the `TripSurvey` to close.
   * @returns A promise that resolves when the database update has completed.
   */
  static async closeSurvey(surveyId: string): Promise<void> {
    await prisma.tripSurvey.update({
      where: { id: surveyId },
      data: { status: 'CLOSED' },
    });
  }

  /**
   * Create a new trip-planning survey record for the given trip.
   *
   * Persists a `TripSurvey` row using the {@link TRIP_PLANNING_SURVEY} question
   * template, sets status to `'ACTIVE'`, and assigns an expiration timestamp
   * calculated as `now + expirationHours`.
   *
   * @param tripId - The ID of the `Trip` this survey belongs to.
   * @param expirationHours - Number of hours until the survey expires (default: 48).
   * @returns A promise resolving to the newly created `TripSurvey` record.
   */
  static async createTripSurvey(tripId: string, expirationHours: number = 48): Promise<TripSurvey> {
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    return prisma.tripSurvey.create({
      data: {
        tripId,
        title: 'Trip Planning Survey',
        questions: TRIP_PLANNING_SURVEY as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        expiresAt,
      },
    });
  }
}

