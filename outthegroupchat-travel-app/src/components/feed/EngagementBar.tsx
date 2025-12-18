'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface EngagementBarProps {
  itemId: string;
  itemType: 'trip' | 'activity';
  initialLiked?: boolean;
  initialLikeCount?: number;
  commentCount?: number;
  shareCount?: number;
  onLike?: (liked: boolean) => void;
  onComment?: () => void;
  onShare?: () => void;
}

export function EngagementBar({
  itemId,
  itemType,
  initialLiked = false,
  initialLikeCount = 0,
  commentCount = 0,
  shareCount = 0,
  onLike,
  onComment,
  onShare,
}: EngagementBarProps) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (isLiking) return;

    // Optimistic update
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikeCount(prev => newLikedState ? prev + 1 : Math.max(0, prev - 1));
    setIsLiking(true);

    try {
      const response = await fetch('/api/feed/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          itemType,
          action: newLikedState ? 'like' : 'unlike',
        }),
      });

      if (!response.ok) {
        // Revert on error
        setIsLiked(!newLikedState);
        setLikeCount(prev => newLikedState ? prev - 1 : prev + 1);
      } else {
        onLike?.(newLikedState);
      }
    } catch (error) {
      // Revert on error
      setIsLiked(!newLikedState);
      setLikeCount(prev => newLikedState ? prev - 1 : prev + 1);
      console.error('Failed to update like:', error);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <div className="flex items-center gap-1 pt-4 border-t border-slate-100 dark:border-slate-700">
      {/* Simple Like Button */}
      <motion.button
        onClick={handleLike}
        disabled={isLiking}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          isLiked
            ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
        whileTap={{ scale: 0.95 }}
      >
        <motion.svg
          className="w-5 h-5"
          fill={isLiked ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
          animate={isLiked ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </motion.svg>
        <span>{likeCount > 0 ? likeCount : 'Like'}</span>
      </motion.button>

      {/* Comment Button */}
      <motion.button
        onClick={onComment}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        whileTap={{ scale: 0.95 }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <span>{commentCount > 0 ? commentCount : 'Comment'}</span>
      </motion.button>

      {/* Share Button */}
      <motion.button
        onClick={onShare}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ml-auto"
        whileTap={{ scale: 0.95 }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        <span>{shareCount > 0 ? shareCount : 'Share'}</span>
      </motion.button>
    </div>
  );
}

export default EngagementBar;

