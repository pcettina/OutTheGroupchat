'use client';

import { motion } from 'framer-motion';
import type { Message, SuggestedAction } from './chat-types';

interface ChatMessageProps {
  message: Message;
  onAction?: (action: SuggestedAction) => void;
  onRetry?: () => void;
  showRetry?: boolean;
}

/**
 * Renders a single chat message bubble with optional action buttons
 * and a retry control for error states.
 */
export function ChatMessage({ message, onAction, onRetry, showRetry }: ChatMessageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          message.role === 'user'
            ? 'bg-emerald-500 text-white rounded-br-sm'
            : message.error
            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-bl-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'
        }`}
      >
        {/* Message content with basic markdown bold rendering */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.content.split('\n').map((line, i) => (
            <p key={i} className="mb-1 last:mb-0 text-sm leading-relaxed">
              {line.split('**').map((part, j) =>
                j % 2 === 1 ? <strong key={j}>{part}</strong> : part
              )}
            </p>
          ))}
        </div>

        {/* Suggested action buttons */}
        {message.actions && message.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.actions.map((action, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onAction?.(action)}
                className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full hover:bg-emerald-500/30 transition-colors font-medium"
              >
                {action.label}
              </motion.button>
            ))}
          </div>
        )}

        {/* Retry control for error messages */}
        {message.error && showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Retry message →
          </button>
        )}
      </div>
    </motion.div>
  );
}
