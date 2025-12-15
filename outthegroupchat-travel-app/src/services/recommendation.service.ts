// Trip Recommendation Service
// Generates trip recommendations based on survey analysis

import { prisma } from '@/lib/prisma';
import { SurveyService } from './survey.service';
import type { 
  TripRecommendation, 
  Destination, 
  TripBudget,
  ItineraryDayData,
  SurveyAnalysis 
} from '@/types';

// Destination database with cost info
const DESTINATIONS: Record<string, {
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
  timezone: string;
  baseCostMultiplier: number;
  airportCode: string;
}> = {
  'Nashville': {
    city: 'Nashville',
    country: 'USA',
    coordinates: { lat: 36.1627, lng: -86.7816 },
    timezone: 'America/Chicago',
    baseCostMultiplier: 0.9,
    airportCode: 'BNA',
  },
  'NYC': {
    city: 'New York City',
    country: 'USA',
    coordinates: { lat: 40.7128, lng: -74.0060 },
    timezone: 'America/New_York',
    baseCostMultiplier: 1.4,
    airportCode: 'JFK',
  },
  'Chicago': {
    city: 'Chicago',
    country: 'USA',
    coordinates: { lat: 41.8781, lng: -87.6298 },
    timezone: 'America/Chicago',
    baseCostMultiplier: 1.1,
    airportCode: 'ORD',
  },
  'LA': {
    city: 'Los Angeles',
    country: 'USA',
    coordinates: { lat: 34.0522, lng: -118.2437 },
    timezone: 'America/Los_Angeles',
    baseCostMultiplier: 1.3,
    airportCode: 'LAX',
  },
  'Austin': {
    city: 'Austin',
    country: 'USA',
    coordinates: { lat: 30.2672, lng: -97.7431 },
    timezone: 'America/Chicago',
    baseCostMultiplier: 1.0,
    airportCode: 'AUS',
  },
  'Boston': {
    city: 'Boston',
    country: 'USA',
    coordinates: { lat: 42.3601, lng: -71.0589 },
    timezone: 'America/New_York',
    baseCostMultiplier: 1.2,
    airportCode: 'BOS',
  },
  'Charleston': {
    city: 'Charleston',
    country: 'USA',
    coordinates: { lat: 32.7765, lng: -79.9311 },
    timezone: 'America/New_York',
    baseCostMultiplier: 1.0,
    airportCode: 'CHS',
  },
};

