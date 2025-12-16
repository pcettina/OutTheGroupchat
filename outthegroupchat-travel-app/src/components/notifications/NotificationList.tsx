'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { NotificationItem, NotificationType } from './NotificationItem';

interface Notification {
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
}

interface NotificationListProps {
  notifications: Notification[];
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function NotificationList({
  notifications,
  onMarkRead,
  onDelete,
}: NotificationListProps) {
  // Group notifications by date
  const groupedNotifications = notifications.reduce((groups, notification) => {
    const date = new Date(notification.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let groupKey: string;
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      groupKey = 'This Week';
    } else {
      groupKey = 'Earlier';
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(notification);
    return groups;
  }, {} as Record<string, Notification[]>);

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];

  return (
    <div className="space-y-6">
      {groupOrder.map((groupKey) => {
        const groupNotifications = groupedNotifications[groupKey];
        if (!groupNotifications || groupNotifications.length === 0) return null;

        return (
          <div key={groupKey}>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 px-1">
              {groupKey}
            </h3>
            <div className="space-y-2">
              <AnimatePresence>
                {groupNotifications.map((notification, index) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <NotificationItem
                      notification={notification}
                      onMarkRead={onMarkRead}
                      onDelete={onDelete}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default NotificationList;
