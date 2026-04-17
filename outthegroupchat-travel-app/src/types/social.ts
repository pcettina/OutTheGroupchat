/**
 * @module social-types
 * Composite TypeScript types for the social domain, extending Prisma base types.
 * Used by API routes, components, and services in Phase 3+.
 */
import type {
  Connection,
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
  ConnectionStatus,
  MeetupVisibility,
  AttendeeStatus,
  CheckInVisibility,
  PollType,
  PostType,
  VenueCategory,
} from '@prisma/client';

// Re-export enums for convenience
export type {
  ConnectionStatus,
  MeetupVisibility,
  AttendeeStatus,
  CheckInVisibility,
  PollType,
  PostType,
  VenueCategory,
};

// ─── User Preview (minimal user info for social displays) ──────────────
export type UserPreview = Pick<User, 'id' | 'name' | 'image' | 'city'>;

// ─── Connections ────────────────────────────────────────────────────────
export type ConnectionWithUsers = Connection & {
  userA: UserPreview;
  userB: UserPreview;
  requestedBy: UserPreview;
};

export type ConnectionStatus_Extended = ConnectionStatus | 'NOT_CONNECTED';

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

export type ConnectionFeedResponse = {
  connections: ConnectionWithUsers[];
  pendingIncoming: ConnectionWithUsers[];
  pendingSent: ConnectionWithUsers[];
};
