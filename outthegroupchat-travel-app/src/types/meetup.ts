/**
 * @module meetup-types
 * TypeScript interfaces and enum constants for the Meetups domain (Phase 4).
 * Frontend-safe — does not import from @prisma/client so these can be used
 * in 'use client' components without a server-side Prisma dependency.
 */

// ─── Enum constants (mirror Prisma enums) ──────────────────────────────────

export const MeetupVisibility = {
  PUBLIC: 'PUBLIC',
  CREW: 'CREW',
  INVITE_ONLY: 'INVITE_ONLY',
  PRIVATE: 'PRIVATE',
} as const;
export type MeetupVisibility = (typeof MeetupVisibility)[keyof typeof MeetupVisibility];

export const AttendeeStatus = {
  GOING: 'GOING',
  MAYBE: 'MAYBE',
  DECLINED: 'DECLINED',
} as const;
export type AttendeeStatus = (typeof AttendeeStatus)[keyof typeof AttendeeStatus];

export const VenueCategory = {
  BAR: 'BAR',
  COFFEE: 'COFFEE',
  RESTAURANT: 'RESTAURANT',
  PARK: 'PARK',
  GYM: 'GYM',
  COWORKING: 'COWORKING',
  OTHER: 'OTHER',
} as const;
export type VenueCategory = (typeof VenueCategory)[keyof typeof VenueCategory];

// ─── Venue ──────────────────────────────────────────────────────────────────

/** Minimal venue shape used in search results and venue pickers. */
export interface VenueSearchResult {
  id: string;
  name: string;
  address: string | null;
  city: string;
  country: string;
  category: VenueCategory;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
}

// ─── User preview (minimal, safe for client) ────────────────────────────────

export interface UserPreview {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
}

// ─── Attendee ────────────────────────────────────────────────────────────────

/** A single attendee record with embedded user info. */
export interface AttendeeResponse {
  id: string;
  meetupId: string;
  userId: string;
  status: AttendeeStatus;
  checkedInAt: string | null; // ISO 8601
  createdAt: string;
  updatedAt: string;
  user: UserPreview;
}

// ─── Meetup responses ────────────────────────────────────────────────────────

/** Full meetup payload returned by GET /api/meetups/[meetupId]. */
export interface MeetupResponse {
  id: string;
  title: string;
  description: string | null;
  hostId: string;
  venueId: string | null;
  venueName: string | null;
  cityId: string | null;
  scheduledAt: string; // ISO 8601
  endsAt: string | null;
  visibility: MeetupVisibility;
  capacity: number | null;
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
  host: UserPreview;
  venue: VenueSearchResult | null;
  attendees: AttendeeResponse[];
  attendeeCount: number;
}

/** Summary shape used in list views (GET /api/meetups). */
export interface MeetupListItem {
  id: string;
  title: string;
  description: string | null;
  hostId: string;
  venueId: string | null;
  venueName: string | null;
  cityId: string | null;
  scheduledAt: string;
  endsAt: string | null;
  visibility: MeetupVisibility;
  capacity: number | null;
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
  host: UserPreview;
  venue: Pick<VenueSearchResult, 'id' | 'name' | 'address' | 'city'> | null;
  attendeeCount: number;
  /** The authenticated user's current RSVP status, or null if not attending. */
  userAttendeeStatus: AttendeeStatus | null;
}

// ─── Input types ─────────────────────────────────────────────────────────────

/** Body for POST /api/meetups. */
export interface CreateMeetupInput {
  title: string;
  description?: string;
  venueId?: string;
  venueName?: string;
  cityId?: string;
  scheduledAt: string; // ISO 8601
  endsAt?: string;
  visibility?: MeetupVisibility;
  capacity?: number;
}

/** Body for PATCH /api/meetups/[meetupId]. */
export type UpdateMeetupInput = Partial<CreateMeetupInput>;
