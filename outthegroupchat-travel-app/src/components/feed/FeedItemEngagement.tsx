'use client';

import { motion } from 'framer-motion';
import { ReactionPicker } from './ReactionPicker';
import type { Comment, Reaction } from './FeedItemTypes';

interface EngagementSummaryProps {
  reactions: Reaction[];
  totalReactions: number;
  commentCount: number;
  onToggleComments: () => void;
}

export function EngagementSummary({
  reactions,
  totalReactions,
  commentCount,
  onToggleComments,
}: EngagementSummaryProps) {
  if (totalReactions === 0 && commentCount === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-1">
        {reactions.slice(0, 3).map((r) => (
          <span key={r.emoji} className="text-sm">{r.emoji}</span>
        ))}
        {totalReactions > 0 && <span className="ml-1">{totalReactions}</span>}
      </div>
      {commentCount > 0 && (
        <button onClick={onToggleComments} className="hover:underline">
          {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </button>
      )}
    </div>
  );
}

interface EngagementBarProps {
  itemId: string;
  itemType: 'trip' | 'activity';
  reactions: Reaction[];
  userReaction?: string | null;
  onReact?: (emoji: string) => void;
  onUnreact?: () => void;
  onToggleComments: () => void;
  onShare: () => void;
}

export function EngagementBar({
  itemId,
  itemType,
  reactions,
  userReaction,
  onReact,
  onUnreact,
  onToggleComments,
  onShare,
}: EngagementBarProps) {
  return (
    <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1">
      {/* Reaction Picker */}
      <ReactionPicker
        itemId={itemId}
        itemType={itemType}
        reactions={reactions}
        userReaction={userReaction}
        onReact={(emoji) => onReact?.(emoji)}
        onUnreact={() => onUnreact?.()}
      />

      {/* Comment Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onToggleComments}
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
        onClick={onShare}
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
  );
}

// Re-export Comment type used by parent for state
export type { Comment };
