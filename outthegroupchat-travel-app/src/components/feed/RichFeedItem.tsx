'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { MediaGallery } from './MediaGallery';
import { CommentThread } from './CommentThread';
import { ShareModal } from './ShareModal';
import { FeedItemHeader } from './FeedItemHeader';
import {
  MeetupCreatedCard,
  CheckInPostedCard,
  CrewFormedCard,
  MeetupAttendedCard,
  PostCreatedCard,
} from './FeedItemNewCards';
import { TripCard, ActivityCard } from './FeedItemLegacyCards';
import { EngagementSummary, EngagementBar } from './FeedItemEngagement';
import {
  sanitizeRouteSegment,
  sanitizeText,
  sanitizeUrl,
  typeConfig,
  type RichFeedItemProps,
} from './FeedItemTypes';

// Re-export types for backward compatibility with any external consumers
export type {
  RichFeedItemProps,
  FeedItemType,
  MediaItem,
  Reaction,
  Comment,
  FeedUser,
  TripPayload,
  ActivityPayload,
  MeetupPayload,
  CheckInPayload,
  CrewPayload,
  PostPayload,
} from './FeedItemTypes';

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
  onShare,
  onSave,
}: RichFeedItemProps) {
  // onComment and onShare are part of the public API (preserved for downstream
  // wiring) but the component currently surfaces share via a modal and routes
  // comments through CommentThread. Reference them so lint doesn't complain.
  void onComment;
  void onShare;
  const [showComments, setShowComments] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [localComments] = useState(comments);
  const [saved, setSaved] = useState(isSaved);

  // Guard: unknown type → graceful null
  const config = typeConfig[type];
  if (!config) return null;

  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  // Sanitize values needed by the parent component for ShareModal data
  const safeUserName = sanitizeText(user.name);
  const safeTripId = trip ? sanitizeRouteSegment(trip.id) : '';
  const safeTripCoverImage = trip ? sanitizeUrl(trip.coverImage) : '';
  const safeTripTitle = trip ? sanitizeText(trip.title) : '';
  const safeTripCity = trip ? sanitizeText(trip.destination.city) : '';
  const safeTripCountry = trip ? sanitizeText(trip.destination.country) : '';
  const safeActivityName = activity ? sanitizeText(activity.name) : '';
  const safeActivityDescription = activity ? sanitizeText(activity.description) : '';

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
      <FeedItemHeader
        user={user}
        type={type}
        timeAgo={timeAgo}
        saved={saved}
        onSave={handleSave}
        content={content}
      />

      {/* New feed type cards */}
      {type === 'meetup_created' && meetup && <MeetupCreatedCard meetup={meetup} />}
      {type === 'check_in_posted' && checkIn && <CheckInPostedCard checkIn={checkIn} />}
      {type === 'crew_formed' && crew && <CrewFormedCard crew={crew} />}
      {type === 'meetup_attended' && meetup && <MeetupAttendedCard meetup={meetup} />}
      {type === 'post_created' && post && <PostCreatedCard post={post} />}

      {/* Legacy cards */}
      {trip && <TripCard trip={trip} />}
      {activity && <ActivityCard activity={activity} />}

      {/* Media Gallery */}
      {media.length > 0 && (
        <div className="px-4 pb-3">
          <MediaGallery media={media} maxDisplay={4} />
        </div>
      )}

      <EngagementSummary
        reactions={reactions}
        totalReactions={totalReactions}
        commentCount={localComments.length}
        onToggleComments={() => setShowComments(!showComments)}
      />

      <EngagementBar
        itemId={id}
        itemType={trip ? 'trip' : 'activity'}
        reactions={reactions}
        userReaction={userReaction}
        onReact={onReact}
        onUnreact={onUnreact}
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
