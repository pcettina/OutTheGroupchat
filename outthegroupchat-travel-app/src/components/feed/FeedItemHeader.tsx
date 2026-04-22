'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import type { FeedItemType } from './FeedItemTypes';
import { typeConfig } from './FeedItemTypes';

interface FeedItemHeaderProps {
  safeUserId: string;
  safeUserImage: string;
  safeUserName: string;
  type: FeedItemType;
  timeAgo: string;
  saved: boolean;
  onSave: () => void;
  safeContent?: string;
}

/**
 * Header section of a feed item: avatar, user name, action label,
 * timestamp, save bookmark button, overflow menu, and optional content text.
 */
export function FeedItemHeader({
  safeUserId,
  safeUserImage,
  safeUserName,
  type,
  timeAgo,
  saved,
  onSave,
  safeContent,
}: FeedItemHeaderProps) {
  const config = typeConfig[type];

  return (
    <div className="p-4 pb-3">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Link href={`/profile/${safeUserId}`}>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold overflow-hidden flex-shrink-0"
          >
            {safeUserImage ? (
              <Image
                src={safeUserImage}
                alt={safeUserName}
                width={44}
                height={44}
                className="w-full h-full object-cover"
              />
            ) : (
              safeUserName.charAt(0) || '?'
            )}
          </motion.div>
        </Link>

        {/* User Info & Action */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${safeUserId}`}
              className="font-semibold text-slate-900 dark:text-white hover:underline"
            >
              {safeUserName || 'Anonymous'}
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
            onClick={onSave}
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

      {/* Content Text (only shown for legacy types or when a content string is provided and no card renders) */}
      {safeContent && (
        <p className="mt-3 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
          {safeContent}
        </p>
      )}
    </div>
  );
}
