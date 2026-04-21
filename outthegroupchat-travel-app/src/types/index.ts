// OutTheGroupchat - TypeScript Types
// These types extend Prisma-generated types with additional app-specific types
//
// Phase 6 cleanup (2026-04-21): trip-domain types that have no external callers
// were removed. Types still imported by active code are marked @deprecated.
// New-domain types (Meetup, CheckIn) are re-exported from their dedicated modules.

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

// Suppress unused-import warning: these Prisma types are referenced only by
// @deprecated interfaces below; they remain to avoid breaking the import graph
// until those interfaces are fully retired.
type _KeepPrismaImports = Trip | TripMember | Activity | TripSurvey | SurveyResponse | VotingSession | ItineraryDay | Notification;

// ============================================
// RE-EXPORTS — new domain type modules
// ============================================

export type {
  MeetupVisibility,
  AttendeeStatus,
  VenueCategory,
  VenueSearchResult,
  UserPreview,
  AttendeeResponse,
  MeetupResponse,
  MeetupListItem,
  CreateMeetupInput,
  UpdateMeetupInput,
} from './meetup';

export type {
  CheckInVisibility,
  CheckInUserPreview,
  CheckInVenuePreview,
  CheckInResponse,
  CheckInFeedItem,
  CreateCheckInInput,
  CheckInFeedResponse,
} from './checkin';

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

/**
 * @deprecated Trip domain is being retired (Phase 6). Use Crew/Meetup/CheckIn
 * domain types from src/types/social.ts and src/types/meetup.ts instead.
 * Still used by: src/components/profile/ProfileHeader.tsx
 */
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
// SHARED LOCATION TYPE
// ============================================

/** City/country shape used by geocoding, profile pages, and AI prompts. */
export interface Destination {
  city: string;
  country: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  timezone?: string;
}

// ============================================
// TRIP TYPES
// ============================================

/**
 * @deprecated Trip domain is being retired (Phase 6). Crew-based planning
 * replaces group trip management.
 * Still used by: src/hooks/useTrips.ts
 */
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

// Still actively used by: src/services/survey.service.ts, src/lib/ai/prompts/itinerary.ts

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
// AI/ML TYPES
// ============================================

// Still actively used by: src/app/api/ai/generate-itinerary, src/lib/ai/prompts/itinerary.ts

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

// Still used by: src/app/api/ai/generate-itinerary/route.ts
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

// Still used by: src/app/api/ai/suggest-activities/route.ts
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
