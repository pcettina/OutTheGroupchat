'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { ReactionPicker } from './ReactionPicker';
import { MediaGallery } from './MediaGallery';
import { CommentThread } from './CommentThread';
import { ShareModal } from './ShareModal';

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

interface RichFeedItemProps {
  id: string;
  type: 'trip_created' | 'trip_completed' | 'activity_added' | 'member_joined' | 'review_posted' | 'trip_in_progress' | 'photo_shared';
  timestamp: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  content?: string;
  trip?: {
    id: string;
    title: string;
    destination: { city: string; country: string };
    status: string;
    coverImage?: string;
    startDate?: string;
    endDate?: string;
  };
  activity?: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    cost?: number;
  };
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

const typeConfig: Record<string, { icon: string; action: string; color: string }> = {
  trip_created: { icon: '✈️', action: 'started planning', color: 'emerald' },
  trip_completed: { icon: '🎉', action: 'completed', color: 'amber' },
  trip_in_progress: { icon: '🌍', action: 'is traveling', color: 'blue' },
  activity_added: { icon: '📍', action: 'added an activity', color: 'purple' },
  member_joined: { icon: '👋', action: 'joined', color: 'pink' },
  review_posted: { icon: '⭐', action: 'reviewed', color: 'amber' },
  photo_shared: { icon: '📸', action: 'shared photos from', color: 'violet' },
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

export function RichFeedItem({
  id,
  type,
  timestamp,
  user,
  content,
  trip,
  activity,
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
  const [localComments, setLocalComments] = useState(comments);
  const [saved, setSaved] = useState(isSaved);

  const config = typeConfig[type] || typeConfig.trip_created;
  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  const handleAddComment = useCallback((text: string) => {
    const newComment: Comment = {
      id: `temp-${Date.now()}`,
      text,
      user: { id: 'current', name: 'You', image: null },
      createdAt: new Date().toISOString(),
      likes: 0,
    };
    setLocalComments((prev) => [...prev, newComment]);
    onComment?.(text);
  }, [onComment]);

  const handleSave = () => {
    setSaved(!saved);
    onSave?.();
  };

  const totalReactions = reactions.reduce((sum, r) => sum + r.count, 0);

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
          <Link href={`/profile/${user.id}`}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0"
            >
              {user.image ? (
                <img src={user.image} alt={user.name || ''} className="w-full h-full object-cover" />
              ) : (
                user.name?.charAt(0) || '?'
              )}
            </motion.div>
          </Link>

          {/* User Info & Action */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${user.id}`}
                className="font-semibold text-slate-900 dark:text-white hover:underline"
              >
                {user.name || 'Anonymous'}
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

        {/* Content Text */}
        {content && (
          <p className="mt-3 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {content}
          </p>
        )}
      </div>

      {/* Trip Card */}
      {trip && (
        <Link href={`/trips/${trip.id}`} className="block mx-4 mb-3">
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="bg-slate-50 dark:bg-slate-700/50 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-600"
          >
            {/* Cover Image */}
            {trip.coverImage && (
              <div className="h-36 relative">
                <img
                  src={trip.coverImage}
                  alt={trip.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="font-semibold text-white text-lg">{trip.title}</h3>
                  <p className="text-white/80 text-sm flex items-center gap-1">
                    <span>📍</span>
                    {trip.destination.city}, {trip.destination.country}
                  </p>
                </div>
              </div>
            )}

            {/* No Cover Image */}
            {!trip.coverImage && (
              <div className="p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {trip.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <span>📍</span>
                  {trip.destination.city}, {trip.destination.country}
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

      {/* Activity Card */}
      {activity && (
        <div className="mx-4 mb-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xl">
              {categoryEmojis[activity.category] || '✨'}
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-slate-900 dark:text-white">
                {activity.name}
              </h4>
              {activity.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                  {activity.description}
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

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700">
              <CommentThread
                comments={localComments}
                onAddComment={handleAddComment}
                onLikeComment={(commentId) => console.log('Like comment:', commentId)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={trip?.title || activity?.name || 'Share'}
        url={trip ? `/trips/${trip.id}` : '#'}
      />
    </motion.article>
  );
}

export default RichFeedItem;