// Destination-specific activities
const DESTINATION_ACTIVITIES: Record<string, {
  sports: string[];
  outdoor: string[];
  beach: string[];
  nightlife: string[];
  food: string[];
  culture: string[];
}> = {
  'Nashville': {
    sports: ['Sounds Baseball Game', 'Titans Game', 'Predators Game'],
    outdoor: ['Cumberland River Kayaking', 'Centennial Park', 'Golf at Hermitage'],
    beach: ['Percy Priest Lake', 'Pool Day'],
    nightlife: ['Broadway Bar Crawl', 'Printers Alley', 'The Gulch Bars'],
    food: ['Hot Chicken Tour', 'BBQ Trail', 'Biscuit Love Brunch'],
    culture: ['Country Music Hall of Fame', 'Grand Ole Opry', 'Ryman Auditorium'],
  },
  'NYC': {
    sports: ['Yankees Game', 'Mets Game', 'Knicks Game'],
    outdoor: ['Central Park', 'High Line Walk', 'Brooklyn Bridge Walk'],
    beach: ['Coney Island', 'Rockaway Beach'],
    nightlife: ['Greenwich Village', 'Rooftop Bars', 'Brooklyn Brewery'],
    food: ['Pizza Tour', 'Chinatown', 'Little Italy'],
    culture: ['MET Museum', 'Broadway Show', 'Statue of Liberty'],
  },
  'Chicago': {
    sports: ['Cubs at Wrigley', 'White Sox Game', 'Bulls Game'],
    outdoor: ['Lakefront Trail', 'Millennium Park', 'Lincoln Park'],
    beach: ['North Avenue Beach', 'Oak Street Beach'],
    nightlife: ['River North', 'Wicker Park', 'Blues Club'],
    food: ['Deep Dish Pizza Tour', 'Chicago Hot Dogs', 'Steakhouse Dinner'],
    culture: ['Art Institute', 'Architecture Tour', 'Field Museum'],
  },
  'LA': {
    sports: ['Dodgers Game', 'Lakers Game', 'Clippers Game'],
    outdoor: ['Griffith Park Hike', 'Hollywood Hills', 'Venice Boardwalk'],
    beach: ['Santa Monica', 'Venice Beach', 'Malibu'],
    nightlife: ['Hollywood Clubs', 'Downtown LA', 'Craft Brewery Tour'],
    food: ['Taco Tour', 'Korean BBQ', 'Celebrity Chef Restaurant'],
    culture: ['Getty Museum', 'Hollywood Walk of Fame', 'Universal Studios'],
  },
  'Austin': {
    sports: ['UT Game', 'Round Rock Express', 'Austin FC'],
    outdoor: ['Barton Springs', 'Lady Bird Lake', 'Zilker Park'],
    beach: ['Lake Travis', 'Barton Creek Greenbelt'],
    nightlife: ['Sixth Street', 'Rainey Street', 'Live Music Venues'],
    food: ['BBQ Trail', 'Taco Crawl', 'Food Truck Park'],
    culture: ['State Capitol', 'LBJ Library', 'South Congress'],
  },
  'Boston': {
    sports: ['Red Sox at Fenway', 'Celtics Game', 'Bruins Game'],
    outdoor: ['Freedom Trail', 'Boston Common', 'Harbor Islands'],
    beach: ['Carson Beach', 'Revere Beach'],
    nightlife: ['Faneuil Hall', 'Fenway Bars', 'Seaport District'],
    food: ['Seafood Tour', 'Italian in North End', 'Oyster Bar'],
    culture: ['Freedom Trail', 'Harvard Tour', 'Museum of Fine Arts'],
  },
  'Charleston': {
    sports: ['RiverDogs Game', 'College of Charleston'],
    outdoor: ['Historic Walking Tour', 'Shem Creek', 'Angel Oak Tree'],
    beach: ['Folly Beach', 'Sullivans Island', 'Isle of Palms'],
    nightlife: ['King Street', 'Upper King', 'Cocktail Club'],
    food: ['Lowcountry Cuisine', 'Shrimp & Grits Tour', 'Oyster Roast'],
    culture: ['Historic District', 'Fort Sumter', 'Plantation Tours'],
  },
};

// Base daily costs (will be multiplied by destination factor)
const BASE_DAILY_COSTS = {
  accommodation: 75,  // per person, shared
  food: 60,
  activities: 40,
  transport: 25,
};

// Airport code mapping for flight estimates
const AIRPORT_CODES: Record<string, string> = {
  'new york': 'JFK',
  'newark': 'EWR',
  'los angeles': 'LAX',
  'chicago': 'ORD',
  'houston': 'IAH',
  'phoenix': 'PHX',
  'philadelphia': 'PHL',
  'san antonio': 'SAT',
  'san diego': 'SAN',
  'dallas': 'DFW',
  'austin': 'AUS',
  'nashville': 'BNA',
  'boston': 'BOS',
  'charleston': 'CHS',
  'atlanta': 'ATL',
  'denver': 'DEN',
  'seattle': 'SEA',
  'miami': 'MIA',
  'orlando': 'MCO',
};

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

  private static async calculateIndividualCosts(
    members: any[],
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

    // Rough distance-based estimate
    const distanceFactors: Record<string, number> = {
      'JFK': 1.2, 'EWR': 1.2, 'LAX': 1.5, 'ORD': 1.0,
      'ATL': 0.9, 'DFW': 1.0, 'DEN': 1.1, 'SEA': 1.4,
      'MIA': 1.1, 'BOS': 1.1, 'PHX': 1.2, 'IAH': 1.0,
    };

    const factor = distanceFactors[originCode] || 1.0;
    return Math.round(250 * factor);
  }

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
        destination: recommendation.destination as any,
        startDate: recommendation.suggestedDates.start,
        endDate: recommendation.suggestedDates.end,
        budget: recommendation.estimatedBudget as any,
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
          } as any,
        },
      });
    }
  }
}

