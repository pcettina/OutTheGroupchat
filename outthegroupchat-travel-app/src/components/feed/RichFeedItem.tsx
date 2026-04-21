'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';
import { ReactionPicker } from './ReactionPicker';
import { MediaGallery } from './MediaGallery';
import { CommentThread } from './CommentThread';
import { ShareModal } from './ShareModal';

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

// ─── Payload shapes for each item type ──────────────────────────────────────

interface TripPayload {
  id: string;
  title: string;
  destination: { city: string; country: string };
  status: string;
  coverImage?: string;
  startDate?: string;
  endDate?: string;
}

interface ActivityPayload {
  id: string;
  name: string;
  category: string;
  description: string | null;
  cost?: number;
}

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

// ─── Discriminated union for item type + payload ─────────────────────────────

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

const categoryEmojis: Record<string, string> = {
  FOOD: '🍽️',
  CULTURE: '🎭',
  NATURE: '🌲',
  ENTERTAINMENT: '🎪',
  NIGHTLIFE: '🌙',
  SPORTS: '⚽',
  SHOPPING: '🛍️',
  OTHER: '✨',
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
  onComment,
  onShare,
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

  const handleSave = () => {
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <Link href={`/profile/${safeUserId}`}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0"
            >
              {safeUserImage ? (
                <Image src={safeUserImage} alt={safeUserName} width={44} height={44} className="w-full h-full object-cover" />
              ) : (
                safeUserName.charAt(0) || '?'
              )}
            </motion.div>
          </Link>

          {/* User Info & Action */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${safeUserId}`}
                className="font-semibold text-slate-900 dark:text-white hover:underline"
              >
                {safeUserName || 'Anonymous'}
              </Link>
              <span className="text-slate-500 dark:text-slate-400 text-sm">
                {config.action}
              </span>
              <span className="text-lg">{config.icon}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{timeAgo}</p>
          </div>

          {/* Menu */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className={`p-2 rounded-lg transition-colors ${
                saved
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <svg
                className="w-5 h-5"
                fill={saved ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            </button>
            <button className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Text (only shown for legacy types or when a content string is provided and no card renders) */}
        {safeContent && (
          <p className="mt-3 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {safeContent}
          </p>
        )}
      </div>

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

      {/* ── Legacy: Trip Card ─────────────────────────────────────────────── */}
      {trip && (
        <Link href={`/trips/${safeTripId}`} className="block mx-4 mb-3">
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="bg-slate-50 dark:bg-slate-700/50 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-600"
          >
            {/* Cover Image */}
            {safeTripCoverImage && (
              <div className="h-36 relative">
                <Image
                  src={safeTripCoverImage}
                  alt={safeTripTitle}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 600px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="font-semibold text-white text-lg">{safeTripTitle}</h3>
                  <p className="text-white/80 text-sm flex items-center gap-1">
                    <span>📍</span>
                    {safeTripCity}, {safeTripCountry}
                  </p>
                </div>
              </div>
            )}

            {/* No Cover Image */}
            {!safeTripCoverImage && (
              <div className="p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {safeTripTitle}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <span>📍</span>
                  {safeTripCity}, {safeTripCountry}
                </p>
              </div>
            )}

            {/* Trip Meta */}
            {(trip.startDate || trip.status) && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-600 flex items-center justify-between text-sm">
                {trip.startDate && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {new Date(trip.startDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {trip.endDate && ` - ${new Date(trip.endDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}`}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  trip.status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : trip.status === 'IN_PROGRESS'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                }`}>
                  {trip.status.replace('_', ' ')}
                </span>
              </div>
            )}
          </motion.div>
        </Link>
      )}

      {/* ── Legacy: Activity Card ─────────────────────────────────────────── */}
      {activity && (
        <div className="mx-4 mb-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xl">
              {categoryEmojis[activity.category] || '✨'}
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-slate-900 dark:text-white">
                {safeActivityName}
              </h4>
              {safeActivityDescription && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                  {safeActivityDescription}
                </p>
              )}
              {activity.cost && (
                <span className="inline-block mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  ${activity.cost}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Gallery */}
      {media.length > 0 && (
        <div className="px-4 pb-3">
          <MediaGallery media={media} maxDisplay={4} />
        </div>
      )}

      {/* Engagement Summary */}
      {(totalReactions > 0 || localComments.length > 0) && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            {reactions.slice(0, 3).map((r) => (
              <span key={r.emoji} className="text-sm">{r.emoji}</span>
            ))}
            {totalReactions > 0 && <span className="ml-1">{totalReactions}</span>}
          </div>
          {localComments.length > 0 && (
            <button
              onClick={() => setShowComments(!showComments)}
              className="hover:underline"
            >
              {localComments.length} {localComments.length === 1 ? 'comment' : 'comments'}
            </button>
          )}
        </div>
      )}

      {/* Engagement Bar */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1">
        {/* Reaction Picker */}
        <ReactionPicker
          itemId={id}
          itemType={trip ? 'trip' : 'activity'}
          reactions={reactions}
          userReaction={userReaction}
          onReact={(emoji) => onReact?.(emoji)}
          onUnreact={() => onUnreact?.()}
        />

        {/* Comment Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <span>Comment</span>
        </motion.button>

        {/* Share Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ml-auto"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          <span>Share</span>
        </motion.button>
      </div>

      {/* Comments Thread */}
      <CommentThread
        itemId={entityId}
        itemType={trip ? 'trip' : 'activity'}
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        initialComments={localComments}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareData={trip ? {
          id: safeTripId,
          type: 'trip',
          title: safeTripTitle,
          destination: `${safeTripCity}, ${safeTripCountry}`,
          imageUrl: safeTripCoverImage || undefined,
          userName: safeUserName || undefined,
        } : activity ? {
          id: sanitizeRouteSegment(activity.id),
          type: 'activity',
          title: safeActivityName,
          description: safeActivityDescription || undefined,
          userName: safeUserName || undefined,
        } : null}
      />
    </motion.article>
  );
}

export default RichFeedItem;
