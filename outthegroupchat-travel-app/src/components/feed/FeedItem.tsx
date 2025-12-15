'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { EngagementBar } from './EngagementBar';
import { MediaGallery } from './MediaGallery';

type FeedItemType = 
  | 'trip_created'
  | 'trip_completed'
  | 'activity_added'
  | 'member_joined'
  | 'review_posted'
  | 'trip_in_progress';

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  alt?: string;
  thumbnail?: string;
}

interface FeedItemProps {
  id: string;
  type: FeedItemType;
  timestamp: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  trip?: {
    id: string;
    title: string;
    destination: { city: string; country: string };
    status: string;
    coverImage?: string;
  };
  activity?: {
    id: string;
    name: string;
    category: string;
    description: string | null;
  };
  media?: MediaItem[];
  metadata?: {
    memberCount?: number;
    activityCount?: number;
    saveCount?: number;
    commentCount?: number;
    rating?: number;
    likeCount?: number;
  };
  isSaved?: boolean;
  onSave?: (activityId: string, action: 'save' | 'unsave') => void;
  onComment?: (itemId: string, itemType: 'trip' | 'activity') => void;
  onShare?: (itemId: string, itemType: 'trip' | 'activity') => void;
}

const typeIcons: Record<FeedItemType, { icon: string; color: string; label: string }> = {
  trip_created: { icon: '✈️', color: 'emerald', label: 'started planning' },
  trip_completed: { icon: '🎉', color: 'amber', label: 'completed' },
  trip_in_progress: { icon: '🌍', color: 'blue', label: 'is traveling' },
  activity_added: { icon: '📍', color: 'violet', label: 'added an activity' },
  member_joined: { icon: '👋', color: 'pink', label: 'joined' },
  review_posted: { icon: '⭐', color: 'amber', label: 'reviewed' },
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

export function FeedItem({
  id,
  type,
  timestamp,
  user,
  trip,
  activity,
  media,
  metadata,
  isSaved = false,
  onSave,
  onComment,
  onShare,
}: FeedItemProps) {
  const [saved, setSaved] = useState(isSaved);

  const typeConfig = typeIcons[type];
  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  // Determine item type and ID for engagement
  const itemType = activity ? 'activity' : 'trip';
  const itemId = activity?.id || trip?.id || id;

  const handleLike = (liked: boolean) => {
    if (activity) {
      setSaved(liked);
      onSave?.(activity.id, liked ? 'save' : 'unsave');
    }
  };

  const handleComment = () => {
    onComment?.(itemId, itemType);
  };

  const handleShare = () => {
    onShare?.(itemId, itemType);
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`w-4 h-4 ${star <= rating ? 'text-amber-400' : 'text-slate-300'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0">
            {user.image ? (
              <img src={user.image} alt={user.name || ''} className="w-full h-full object-cover" />
            ) : (
              user.name?.charAt(0) || '?'
            )}
          </div>

          {/* User info & action */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900 dark:text-white">
                {user.name || 'Anonymous'}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {typeConfig.label}
              </span>
              <span className="text-lg">{typeConfig.icon}</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{timeAgo}</p>
          </div>
        </div>

        {/* Trip Card */}
        {trip && (
          <a
            href={`/trips/${trip.id}`}
            className="block bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                  {trip.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <span>📍</span>
                  {trip.destination.city}, {trip.destination.country}
                </p>
                {metadata && (
                  <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {metadata.memberCount !== undefined && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {metadata.memberCount} member{metadata.memberCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {metadata.activityCount !== undefined && metadata.activityCount > 0 && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        {metadata.activityCount} activit{metadata.activityCount !== 1 ? 'ies' : 'y'}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                trip.status === 'COMPLETED' 
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : trip.status === 'IN_PROGRESS'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-300'
              }`}>
                {trip.status.replace('_', ' ')}
              </span>
            </div>
          </a>
        )}

        {/* Media Gallery */}
        {media && media.length > 0 && (
          <div className="mt-3">
            <MediaGallery media={media} maxDisplay={4} />
          </div>
        )}

        {/* Trip Cover Image (fallback if no media) */}
        {trip?.coverImage && (!media || media.length === 0) && (
          <div className="mt-3 rounded-xl overflow-hidden">
            <img 
              src={trip.coverImage} 
              alt={trip.title}
              className="w-full h-48 object-cover"
            />
          </div>
        )}

        {/* Activity Details */}
        {activity && type === 'activity_added' && (
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 mt-2">
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
              </div>
            </div>
          </div>
        )}

        {/* Review Details */}
        {activity && type === 'review_posted' && (
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{categoryEmojis[activity.category] || '✨'}</span>
              <span className="font-medium text-slate-900 dark:text-white">{activity.name}</span>
              {metadata?.rating && renderStars(metadata.rating)}
            </div>
            {activity.description && (
              <p className="text-slate-600 dark:text-slate-400 text-sm italic">
                &ldquo;{activity.description}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Engagement Bar */}
        <EngagementBar
          itemId={itemId}
          itemType={itemType}
          initialLiked={saved}
          initialLikeCount={metadata?.likeCount || metadata?.saveCount || 0}
          commentCount={metadata?.commentCount || 0}
          onLike={handleLike}
          onComment={handleComment}
          onShare={handleShare}
        />
      </div>
    </motion.div>
  );
}

export default FeedItem;

