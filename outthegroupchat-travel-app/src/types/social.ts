/**
 * @module social-types
 * Composite TypeScript types for the social domain, extending Prisma base types.
 * Used by API routes, components, and services in Phase 3+.
 */
import type {
  Crew,
  User,
  Meetup,
  MeetupAttendee,
  MeetupInvite,
  Venue,
  City,
  CheckIn,
  Poll,
  PollResponse,
  Post,
  CrewStatus,
  MeetupVisibility,
  AttendeeStatus,
  CheckInVisibility,
  PollType,
  PostType,
  VenueCategory,
} from '@prisma/client';

// Re-export enums for convenience
export type {
  CrewStatus,
  MeetupVisibility,
  AttendeeStatus,
  CheckInVisibility,
  PollType,
  PostType,
  VenueCategory,
};

// ─── User Preview (minimal user info for social displays) ──────────────
export type UserPreview = Pick<User, 'id' | 'name' | 'image' | 'city'>;

// ─── Crew ───────────────────────────────────────────────────────────────
export type CrewWithUsers = Crew & {
  userA: UserPreview;
  userB: UserPreview;
  requestedBy: UserPreview;
};

export type CrewStatus_Extended = CrewStatus | 'NOT_IN_CREW';

// ─── Meetups ────────────────────────────────────────────────────────────
export type MeetupWithHost = Meetup & {
  host: UserPreview;
  venue: Venue | null;
  city: City | null;
  _count: { attendees: number };
};

export type MeetupWithAttendees = MeetupWithHost & {
  attendees: (MeetupAttendee & { user: UserPreview })[];
  invites: (MeetupInvite & { user: UserPreview })[];
};

export type MeetupListItem = MeetupWithHost & {
  userAttendeeStatus: AttendeeStatus | null;
};

// ─── Check-ins ──────────────────────────────────────────────────────────
export type CheckInWithVenue = CheckIn & {
  user: UserPreview;
  venue: Venue | null;
  city: City | null;
};

// ─── Polls ──────────────────────────────────────────────────────────────
export type PollOption = {
  id: string;
  text: string;
};

export type PollWithResponses = Poll & {
  creator: UserPreview;
  responses: PollResponse[];
  options: PollOption[];
  userResponse: PollResponse | null;
};

// ─── Posts / Feed ───────────────────────────────────────────────────────
export type PostWithAuthor = Post & {
  author: UserPreview;
};

// ─── Venue ──────────────────────────────────────────────────────────────
export type VenueSearchResult = Pick<
  Venue,
  'id' | 'name' | 'address' | 'city' | 'category' | 'latitude' | 'longitude'
> & {
  distance?: number; // km from search origin
};

// ─── API Response wrappers ──────────────────────────────────────────────
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type CrewFeedResponse = {
  crews: CrewWithUsers[];
  pendingIncoming: CrewWithUsers[];
  pendingSent: CrewWithUsers[];
};
