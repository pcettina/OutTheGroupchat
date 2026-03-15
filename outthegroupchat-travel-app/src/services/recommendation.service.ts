/**
 * Trip Recommendation Service
 *
 * Generates AI-assisted trip recommendations based on survey analysis,
 * member preferences, and budget constraints.
 *
 * Static destination data (DESTINATIONS, DESTINATION_ACTIVITIES, costs, airport
 * codes) lives in `./recommendation-data` to keep this file under 600 lines.
 *
 * @module recommendation.service
 */

import { prisma } from '@/lib/prisma';
import { SurveyService } from './survey.service';
import type { Prisma } from '@prisma/client';
import type {
  TripRecommendation,
  Destination,
  TripBudget,
  ItineraryDayData,
  SurveyAnalysis
} from '@/types';
import {
  DESTINATIONS,
  DESTINATION_ACTIVITIES,
  BASE_DAILY_COSTS,
  AIRPORT_CODES,
  FLIGHT_DISTANCE_FACTORS,
} from './recommendation-data';

type TripMemberWithUser = Prisma.TripMemberGetPayload<{
  include: { user: { select: { id: true; name: true; city: true; preferences: true } } };
}>;

export class RecommendationService {
  /**
   * Generate trip recommendations based on survey analysis
   */
  static async generateRecommendations(
    tripId: string,
    surveyId: string,
    count: number = 5
  ): Promise<TripRecommendation[]> {
    // Get survey analysis
    const analysis = await SurveyService.analyzeSurveyResponses(surveyId);
    
    // Get trip members
    const members = await prisma.tripMember.findMany({
      where: { tripId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            city: true,
            preferences: true,
          },
        },
      },
    });

    // Get top destinations
    const topDestinations = analysis.locationPreferences.slice(0, count);

    // Generate recommendations for each top destination
    const recommendations: TripRecommendation[] = [];

    for (let i = 0; i < topDestinations.length; i++) {
      const destPref = topDestinations[i];
      const destInfo = DESTINATIONS[destPref.location];
      
      if (!destInfo) continue;

      const destination: Destination = {
        city: destInfo.city,
        country: destInfo.country,
        coordinates: destInfo.coordinates,
        timezone: destInfo.timezone,
      };

      // Calculate dates
      const { start, end } = analysis.dateAnalysis.optimalRange;
      const durationDays = 4; // Default to long weekend

      // Calculate budget
      const budget = this.calculateBudget(
        destInfo,
        durationDays,
        analysis.budgetAnalysis.groupOptimal
      );

      // Generate itinerary
      const itinerary = this.generateItinerary(
        destPref.location,
        start,
        durationDays,
        analysis.activityPreferences
      );

      // Calculate individual costs
      const individualCosts = await this.calculateIndividualCosts(
        members,
        destInfo,
        budget,
        durationDays
      );

      // Calculate match score
      const matchScore = this.calculateMatchScore(
        destPref,
        analysis,
        topDestinations.length - i
      );

      recommendations.push({
        id: `rec-${tripId}-${i}`,
        destination,
        matchScore,
        estimatedBudget: budget,
        suggestedDates: { start, end: new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000) },
        suggestedActivities: [],
        itinerary,
        individualCosts,
      });
    }

    return recommendations.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Compute estimated trip budget from base daily costs and destination multiplier.
   *
   * @param destInfo - Destination metadata including baseCostMultiplier
   * @param durationDays - Number of days for the trip
   * @param targetBudget - Group-optimal budget from survey analysis (unused currently; reserved)
   * @returns Structured TripBudget with total and line-item breakdown
   */
  private static calculateBudget(
    destInfo: typeof DESTINATIONS[string],
    durationDays: number,
    targetBudget: number
  ): TripBudget {
    const multiplier = destInfo.baseCostMultiplier;
    
    const accommodation = Math.round(BASE_DAILY_COSTS.accommodation * multiplier * durationDays);
    const food = Math.round(BASE_DAILY_COSTS.food * multiplier * durationDays);
    const activities = Math.round(BASE_DAILY_COSTS.activities * multiplier * durationDays);
    const transport = Math.round(BASE_DAILY_COSTS.transport * multiplier * durationDays);

    return {
      total: accommodation + food + activities + transport,
      currency: 'USD',
      breakdown: {
        accommodation,
        food,
        activities,
        transport,
      },
    };
  }

  /**
   * Build a day-by-day itinerary for a destination based on activity preferences.
   *
   * @param destination - Key into DESTINATION_ACTIVITIES (e.g. 'Nashville')
   * @param startDate - First day of the trip
   * @param durationDays - Total number of trip days
   * @param activityPrefs - Ranked activity preferences from survey analysis
   * @returns Array of ItineraryDayData objects, one per day
   */
  private static generateItinerary(
    destination: string,
    startDate: Date,
    durationDays: number,
    activityPrefs: SurveyAnalysis['activityPreferences']
  ): ItineraryDayData[] {
    const activities = DESTINATION_ACTIVITIES[destination] || DESTINATION_ACTIVITIES['Nashville'];
    const topActivities = activityPrefs.slice(0, 3).map(a => a.activity.toLowerCase());
    
    const itinerary: ItineraryDayData[] = [];

    for (let day = 1; day <= durationDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + day - 1);
      
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDate.getDay()];

      const items: ItineraryDayData['items'] = [];

      // Morning activity
      if (day === 1) {
        items.push({
          id: `day${day}-morning`,
          order: 1,
          startTime: '12:00',
          endTime: '14:00',
          customTitle: 'Arrival and Check-in',
        });
      } else if (topActivities.includes('golf') && (day === 2 || day === durationDays - 1)) {
        items.push({
          id: `day${day}-morning`,
          order: 1,
          startTime: '09:00',
          endTime: '12:00',
          customTitle: activities.outdoor[2] || 'Morning Golf',
        });
      } else {
        items.push({
          id: `day${day}-morning`,
          order: 1,
          startTime: '10:00',
          endTime: '12:00',
          customTitle: activities.outdoor[Math.floor(Math.random() * activities.outdoor.length)],
        });
      }

      // Lunch
      items.push({
        id: `day${day}-lunch`,
        order: 2,
        startTime: '12:30',
        endTime: '14:00',
        customTitle: activities.food[Math.floor(Math.random() * activities.food.length)],
      });

      // Afternoon activity
      if (day === 1) {
        items.push({
          id: `day${day}-afternoon`,
          order: 3,
          startTime: '15:00',
          endTime: '18:00',
          customTitle: 'Group Welcome Gathering',
        });
      } else if (topActivities.includes('sporting event') && day === 2) {
        items.push({
          id: `day${day}-afternoon`,
          order: 3,
          startTime: '14:00',
          endTime: '18:00',
          customTitle: activities.sports[Math.floor(Math.random() * activities.sports.length)],
        });
      } else if (topActivities.includes('beach activities') && day !== durationDays) {
        items.push({
          id: `day${day}-afternoon`,
          order: 3,
          startTime: '14:00',
          endTime: '18:00',
          customTitle: activities.beach[Math.floor(Math.random() * activities.beach.length)],
        });
      } else {
        items.push({
          id: `day${day}-afternoon`,
          order: 3,
          startTime: '15:00',
          endTime: '18:00',
          customTitle: activities.culture[Math.floor(Math.random() * activities.culture.length)],
        });
      }

      // Evening activity
      if (day === 1) {
        items.push({
          id: `day${day}-evening`,
          order: 4,
          startTime: '19:00',
          endTime: '23:00',
          customTitle: 'Group Welcome Dinner',
        });
      } else if (day === durationDays) {
        items.push({
          id: `day${day}-evening`,
          order: 4,
          startTime: '19:00',
          endTime: '22:00',
          customTitle: 'Final Group Dinner and Farewell',
        });
      } else if (topActivities.includes('bars/nightlife')) {
        items.push({
          id: `day${day}-evening`,
          order: 4,
          startTime: '20:00',
          customTitle: activities.nightlife[Math.floor(Math.random() * activities.nightlife.length)],
        });
      } else {
        items.push({
          id: `day${day}-evening`,
          order: 4,
          startTime: '19:00',
          endTime: '22:00',
          customTitle: 'Group Dinner',
        });
      }

      itinerary.push({
        id: `day-${day}`,
        dayNumber: day,
        date: currentDate,
        notes: `${dayOfWeek}`,
        items,
      });
    }

    return itinerary;
  }

  /**
   * Calculate per-member cost estimates including estimated flight costs.
   *
   * @param members - Trip members with user profiles and departure city data
   * @param destInfo - Destination metadata (used for airport code lookup)
   * @param budget - Computed group budget (local costs)
   * @param durationDays - Trip duration (reserved for future per-night scaling)
   * @returns Array of individual cost breakdowns per member
   */
  private static async calculateIndividualCosts(
    members: TripMemberWithUser[],
    destInfo: typeof DESTINATIONS[string],
    budget: TripBudget,
    durationDays: number
  ): Promise<TripRecommendation['individualCosts']> {
    return members.map(member => {
      // Estimate flight cost based on departure city
      const departureCity = member.departureCity || member.user.city || 'Unknown';
      const flightCost = this.estimateFlightCost(departureCity, destInfo.airportCode);

      return {
        memberId: member.userId,
        memberName: member.user.name || 'Unknown',
        flightCost,
        localCost: budget.total,
        totalCost: flightCost + budget.total,
      };
    });
  }

  /**
   * Estimate one-way flight cost based on origin city and destination airport code.
   *
   * Uses AIRPORT_CODES to map city names to IATA codes, then applies
   * FLIGHT_DISTANCE_FACTORS to a $250 base fare. Returns $400 as a fallback
   * when the origin city is not in the lookup table.
   *
   * In production this should call the Amadeus Flights Offers Search API.
   *
   * @param departureCity - User's home city (free-text, lowercased for lookup)
   * @param destinationCode - Destination IATA airport code (e.g. 'BNA')
   * @returns Estimated one-way flight cost in USD
   */
  private static estimateFlightCost(departureCity: string, destinationCode: string): number {
    // Simplified flight cost estimation
    // In production, this would call the Amadeus API
    const normalized = departureCity.toLowerCase();
    const originCode = AIRPORT_CODES[normalized];

    if (!originCode) {
      return 400; // Default estimate
    }

    // Same city
    if (originCode === destinationCode) {
      return 0;
    }

    // Rough distance-based estimate using FLIGHT_DISTANCE_FACTORS lookup table
    const factor = FLIGHT_DISTANCE_FACTORS[originCode] ?? 1.0;
    return Math.round(250 * factor);
  }

  /**
   * Calculate a 0–100 match score for a destination recommendation.
   *
   * Score components:
   *   - Location score (0–50): relative score vs. the top-ranked destination
   *   - Rank bonus (0–30): higher absolute rank yields more points
   *   - Top-choice bonus (5 pts per member who ranked this as #1)
   *
   * @param destPref - Location preference entry from survey analysis
   * @param analysis - Full survey analysis result
   * @param rank - 1-based rank among top destinations (higher = better)
   * @returns Integer score clamped to [0, 100]
   */
  private static calculateMatchScore(
    destPref: SurveyAnalysis['locationPreferences'][0],
    analysis: SurveyAnalysis,
    rank: number
  ): number {
    // Score from 0-100
    const maxLocationScore = analysis.locationPreferences[0]?.score || 1;
    const locationScore = (destPref.score / maxLocationScore) * 50;

    // Rank bonus (higher rank = more bonus)
    const rankBonus = (rank / analysis.locationPreferences.length) * 30;

    // Top choice bonus
    const topChoiceBonus = destPref.topChoiceCount * 5;

    return Math.min(100, Math.round(locationScore + rankBonus + topChoiceBonus));
  }

  /**
   * Save selected recommendation to the trip
   */
  static async applyRecommendation(
    tripId: string,
    recommendation: TripRecommendation
  ): Promise<void> {
    // Update trip with recommendation data
    await prisma.trip.update({
      where: { id: tripId },
      data: {
        destination: recommendation.destination as unknown as Prisma.InputJsonValue,
        startDate: recommendation.suggestedDates.start,
        endDate: recommendation.suggestedDates.end,
        budget: recommendation.estimatedBudget as unknown as Prisma.InputJsonValue,
        status: 'VOTING',
      },
    });

    // Create itinerary days
    for (const day of recommendation.itinerary) {
      const itineraryDay = await prisma.itineraryDay.create({
        data: {
          tripId,
          dayNumber: day.dayNumber,
          date: day.date,
          notes: day.notes,
        },
      });

      // Create itinerary items
      for (const item of day.items) {
        await prisma.itineraryItem.create({
          data: {
            itineraryDayId: itineraryDay.id,
            order: item.order,
            startTime: item.startTime,
            endTime: item.endTime,
            customTitle: item.customTitle,
            notes: item.notes,
          },
        });
      }
    }

    // Update member flight details
    for (const cost of recommendation.individualCosts) {
      await prisma.tripMember.updateMany({
        where: { tripId, userId: cost.memberId },
        data: {
          flightDetails: {
            estimatedCost: cost.flightCost,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
}

