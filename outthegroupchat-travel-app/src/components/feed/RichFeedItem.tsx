'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { MediaGallery } from './MediaGallery';
import { CommentThread } from './CommentThread';
import { ShareModal } from './ShareModal';
import { sanitizeText, sanitizeUrl, sanitizeRouteSegment } from './rich-item/sanitize';
import { typeConfig } from './rich-item/types';
import type { RichFeedItemProps } from './rich-item/types';
import { MeetupCreatedCard } from './rich-item/MeetupCreatedCard';
import { CheckInPostedCard } from './rich-item/CheckInPostedCard';
import { CrewFormedCard } from './rich-item/CrewFormedCard';
import { MeetupAttendedCard } from './rich-item/MeetupAttendedCard';
import { PostCreatedCard } from './rich-item/PostCreatedCard';
import { TripCard } from './rich-item/TripCard';
import { ActivityCard } from './rich-item/ActivityCard';
import { FeedItemHeader } from './rich-item/FeedItemHeader';
import { EngagementBar } from './rich-item/EngagementBar';

// Re-export public types for backward compatibility
export type { RichFeedItemProps } from './rich-item/types';

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
      <FeedItemHeader
        safeUserId={safeUserId}
        safeUserImage={safeUserImage}
        safeUserName={safeUserName}
        configIcon={config.icon}
        configAction={config.action}
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
        <TripCard
          safeTripId={safeTripId}
          safeTripCoverImage={safeTripCoverImage}
          safeTripTitle={safeTripTitle}
          safeTripCity={safeTripCity}
          safeTripCountry={safeTripCountry}
          startDate={trip.startDate}
          endDate={trip.endDate}
          status={trip.status}
        />
      )}

      {/* ── Legacy: Activity Card ─────────────────────────────────────────── */}
      {activity && (
        <ActivityCard
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
      <EngagementBar
        itemId={id}
        isTrip={!!trip}
        reactions={reactions}
        userReaction={userReaction}
        onReact={(emoji) => onReact?.(emoji)}
        onUnreact={() => onUnreact?.()}
        onToggleComments={() => setShowComments(!showComments)}
        onShare={() => setShowShareModal(true)}
      />

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
