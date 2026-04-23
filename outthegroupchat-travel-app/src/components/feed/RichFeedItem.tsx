'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';
import { MediaGallery } from './MediaGallery';
import { FeedItemHeader } from './FeedItemHeader';
import { FeedItemActions } from './FeedItemActions';
import { LegacyTripCard, LegacyActivityCard } from './FeedItemLegacyCards';
import type { TripPayload, ActivityPayload } from './FeedItemLegacyCards';

/**
 * Sanitize a plain text string to remove any HTML/script injection.
 * Returns an empty string if input is null/undefined.
 */
function sanitizeText(value: string | null | undefined): string {
  if (!value) return '';
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Sanitize a URL string. Returns an empty string if the URL contains
 * a dangerous scheme (e.g. javascript:) or any injected HTML.
 */
function sanitizeUrl(value: string | null | undefined): string {
  if (!value) return '';
  const cleaned = DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // Block javascript: and data: schemes
  if (/^(javascript|data|vbscript):/i.test(cleaned.trim())) return '';
  return cleaned;
}

/**
 * Sanitize a route segment used in hrefs (e.g. user.id, trip.id).
 * Strips HTML and ensures the value is safe for interpolation into a path.
 */
function sanitizeRouteSegment(value: string | null | undefined): string {
  if (!value) return '';
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// ─── Sub-types ───────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  alt?: string;
  thumbnail?: string;
}

interface Reaction {
  emoji: string;
  label: string;
  count: number;
}

interface Comment {
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

interface FeedUser {
  id: string;
  name: string | null;
  image: string | null;
}

// ─── Payload shapes for new item types ───────────────────────────────────────

interface MeetupPayload {
  id: string;
  title: string;
  venue?: string | null;
  scheduledFor?: string | null;
}

interface CheckInPayload {
  id: string;
  venue?: string | null;
  city?: string | null;
  activeUntil?: string | null;
}

interface CrewPayload {
  id: string;
  userA: { id: string; name: string | null };
  userB: { id: string; name: string | null };
}

interface PostPayload {
  id: string;
  content: string;
}

// ─── Discriminated union for item type ───────────────────────────────────────

type FeedItemType =
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

interface EngagementProps {
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

interface RichFeedItemProps extends EngagementProps {
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

const typeConfig: Record<FeedItemType, { icon: string; action: string; color: string }> = {
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

// ─── Small helper: active indicator dot ──────────────────────────────────────

function ActiveDot({ activeUntil }: { activeUntil: string | null | undefined }) {
  if (!activeUntil) return null;
  const isActive = new Date(activeUntil).getTime() > Date.now();
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
      }`}
      aria-label={isActive ? 'Active now' : 'Expired'}
    />
  );
}

// ─── Card sub-components for new types ───────────────────────────────────────

function MeetupCreatedCard({ meetup }: { meetup: MeetupPayload }) {
  const safeTitle = sanitizeText(meetup.title);
  const safeVenue = sanitizeText(meetup.venue);
  const safeMeetupId = sanitizeRouteSegment(meetup.id);

  return (
    <Link href={`/meetups/${safeMeetupId}`} className="block mx-4 mb-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-100 dark:border-teal-800 p-4"
      >
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{safeTitle}</h3>
        {safeVenue && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>📍</span>
            {safeVenue}
          </p>
        )}
        {meetup.scheduledFor && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>📅</span>
            {new Date(meetup.scheduledFor).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        )}
      </motion.div>
    </Link>
  );
}

function CheckInPostedCard({ checkIn }: { checkIn: CheckInPayload }) {
  const safeVenue = sanitizeText(checkIn.venue);
  const safeCity = sanitizeText(checkIn.city);
  const safeCheckInId = sanitizeRouteSegment(checkIn.id);

  return (
    <Link href={`/checkins/${safeCheckInId}`} className="block mx-4 mb-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 p-4"
      >
        <div className="flex items-center gap-2">
          <ActiveDot activeUntil={checkIn.activeUntil} />
          <div className="min-w-0">
            {safeVenue && (
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {safeVenue}
              </p>
            )}
            {safeCity && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                <span>🏙️</span>
                {safeCity}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function CrewFormedCard({ crew }: { crew: CrewPayload }) {
  const nameA = sanitizeText(crew.userA.name) || 'Someone';
  const nameB = sanitizeText(crew.userB.name) || 'Someone';
  const safeIdA = sanitizeRouteSegment(crew.userA.id);
  const safeIdB = sanitizeRouteSegment(crew.userB.id);

  return (
    <div className="mx-4 mb-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 p-4">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        <Link
          href={`/profile/${safeIdA}`}
          className="font-semibold text-slate-900 dark:text-white hover:underline"
        >
          {nameA}
        </Link>
        {' '}and{' '}
        <Link
          href={`/profile/${safeIdB}`}
          className="font-semibold text-slate-900 dark:text-white hover:underline"
        >
          {nameB}
        </Link>
        {' '}are now Crew 🤝
      </p>
    </div>
  );
}

function MeetupAttendedCard({ meetup }: { meetup: MeetupPayload }) {
  const safeTitle = sanitizeText(meetup.title);
  const safeMeetupId = sanitizeRouteSegment(meetup.id);

  return (
    <Link href={`/meetups/${safeMeetupId}`} className="block mx-4 mb-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 p-4"
      >
        <p className="text-sm font-medium text-slate-900 dark:text-white">{safeTitle}</p>
      </motion.div>
    </Link>
  );
}

function PostCreatedCard({ post }: { post: PostPayload }) {
  const safeContent = sanitizeText(post.content);

  return (
    <div className="mx-4 mb-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800 p-4">
      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">
        {safeContent}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RichFeedItem({
  id,
  type,
  timestamp,
  user,
  content,
  trip,
  activity,
  meetup,
  checkIn,
  crew,
  post,
  media = [],
  reactions = [],
  comments = [],
  userReaction,
  isSaved = false,
  onReact,
  onUnreact,
  onComment: _onComment,
  onShare: _onShare,
  onSave,
}: RichFeedItemProps) {
  const [showComments, setShowComments] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [localComments] = useState(comments);
  const [saved, setSaved] = useState(isSaved);

  // Guard: unknown type → graceful null
  const config = typeConfig[type];
  if (!config) return null;

  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  // Sanitize user-supplied values used in hrefs and image src attributes
  const safeUserId = sanitizeRouteSegment(user.id);
  const safeUserImage = sanitizeUrl(user.image);
  const safeUserName = sanitizeText(user.name);
  const safeTripId = trip ? sanitizeRouteSegment(trip.id) : '';
  const safeTripCoverImage = trip ? sanitizeUrl(trip.coverImage) : '';
  const safeTripTitle = trip ? sanitizeText(trip.title) : '';
  const safeTripCity = trip ? sanitizeText(trip.destination.city) : '';
  const safeTripCountry = trip ? sanitizeText(trip.destination.country) : '';
  const safeActivityName = activity ? sanitizeText(activity.name) : '';
  const safeActivityDescription = activity ? sanitizeText(activity.description) : '';
  const safeContent = sanitizeText(content);

  const handleSaveToggle = () => {
    setSaved(!saved);
    onSave?.();
  };

  const totalReactions = reactions.reduce((sum, r) => sum + r.count, 0);

  // Determine the canonical entity id used for CommentThread / ShareModal
  const entityId: string =
    safeTripId ||
    sanitizeRouteSegment(activity?.id) ||
    sanitizeRouteSegment(meetup?.id) ||
    sanitizeRouteSegment(checkIn?.id) ||
    sanitizeRouteSegment(post?.id) ||
    sanitizeRouteSegment(id);

  // Build shareData for ShareModal
  const shareData = trip
    ? {
        id: safeTripId,
        type: 'trip' as const,
        title: safeTripTitle,
        destination: `${safeTripCity}, ${safeTripCountry}`,
        imageUrl: safeTripCoverImage || undefined,
        userName: safeUserName || undefined,
      }
    : activity
    ? {
        id: sanitizeRouteSegment(activity.id),
        type: 'activity' as const,
        title: safeActivityName,
        description: safeActivityDescription || undefined,
        userName: safeUserName || undefined,
      }
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <FeedItemHeader
        user={user}
        config={config}
        timeAgo={timeAgo}
        safeUserId={safeUserId}
        safeUserImage={safeUserImage}
        safeUserName={safeUserName}
        safeContent={safeContent}
        saved={saved}
        onSaveToggle={handleSaveToggle}
      />

      {/* ── New feed type cards ────────────────────────────────────────────── */}

      {type === 'meetup_created' && meetup && (
        <MeetupCreatedCard meetup={meetup} />
      )}

      {type === 'check_in_posted' && checkIn && (
        <CheckInPostedCard checkIn={checkIn} />
      )}

      {type === 'crew_formed' && crew && (
        <CrewFormedCard crew={crew} />
      )}

      {type === 'meetup_attended' && meetup && (
        <MeetupAttendedCard meetup={meetup} />
      )}

      {type === 'post_created' && post && (
        <PostCreatedCard post={post} />
      )}

      {/* ── Legacy cards ──────────────────────────────────────────────────── */}

      {trip && (
        <LegacyTripCard
          safeTripId={safeTripId}
          safeTripCoverImage={safeTripCoverImage}
          safeTripTitle={safeTripTitle}
          safeTripCity={safeTripCity}
          safeTripCountry={safeTripCountry}
          trip={trip}
        />
      )}

      {activity && (
        <LegacyActivityCard
          safeActivityName={safeActivityName}
          safeActivityDescription={safeActivityDescription}
          activity={activity}
        />
      )}

      {/* Media Gallery */}
      {media.length > 0 && (
        <div className="px-4 pb-3">
          <MediaGallery media={media} maxDisplay={4} />
        </div>
      )}

      {/* Actions: engagement summary + bar + comment thread + share modal */}
      <FeedItemActions
        itemId={id}
        entityId={entityId}
        isTripItem={!!trip}
        reactions={reactions}
        comments={localComments}
        userReaction={userReaction}
        showComments={showComments}
        showShareModal={showShareModal}
        totalReactions={totalReactions}
        shareData={shareData}
        onReact={onReact}
        onUnreact={onUnreact}
        onToggleComments={() => setShowComments(!showComments)}
        onOpenShareModal={() => setShowShareModal(true)}
        onCloseShareModal={() => setShowShareModal(false)}
      />
    </motion.article>
  );
}

export default RichFeedItem;
