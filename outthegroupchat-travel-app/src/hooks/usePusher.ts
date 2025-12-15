'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Channel } from 'pusher-js';
import { getPusherClient, channels, events } from '@/lib/pusher';

export function usePusherChannel(channelName: string | null) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!channelName) return;

    const pusher = getPusherClient();
    if (!pusher) return;

    const subscribed = pusher.subscribe(channelName);
    setChannel(subscribed);

    subscribed.bind('pusher:subscription_succeeded', () => {
      setIsConnected(true);
    });

    subscribed.bind('pusher:subscription_error', () => {
      setIsConnected(false);
    });

    return () => {
      pusher.unsubscribe(channelName);
      setChannel(null);
      setIsConnected(false);
    };
  }, [channelName]);

  const bind = useCallback(
    <T>(event: string, callback: (data: T) => void) => {
      if (!channel) return () => {};
      channel.bind(event, callback);
      return () => channel.unbind(event, callback);
    },
    [channel]
  );

  return { channel, isConnected, bind };
}

// Hook for trip-specific real-time updates
export function useTripChannel(tripId: string | null) {
  const channelName = tripId ? channels.trip(tripId) : null;
  return usePusherChannel(channelName);
}

// Hook for user-specific notifications
export function useUserChannel(userId: string | null) {
  const channelName = userId ? channels.user(userId) : null;
  return usePusherChannel(channelName);
}

// Hook for voting real-time updates
export function useVotingChannel(tripId: string | null) {
  const channelName = tripId ? channels.voting(tripId) : null;
  const { channel, isConnected, bind } = usePusherChannel(channelName);

  const onVoteCast = useCallback(
    (callback: (data: { optionId: string; voteCount: number; totalVotes: number }) => void) => {
      return bind(events.VOTE_CAST, callback);
    },
    [bind]
  );

  const onVotingClosed = useCallback(
    (callback: (data: { results: unknown }) => void) => {
      return bind(events.VOTING_CLOSED, callback);
    },
    [bind]
  );

  return { channel, isConnected, onVoteCast, onVotingClosed };
}

// Hook for real-time notifications
export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<unknown[]>([]);
  const { bind } = useUserChannel(userId);

  useEffect(() => {
    const unbind = bind(events.NOTIFICATION, (data: unknown) => {
      setNotifications((prev) => [data, ...prev]);
    });
    return unbind;
  }, [bind]);

  const clearNotification = useCallback((index: number) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return { notifications, clearNotification };
}

export { events, channels };

