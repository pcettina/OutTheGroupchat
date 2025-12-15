// OutTheGroupchat - TypeScript Types
// These types extend Prisma-generated types with additional app-specific types

import type { 
  User, 
  Trip, 
  TripMember, 
  Activity, 
  TripSurvey,
  SurveyResponse,
  VotingSession,
  ItineraryDay,
  Notification
} from '@prisma/client';

// ============================================
// USER TYPES
// ============================================

export interface UserPreferences {
  travelStyle?: 'adventure' | 'relaxation' | 'cultural' | 'family' | 'solo';
  interests?: string[];
  budgetRange?: {
    min: number;
    max: number;
    currency: string;
  };
  currency?: string;
  language?: string;
  timezone?: string;
}

export interface UserWithRelations extends User {
  ownedTrips?: Trip[];
  tripMemberships?: TripMember[];
  _count?: {
    followers: number;
    following: number;
    ownedTrips: number;
  };
}

// ============================================
// TRIP TYPES
// ============================================

export interface Destination {
  city: string;
  country: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  timezone?: string;
}

export interface TripBudget {
  total: number;
  currency: string;
  breakdown?: {
    accommodation: number;
    food: number;
    activities: number;
    transport: number;
  };
}

export interface MemberBudgetRange {
  min: number;
  max: number;
  currency: string;
}

export interface FlightDetails {
  estimatedCost: number;
  airline?: string;
  confirmation?: string;
  departureAirport?: string;
  arrivalAirport?: string;
}

export interface TripWithRelations extends Trip {
  owner?: User;
  members?: (TripMember & { user: User })[];
  activities?: Activity[];
  survey?: TripSurvey;
  itinerary?: ItineraryDay[];
  _count?: {
    members: number;
    activities: number;
  };
}

// ============================================
// SURVEY TYPES
// ============================================

export type QuestionType = 
  | 'single_choice' 
  | 'multiple_choice' 
  | 'ranking' 
  | 'scale' 
  | 'text' 
  | 'date_range' 
  | 'budget';

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  question: string;
  description?: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface SurveyAnswers {
  [questionId: string]: string | string[] | number | number[] | { start: string; end: string };
}

export interface SurveyAnalysis {
  totalResponses: number;
  responseRate: number;
  budgetAnalysis: {
    groupOptimal: number;
    min: number;
    max: number;
  };
  dateAnalysis: {
    optimalRange: { start: Date; end: Date };
    availability: { date: string; count: number }[];
  };
  locationPreferences: {
    location: string;
    score: number;
    topChoiceCount: number;
  }[];
  activityPreferences: {
    activity: string;
    score: number;
  }[];
}

// ============================================
// ACTIVITY TYPES
// ============================================

export interface ActivityLocation {
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  placeId?: string;
  nearestTransit?: {
    type: 'train' | 'bus' | 'subway';
    name: string;
    distance: number;
    directions?: string;
  }[];
}

export interface ActivityCostDetails {
  basePrice: number;
  currency: string;
  includedItems?: string[];
  additionalCosts?: {
    item: string;
    cost: number;
  }[];
}

export interface ActivityRequirements {
  minimumAge?: number;
  physicalLevel?: 'easy' | 'moderate' | 'challenging';
  requiredItems?: string[];
  recommendedItems?: string[];
  accessibility?: {
    wheelchairAccessible: boolean;
    familyFriendly: boolean;
    petFriendly: boolean;
  };
}

export interface ActivityExternalLinks {
  websiteUrl?: string;
  bookingUrl?: string;
  ticketmasterUrl?: string;
  googleMapsUrl?: string;
}

export interface ActivityWithEngagement extends Activity {
  savedBy?: { userId: string }[];
  comments?: { id: string; text: string; user: User; createdAt: Date }[];
  ratings?: { score: number }[];
  _count?: {
    savedBy: number;
    comments: number;
    ratings: number;
  };
  averageRating?: number;
}

// ============================================
// VOTING TYPES
// ============================================

