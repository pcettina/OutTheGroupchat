'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

interface NotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClear: (id: string) => void;
}

const notificationIcons: Record<string, { icon: string; bg: string }> = {
  TRIP_INVITATION: { icon: '✉️', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  TRIP_UPDATE: { icon: '✈️', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  ACTIVITY_COMMENT: { icon: '💬', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  ACTIVITY_RATING: { icon: '⭐', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  SURVEY_REMINDER: { icon: '📋', bg: 'bg-pink-100 dark:bg-pink-900/30' },
  VOTE_REMINDER: { icon: '🗳️', bg: 'bg-cyan-100 dark:bg-cyan-900/30' },
  FOLLOW: { icon: '👤', bg: 'bg-rose-100 dark:bg-rose-900/30' },
  SYSTEM: { icon: '🔔', bg: 'bg-slate-100 dark:bg-slate-700' },
};

export function NotificationCenter({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onClear,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredNotifications = filter === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  const getNotificationLink = (notification: Notification): string => {
    const data = notification.data as Record<string, string> | undefined;
    switch (notification.type) {
      case 'TRIP_INVITATION':
      case 'TRIP_UPDATE':
        return data?.tripId ? `/trips/${data.tripId}` : '/trips';
      case 'ACTIVITY_COMMENT':
      case 'ACTIVITY_RATING':
        return data?.tripId ? `/trips/${data.tripId}` : '/trips';
      case 'SURVEY_REMINDER':
        return data?.tripId ? `/trips/${data.tripId}/survey` : '/trips';
      case 'VOTE_REMINDER':
        return data?.tripId ? `/trips/${data.tripId}/voting` : '/trips';
      case 'FOLLOW':
        return data?.userId ? `/profile/${data.userId}` : '/profile';
      default:
        return '/';
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-label="Notifications"
      >
        <svg
          className="w-6 h-6 text-slate-600 dark:text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllAsRead}
                    className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <button
                  onClick={() => setFilter('all')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    filter === 'all'
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('unread')}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    filter === 'unread'
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Unread {unreadCount > 0 && `(${unreadCount})`}
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {filteredNotifications.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-4xl mb-3 block">🔔</span>
                  <p className="text-slate-500 dark:text-slate-400">
                    {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredNotifications.map((notification) => {
                    const config = notificationIcons[notification.type] || notificationIcons.SYSTEM;
                    
                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`relative ${!notification.read ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
                      >
                        <Link
                          href={getNotificationLink(notification)}
                          onClick={() => handleNotificationClick(notification)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          {/* Icon */}
                          <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center text-xl flex-shrink-0`}>
                            {config.icon}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${!notification.read ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                              {notification.title}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                              {notification.message}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </p>
                          </div>

                          {/* Unread indicator */}
                          {!notification.read && (
                            <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-2" />
                          )}
                        </Link>

                        {/* Clear button */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClear(notification.id);
                          }}
                          className="absolute top-2 right-2 p-1 rounded-full opacity-0 hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all group-hover:opacity-100"
                        >
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="block w-full text-center text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
              >
                View all notifications
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationCenter;

