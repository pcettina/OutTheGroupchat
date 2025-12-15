'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { getPusherClient, channels, events } from '@/lib/pusher';
import type { Channel } from 'pusher-js';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

interface RealtimeContextType {
  isConnected: boolean;
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  subscribeToTrip: (tripId: string) => () => void;
  onTripUpdate: (tripId: string, callback: (data: unknown) => void) => () => void;
  onActivityAdded: (tripId: string, callback: (data: unknown) => void) => () => void;
  onMemberJoined: (tripId: string, callback: (data: unknown) => void) => () => void;
  onVoteCast: (tripId: string, callback: (data: unknown) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

interface RealtimeProviderProps {
  children: ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const { data: session } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userChannel, setUserChannel] = useState<Channel | null>(null);
  const [tripChannels, setTripChannels] = useState<Map<string, Channel>>(new Map());

  // Calculate unread count
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Connect to user's personal channel
  useEffect(() => {
    if (!session?.user?.id) return;

    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = channels.user(session.user.id);
    const channel = pusher.subscribe(channelName);

    channel.bind('pusher:subscription_succeeded', () => {
      setIsConnected(true);
    });

    channel.bind('pusher:subscription_error', () => {
      setIsConnected(false);
    });

    // Listen for notifications
    channel.bind(events.NOTIFICATION, (data: Notification) => {
      setNotifications((prev) => [{ ...data, read: false }, ...prev]);
      
      // Show browser notification if permitted
      if (Notification.permission === 'granted') {
        new Notification(data.title, {
          body: data.message,
          icon: '/icon-192.png',
        });
      }
    });

    // Listen for invitations
    channel.bind(events.INVITATION, (data: Notification) => {
      setNotifications((prev) => [{ ...data, read: false, type: 'INVITATION' }, ...prev]);
    });

    setUserChannel(channel);

    // Fetch existing notifications
    fetchNotifications();

    return () => {
      pusher.unsubscribe(channelName);
      setUserChannel(null);
      setIsConnected(false);
    };
  }, [session?.user?.id]);

  // Fetch existing notifications from API
  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  // Subscribe to a trip channel
  const subscribeToTrip = useCallback((tripId: string) => {
    const pusher = getPusherClient();
    if (!pusher) return () => {};

    const channelName = channels.trip(tripId);
    
    if (!tripChannels.has(tripId)) {
      const channel = pusher.subscribe(channelName);
      setTripChannels((prev) => new Map(prev).set(tripId, channel));
    }

    return () => {
      pusher.unsubscribe(channelName);
      setTripChannels((prev) => {
        const next = new Map(prev);
        next.delete(tripId);
        return next;
      });
    };
  }, [tripChannels]);

  // Helper to bind to trip events
  const bindToTripEvent = useCallback((tripId: string, event: string, callback: (data: unknown) => void) => {
    const channel = tripChannels.get(tripId);
    if (!channel) {
      // Auto-subscribe if not already
      const pusher = getPusherClient();
      if (!pusher) return () => {};

      const channelName = channels.trip(tripId);
      const newChannel = pusher.subscribe(channelName);
      setTripChannels((prev) => new Map(prev).set(tripId, newChannel));
      
      newChannel.bind(event, callback);
      return () => newChannel.unbind(event, callback);
    }

    channel.bind(event, callback);
    return () => channel.unbind(event, callback);
  }, [tripChannels]);

  // Event handlers
  const onTripUpdate = useCallback((tripId: string, callback: (data: unknown) => void) => {
    return bindToTripEvent(tripId, events.TRIP_UPDATED, callback);
  }, [bindToTripEvent]);

  const onActivityAdded = useCallback((tripId: string, callback: (data: unknown) => void) => {
    return bindToTripEvent(tripId, events.ACTIVITY_ADDED, callback);
  }, [bindToTripEvent]);

  const onMemberJoined = useCallback((tripId: string, callback: (data: unknown) => void) => {
    return bindToTripEvent(tripId, events.MEMBER_JOINED, callback);
  }, [bindToTripEvent]);

  const onVoteCast = useCallback((tripId: string, callback: (data: unknown) => void) => {
    return bindToTripEvent(tripId, events.VOTE_CAST, callback);
  }, [bindToTripEvent]);

  // Mark notification as read
  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );

    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, []);

  // Clear notification
  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const value: RealtimeContextType = {
    isConnected,
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    subscribeToTrip,
    onTripUpdate,
    onActivityAdded,
    onMemberJoined,
    onVoteCast,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

// Hook for convenient notification access
export function useNotificationsRealtime() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } = useRealtime();
  return { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification };
}

// Hook for trip real-time updates
export function useTripRealtime(tripId: string | null) {
  const { subscribeToTrip, onTripUpdate, onActivityAdded, onMemberJoined, onVoteCast } = useRealtime();

  useEffect(() => {
    if (!tripId) return;
    return subscribeToTrip(tripId);
  }, [tripId, subscribeToTrip]);

  return {
    onTripUpdate: useCallback((cb: (data: unknown) => void) => 
      tripId ? onTripUpdate(tripId, cb) : () => {}, [tripId, onTripUpdate]),
    onActivityAdded: useCallback((cb: (data: unknown) => void) => 
      tripId ? onActivityAdded(tripId, cb) : () => {}, [tripId, onActivityAdded]),
    onMemberJoined: useCallback((cb: (data: unknown) => void) => 
      tripId ? onMemberJoined(tripId, cb) : () => {}, [tripId, onMemberJoined]),
    onVoteCast: useCallback((cb: (data: unknown) => void) => 
      tripId ? onVoteCast(tripId, cb) : () => {}, [tripId, onVoteCast]),
  };
}

export default RealtimeProvider;

