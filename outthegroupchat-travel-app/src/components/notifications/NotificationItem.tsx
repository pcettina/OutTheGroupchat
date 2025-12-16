'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export type NotificationType =
  | 'trip_invite'
  | 'trip_update'
  | 'member_joined'
  | 'survey_created'
  | 'survey_completed'
  | 'vote_started'
  | 'vote_ended'
  | 'activity_added'
  | 'comment'
  | 'mention'
  | 'reminder';

interface NotificationItemProps {
  notification: {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    actionUrl?: string;
    sender?: {
      id: string;
      name: string;
      image?: string;
    };
    metadata?: {
      tripId?: string;
      tripTitle?: string;
      activityId?: string;
      activityName?: string;
    };
  };
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const typeConfig: Record<NotificationType, { icon: string; color: string; bgColor: string }> = {
  trip_invite: { icon: '✈️', color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  trip_update: { icon: '📝', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  member_joined: { icon: '👋', color: 'text-pink-600', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
  survey_created: { icon: '📋', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  survey_completed: { icon: '✅', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  vote_started: { icon: '🗳️', color: 'text-indigo-600', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  vote_ended: { icon: '🏆', color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  activity_added: { icon: '📍', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  comment: { icon: '💬', color: 'text-cyan-600', bgColor: 'bg-cyan-100 dark:bg-cyan-900/30' },
  mention: { icon: '@', color: 'text-rose-600', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
  reminder: { icon: '⏰', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
};

export function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: NotificationItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const queryClient = useQueryClient();
  const config = typeConfig[notification.type] || typeConfig.trip_update;

  const markReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      if (!response.ok) throw new Error('Failed to mark as read');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onMarkRead?.(notification.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete notification');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onDelete?.(notification.id);
    },
  });

  const handleClick = () => {
    if (!notification.read) {
      markReadMutation.mutate();
    }
  };

  const content = (
    <motion.div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.01 }}
      onClick={handleClick}
      className={`relative bg-white dark:bg-slate-800 rounded-xl border transition-all cursor-pointer ${
        notification.read
          ? 'border-slate-200 dark:border-slate-700'
          : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
      }`}
    >
      {/* Unread Indicator */}
      {!notification.read && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-500 rounded-r-full" />
      )}

      <div className="p-4 flex items-start gap-3">
        {/* Icon or Avatar */}
        {notification.sender ? (
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
              {notification.sender.image ? (
                <img
                  src={notification.sender.image}
                  alt={notification.sender.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                notification.sender.name.charAt(0)
              )}
            </div>
            <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${config.bgColor} flex items-center justify-center text-xs`}>
              {config.icon}
            </span>
          </div>
        ) : (
          <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center text-xl`}>
            {config.icon}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${notification.read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
            {notification.title}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>

        {/* Actions */}
        <div className={`flex items-center gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          {!notification.read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                markReadMutation.mutate();
              }}
              className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Mark as read"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteMutation.mutate();
            }}
            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );

  if (notification.actionUrl) {
    return <Link href={notification.actionUrl}>{content}</Link>;
  }

  return content;
}

export default NotificationItem;
