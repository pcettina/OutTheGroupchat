'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { MediaGallery } from './MediaGallery';
import { FeedItemHeader } from './FeedItemHeader';
import { FeedItemActions } from './FeedItemActions';
import { LegacyTripCard, LegacyActivityCard } from './FeedItemLegacyCards';
import {
  sanitizeText,
  sanitizeUrl,
  sanitizeRouteSegment,
  typeConfig,
  type RichFeedItemProps,
  type MeetupPayload,
  type CheckInPayload,
  type CrewPayload,
  type PostPayload,
} from './FeedItemTypes';

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

  const handleSave = () => {
    setSaved(!saved);
    onSave?.();
  };

  // Determine the canonical entity id used for CommentThread / ShareModal
  const entityId: string =
    safeTripId ||
    sanitizeRouteSegment(activity?.id) ||
    sanitizeRouteSegment(meetup?.id) ||
    sanitizeRouteSegment(checkIn?.id) ||
    sanitizeRouteSegment(post?.id) ||
    sanitizeRouteSegment(id);

  const reactionItemType: 'trip' | 'activity' = trip ? 'trip' : 'activity';

  // Build shareData for the ShareModal (type must be a literal for the ShareModal prop)
  const shareData: { id: string; type: 'trip' | 'activity'; title: string; destination?: string; description?: string; imageUrl?: string; userName?: string } | null = trip
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
        safeUserId={safeUserId}
        safeUserImage={safeUserImage}
        safeUserName={safeUserName}
        type={type}
        timeAgo={timeAgo}
        saved={saved}
        onSave={handleSave}
        safeContent={safeContent}
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

      {/* ── Legacy: Trip Card ─────────────────────────────────────────────── */}
      {trip && (
        <LegacyTripCard
          trip={trip}
          safeTripId={safeTripId}
          safeTripCoverImage={safeTripCoverImage}
          safeTripTitle={safeTripTitle}
          safeTripCity={safeTripCity}
          safeTripCountry={safeTripCountry}
        />
      )}

      {/* ── Legacy: Activity Card ─────────────────────────────────────────── */}
      {activity && (
        <LegacyActivityCard
          activity={activity}
          safeActivityName={safeActivityName}
          safeActivityDescription={safeActivityDescription}
        />
      )}

      {/* Media Gallery */}
      {media.length > 0 && (
        <div className="px-4 pb-3">
          <MediaGallery media={media} maxDisplay={4} />
        </div>
      )}

      {/* Engagement Bar + Comments + Share Modal */}
      <FeedItemActions
        itemId={id}
        reactionItemType={reactionItemType}
        entityId={entityId}
        reactions={reactions}
        comments={localComments}
        userReaction={userReaction}
        showComments={showComments}
        showShareModal={showShareModal}
        onToggleComments={() => setShowComments(!showComments)}
        onOpenShareModal={() => setShowShareModal(true)}
        onCloseShareModal={() => setShowShareModal(false)}
        onReact={onReact}
        onUnreact={onUnreact}
        shareData={shareData}
      />
    </motion.article>
  );
}

export default RichFeedItem;