export interface VotingOption {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface VotingResults {
  sessionId: string;
  totalVotes: number;
  results: {
    optionId: string;
    votes: number;
    percentage: number;
    averageRank?: number;
  }[];
  winner?: VotingOption;
}

// ============================================
// ITINERARY TYPES
// ============================================

export interface ItineraryItemData {
  id: string;
  order: number;
  startTime?: string;
  endTime?: string;
  activity?: Activity;
  customTitle?: string;
  notes?: string;
}

export interface ItineraryDayData {
  id: string;
  dayNumber: number;
  date: Date;
  notes?: string;
  items: ItineraryItemData[];
}

// ============================================
// TRIP RECOMMENDATION TYPES
// ============================================

export interface TripRecommendation {
  id: string;
  destination: Destination;
  matchScore: number;
  estimatedBudget: TripBudget;
  suggestedDates: { start: Date; end: Date };
  suggestedActivities: Activity[];
  itinerary: ItineraryDayData[];
  individualCosts: {
    memberId: string;
    memberName: string;
    flightCost: number;
    localCost: number;
    totalCost: number;
  }[];
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// EXTERNAL API TYPES
// ============================================

export interface FlightSearchParams {
  originCode: string;
  destinationCode: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  nonStop?: boolean;
}

export interface FlightOffer {
  id: string;
  price: {
    total: string;
    currency: string;
  };
  itineraries: {
    duration: string;
    segments: {
      departure: {
        iataCode: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        at: string;
      };
      carrierCode: string;
      number: string;
      duration: string;
    }[];
  }[];
}

export interface EventSearchResult {
  id: string;
  name: string;
  type: 'ticketmaster' | 'eventbrite' | 'seatgeek';
  date: string;
  venue: string;
  priceRange?: {
    min: number;
    max: number;
  };
  url: string;
  imageUrl?: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  priceLevel?: number;
  types: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  photos?: string[];
  openingHours?: string[];
}

// ============================================
// AI/ML TYPES
// ============================================

export interface TripPreferences {
  travelStyle?: 'adventure' | 'relaxation' | 'cultural' | 'family' | 'solo';
  interests?: string[];
  budgetRange?: {
    min: number;
    max: number;
    currency: string;
  };
  pace?: 'relaxed' | 'moderate' | 'packed';
  accommodation?: 'budget' | 'mid-range' | 'luxury';
  dining?: 'budget' | 'local' | 'upscale' | 'mixed';
}

export interface AIGeneratedItinerary {
  overview: string;
  days: {
    dayNumber: number;
    date: string;
    theme: string;
    items: {
      time: string;
      title: string;
      description: string;
      location: string;
      duration: number;
      cost: { amount: number; per: 'person' | 'group' };
      category: 'food' | 'activity' | 'transport' | 'leisure';
      optional: boolean;
      notes?: string;
    }[];
    meals: {
      breakfast?: { name: string; cuisine: string; priceRange: string };
      lunch?: { name: string; cuisine: string; priceRange: string };
      dinner?: { name: string; cuisine: string; priceRange: string };
    };
    weatherBackup?: string;
  }[];
  budgetBreakdown: {
    accommodation: number;
    food: number;
    activities: number;
    transport: number;
    total: number;
  };
  packingTips: string[];
  localTips: string[];
}

export interface AIActivityRecommendation {
  name: string;
  category: 'food' | 'entertainment' | 'outdoors' | 'culture' | 'nightlife' | 'sports';
  description: string;
  address: string;
  priceRange: string;
  estimatedCost: { amount: number; per: 'person' | 'group' };
  duration: number;
  bestTime: string;
  bookingRequired: boolean;
  groupFriendly: boolean;
  goodFor: string[];
  tips?: string;
}

export interface AIDestinationMatch {
  city: string;
  country: string;
  matchScore: number;
  whyItWorks: string;
  bestFor: string[];
  estimatedBudget: { min: number; max: number; currency: string };
  bestTimeToVisit: string;
  potentialConcerns: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tripId?: string;
    action?: string;
    data?: Record<string, unknown>;
  };
}

