'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigation } from '@/components/Navigation';
import { NotificationList } from '@/components/notifications/NotificationList';
import type { NotificationType } from '@/components/notifications/NotificationItem';
import { logger } from '@/lib/logger';

interface ApiNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  sender?: { id: string; name: string; image?: string };
  metadata?: {
    tripId?: string;
    tripTitle?: string;
    activityId?: string;
    activityName?: string;
  };
}

const KNOWN_TYPES = new Set<NotificationType>([
  'trip_invite',
  'trip_update',
  'member_joined',
  'survey_created',
  'survey_completed',
  'vote_started',
  'vote_ended',
  'activity_added',
  'comment',
  'mention',
  'reminder',
]);

function toNotificationType(raw: string): NotificationType {
  return KNOWN_TYPES.has(raw as NotificationType)
    ? (raw as NotificationType)
    : 'trip_update';
}

interface NotificationData {
  notifications: ApiNotification[];
  unreadCount: number;
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    // Auto-dismiss after 5 seconds
    setTimeout(() => setErrorMessage(null), 5000);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === 'unread') params.set('unread', 'true');
      const response = await fetch(`/api/notifications?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const result = await response.json() as { data?: NotificationData };
      // API returns { success: true, data: { notifications, unreadCount } }
      return result.data ?? { notifications: [], unreadCount: 0 };
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to mark all as read');
      return response.json();
    },
    onMutate: async () => {
      // Optimistic update: mark all notifications as read immediately
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousData = queryClient.getQueriesData<NotificationData>({
        queryKey: ['notifications'],
      });

      queryClient.setQueriesData<NotificationData>({ queryKey: ['notifications'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          notifications: old.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        };
      });

      logger.debug('[NotificationsPage] Optimistic mark-all-read applied');
      return { previousData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      logger.debug('[NotificationsPage] Mark-all-read confirmed by server');
    },
    onError: (err, _variables, context) => {
      // Revert optimistic update on failure
      if (context?.previousData) {
        for (const [queryKey, queryData] of context.previousData) {
          queryClient.setQueryData(queryKey, queryData);
        }
      }
      logger.error({ error: err }, '[NotificationsPage] Mark-all-read failed');
      handleError('Failed to mark all notifications as read. Please try again.');
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />

      <div className="pt-20 pb-12">
        <div className="max-w-2xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
              Notifications
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Stay updated on your trips and group activity
            </p>
          </div>

          {/* Error Toast */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-4 flex items-center justify-between gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="flex-shrink-0 text-red-500 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                  aria-label="Dismiss error"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filters & Actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  filter === 'all'
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  filter === 'unread'
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                    filter === 'unread'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  }`}>
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {unreadCount > 0 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline disabled:opacity-50"
              >
                {markAllReadMutation.isPending ? 'Marking...' : 'Mark all as read'}
              </motion.button>
            )}
          </div>

          {/* Notification List */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-800 rounded-xl p-4 animate-pulse"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-slate-600 dark:text-slate-400">Failed to load notifications</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <p className="text-slate-600 dark:text-slate-400 mb-1">No notifications</p>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                {filter === 'unread' ? 'All caught up!' : 'You\'ll see trip updates and activity here'}
              </p>
            </div>
          ) : (
            <NotificationList
              notifications={notifications.map((n) => ({
                ...n,
                type: toNotificationType(n.type),
              }))}
              onError={handleError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
