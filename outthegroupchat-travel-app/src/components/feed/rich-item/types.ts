// ─── Sub-types ───────────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  alt?: string;
  thumbnail?: string;
}

export interface Reaction {
  emoji: string;
  label: string;
  count: number;
}

export interface Comment {
  id: string;
  text: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  createdAt: string;
  likes: number;
}

export interface FeedUser {
  id: string;
  name: string | null;
  image: string | null;
}

// ─── Payload shapes for each item type ──────────────────────────────────────

export interface TripPayload {
  id: string;
  title: string;
  destination: { city: string; country: string };
  status: string;
  coverImage?: string;
  startDate?: string;
  endDate?: string;
}

export interface ActivityPayload {
  id: string;
  name: string;
  category: string;
  description: string | null;
  cost?: number;
}

export interface MeetupPayload {
  id: string;
  title: string;
  venue?: string | null;
  scheduledFor?: string | null;
}

export interface CheckInPayload {
  id: string;
  venue?: string | null;
  city?: string | null;
  activeUntil?: string | null;
}

export interface CrewPayload {
  id: string;
  userA: { id: string; name: string | null };
  userB: { id: string; name: string | null };
}

export interface PostPayload {
  id: string;
  content: string;
}

// ─── Discriminated union for item type + payload ─────────────────────────────

export type FeedItemType =
  | 'meetup_created'
  | 'check_in_posted'
  | 'crew_formed'
  | 'meetup_attended'
  | 'post_created'
  | 'trip_created'
  | 'trip_completed'
  | 'activity_added'
  | 'member_joined'
  | 'review_posted'
  | 'trip_in_progress'
  | 'photo_shared';

// ─── Shared engagement props ──────────────────────────────────────────────────

export interface EngagementProps {
  media?: MediaItem[];
  reactions?: Reaction[];
  comments?: Comment[];
  userReaction?: string | null;
  isSaved?: boolean;
  onReact?: (emoji: string) => void;
  onUnreact?: () => void;
  onComment?: (text: string) => void;
  onShare?: () => void;
  onSave?: () => void;
}

// ─── Full props interface ─────────────────────────────────────────────────────

export interface RichFeedItemProps extends EngagementProps {
  id: string;
  type: FeedItemType;
  timestamp: string;
  user: FeedUser;
  content?: string;
  // Legacy trip-based fields
  trip?: TripPayload;
  activity?: ActivityPayload;
  // New feed item payload fields
  meetup?: MeetupPayload;
  checkIn?: CheckInPayload;
  crew?: CrewPayload;
  post?: PostPayload;
}

// ─── Static config for header badge ──────────────────────────────────────────

export const typeConfig: Record<FeedItemType, { icon: string; action: string; color: string }> = {
  // New types
  meetup_created:  { icon: '📅', action: 'created a meetup',  color: 'teal' },
  check_in_posted: { icon: '📍', action: 'checked in',         color: 'emerald' },
  crew_formed:     { icon: '🤝', action: 'formed a crew',      color: 'blue' },
  meetup_attended: { icon: '🎉', action: 'attended a meetup',  color: 'amber' },
  post_created:    { icon: '✍️', action: 'posted',              color: 'violet' },
  // Legacy types (kept for backward compatibility — rendered as generic fallback)
  trip_created:    { icon: '✈️', action: 'started planning',   color: 'emerald' },
  trip_completed:  { icon: '🎉', action: 'completed',          color: 'amber' },
  trip_in_progress:{ icon: '🌍', action: 'is traveling',       color: 'blue' },
  activity_added:  { icon: '📍', action: 'added an activity',  color: 'purple' },
  member_joined:   { icon: '👋', action: 'joined',             color: 'pink' },
  review_posted:   { icon: '⭐', action: 'reviewed',           color: 'amber' },
  photo_shared:    { icon: '📸', action: 'shared photos from', color: 'violet' },
};

export const categoryEmojis: Record<string, string> = {
  FOOD: '🍽️',
  CULTURE: '🎭',
  NATURE: '🌲',
  ENTERTAINMENT: '🎪',
  NIGHTLIFE: '🌙',
  SPORTS: '⚽',
  SHOPPING: '🛍️',
  OTHER: '✨',
};
