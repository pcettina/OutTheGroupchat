'use client';

import { motion } from 'framer-motion';
import { ReactionPicker } from './ReactionPicker';
import { CommentThread } from './CommentThread';
import { ShareModal } from './ShareModal';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface ShareData {
  id: string;
  type: 'trip' | 'activity';
  title: string;
  destination?: string;
  imageUrl?: string;
  description?: string;
  userName?: string;
}

export interface FeedItemActionsProps {
  itemId: string;
  entityId: string;
  isTripItem: boolean;
  reactions: Reaction[];
  comments: Comment[];
  userReaction?: string | null;
  showComments: boolean;
  showShareModal: boolean;
  totalReactions: number;
  shareData: ShareData | null;
  onReact?: (emoji: string) => void;
  onUnreact?: () => void;
  onToggleComments: () => void;
  onOpenShareModal: () => void;
  onCloseShareModal: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FeedItemActions({
  itemId,
  entityId,
  isTripItem,
  reactions,
  comments,
  userReaction,
  showComments,
  showShareModal,
  totalReactions,
  shareData,
  onReact,
  onUnreact,
  onToggleComments,
  onOpenShareModal,
  onCloseShareModal,
}: FeedItemActionsProps) {
  return (
    <>
      {/* Engagement Summary */}
      {(totalReactions > 0 || comments.length > 0) && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            {reactions.slice(0, 3).map((r) => (
              <span key={r.emoji} className="text-sm">{r.emoji}</span>
            ))}
            {totalReactions > 0 && <span className="ml-1">{totalReactions}</span>}
          </div>
          {comments.length > 0 && (
            <button onClick={onToggleComments} className="hover:underline">
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </button>
          )}
        </div>
      )}

      {/* Engagement Bar */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1">
        {/* Reaction Picker */}
        <ReactionPicker
          itemId={itemId}
          itemType={isTripItem ? 'trip' : 'activity'}
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
          onClick={onOpenShareModal}
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
        itemType={isTripItem ? 'trip' : 'activity'}
        isOpen={showComments}
        onClose={onToggleComments}
        initialComments={comments}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={onCloseShareModal}
        shareData={shareData}
      />
    </>
  );
}

export default FeedItemActions;
