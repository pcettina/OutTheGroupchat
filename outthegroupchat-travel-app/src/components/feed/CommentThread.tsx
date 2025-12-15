'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  replies?: Comment[];
}

interface CommentThreadProps {
  itemId: string;
  itemType: 'trip' | 'activity';
  isOpen: boolean;
  onClose: () => void;
  initialComments?: Comment[];
}

export function CommentThread({
  itemId,
  itemType,
  isOpen,
  onClose,
  initialComments = [],
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Fetch comments when opened
  useEffect(() => {
    if (isOpen && comments.length === 0) {
      fetchComments();
    }
  }, [isOpen]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const fetchComments = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/feed/comments?itemId=${itemId}&itemType=${itemType}`
      );

      if (!response.ok) throw new Error('Failed to fetch comments');

      const data = await response.json();
      setComments(data.comments || []);
    } catch (err) {
      setError('Failed to load comments');
      console.error('Error fetching comments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    // Optimistic update
    const optimisticComment: Comment = {
      id: `temp-${Date.now()}`,
      text: newComment.trim(),
      createdAt: new Date().toISOString(),
      user: {
        id: 'current-user',
        name: 'You',
        image: null,
      },
    };

    setComments((prev) => [...prev, optimisticComment]);
    setNewComment('');

    try {
      const response = await fetch('/api/feed/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          itemType,
          text: optimisticComment.text,
        }),
      });

      if (!response.ok) throw new Error('Failed to post comment');

      const data = await response.json();

      // Replace optimistic comment with real one
      setComments((prev) =>
        prev.map((c) => (c.id === optimisticComment.id ? data.comment : c))
      );

      // Scroll to new comment
      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      // Remove optimistic comment on error
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
      setNewComment(optimisticComment.text);
      setError('Failed to post comment');
      console.error('Error posting comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/feed/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          itemType,
          text: replyText.trim(),
          parentId,
        }),
      });

      if (!response.ok) throw new Error('Failed to post reply');

      const data = await response.json();

      // Add reply to the parent comment
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId
            ? { ...c, replies: [...(c.replies || []), data.comment] }
            : c
        )
      );

      setReplyTo(null);
      setReplyText('');
    } catch (err) {
      setError('Failed to post reply');
      console.error('Error posting reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <motion.div
      key={comment.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isReply ? 'ml-10 mt-3' : ''}`}
    >
      {/* Avatar */}
      <div className={`${isReply ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0`}>
        {comment.user.image ? (
          <img
            src={comment.user.image}
            alt={comment.user.name || ''}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={isReply ? 'text-xs' : 'text-sm'}>
            {comment.user.name?.charAt(0) || '?'}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-sm px-4 py-2">
          <p className="font-semibold text-sm text-slate-900 dark:text-white">
            {comment.user.name || 'Anonymous'}
          </p>
          <p className="text-slate-700 dark:text-slate-300 text-sm whitespace-pre-wrap">
            {comment.text}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 mt-1 ml-2 text-xs text-slate-500">
          <span>
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
          {!isReply && (
            <button
              onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
              className="hover:text-emerald-500 transition-colors"
            >
              Reply
            </button>
          )}
        </div>

        {/* Reply Input */}
        {replyTo === comment.id && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 flex gap-2"
          >
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full px-4 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleReply(comment.id);
                }
              }}
            />
            <button
              onClick={() => handleReply(comment.id)}
              disabled={!replyText.trim() || isSubmitting}
              className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-full hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reply
            </button>
          </motion.div>
        )}

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-3 mt-3">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Comment Panel */}
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 rounded-t-3xl max-h-[80vh] flex flex-col md:max-w-lg md:mx-auto md:bottom-4 md:left-4 md:right-4 md:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                Comments {comments.length > 0 && `(${comments.length})`}
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full" />
                      <div className="flex-1">
                        <div className="bg-slate-200 dark:bg-slate-700 rounded-2xl h-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-500 mb-2">{error}</p>
                  <button
                    onClick={fetchComments}
                    className="text-emerald-500 hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl mb-3 block">💬</span>
                  <p className="text-slate-500 dark:text-slate-400">
                    No comments yet. Be the first to share your thoughts!
                  </p>
                </div>
              ) : (
                <>
                  {comments.map((comment) => renderComment(comment))}
                  <div ref={commentsEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="p-4 border-t border-slate-200 dark:border-slate-700"
            >
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={1}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                  className="p-3 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default CommentThread;

