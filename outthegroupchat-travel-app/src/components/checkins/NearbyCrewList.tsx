'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import LiveActivityCard from './LiveActivityCard';
import { getPusherClient, getCityCheckinChannel } from '@/lib/pusher';

type CheckInFeedItem = {
  id: string;
  user: { id: string; name: string | null; image: string | null };
  venue?: { id: string; name: string } | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activeUntil: string;
  createdAt: string;
};

interface NearbyCrewListProps {
  className?: string;
  cityId?: string;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-otg-border bg-otg-maraschino p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-otg-border shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-otg-border rounded w-1/3" />
          <div className="h-3 bg-otg-border rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export default function NearbyCrewList({ className, cityId }: NearbyCrewListProps) {
  const [checkIns, setCheckIns] = useState<CheckInFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/checkins/feed');
      if (!res.ok) throw new Error('Failed to load check-in feed');
      const body = await res.json();
      setCheckIns((body.data?.items ?? []) as CheckInFeedItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 60_000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  // Pusher real-time subscription — only when cityId is provided and we're in the browser
  useEffect(() => {
    if (!cityId) return;

    const pusher = getPusherClient();
    if (!pusher) return;

    const channelName = getCityCheckinChannel(cityId);
    const channel = pusher.subscribe(channelName);

    const handleNewCheckIn = (data: CheckInFeedItem) => {
      setCheckIns((prev) => {
        // Avoid duplicates if the polling fetch also picked up this check-in
        if (prev.some((item) => item.id === data.id)) return prev;
        return [data, ...prev];
      });
    };

    channel.bind('checkin:new', handleNewCheckIn);

    return () => {
      channel.unbind('checkin:new', handleNewCheckIn);
      pusher.unsubscribe(channelName);
    };
  }, [cityId]);

  if (loading) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-2xl bg-otg-danger/15 ring-1 ring-inset ring-otg-danger/30 p-6 text-center ${
          className ?? ''
        }`}
      >
        <p className="text-otg-danger text-sm mb-3">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchFeed();
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-otg-danger hover:text-otg-sodium transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  if (checkIns.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-otg-border p-10 text-center ${
          className ?? ''
        }`}
      >
        <MapPin className="w-10 h-10 mx-auto text-otg-text-dim mb-3" aria-hidden="true" />
        <p className="text-otg-text-dim text-sm">
          Nobody in your Crew is out right now. Be the first to check in.
        </p>
      </div>
    );
  }

  return (
    <ul className={`space-y-3 ${className ?? ''}`}>
      {checkIns.map((checkIn) => (
        <li key={checkIn.id}>
          <LiveActivityCard checkIn={checkIn} />
        </li>
      ))}
    </ul>
  );
}
