'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, RefreshCw, Send } from 'lucide-react';
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

type PingResult = { pinged: number };

export default function NearbyCrewList({ className, cityId }: NearbyCrewListProps) {
  const [checkIns, setCheckIns] = useState<CheckInFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [pingSuccess, setPingSuccess] = useState<string | null>(null);
  const [pingedUserIds, setPingedUserIds] = useState<Set<string>>(new Set());

  const fetchFeed = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/checkins/feed');
      if (!res.ok) throw new Error('Failed to load check-in feed');
      const body: unknown = await res.json();
      // The feed route returns `data` as a bare array; be defensive within this
      // file for the historical `data.items` shape without editing the route.
      const raw = (body as { data?: unknown })?.data;
      const items = Array.isArray(raw)
        ? raw
        : ((raw as { items?: unknown })?.items ?? []);
      setCheckIns(items as CheckInFeedItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  const pingNearby = useCallback(async (targetUserId?: string) => {
    setPinging(true);
    setPingError(null);
    setPingSuccess(null);
    try {
      const res = await fetch('/api/checkins/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetUserId ? { targetUserId } : {}),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const message = (body as { error?: string })?.error ?? 'Failed to send ping';
        throw new Error(message);
      }
      const pinged = (body as { data?: PingResult })?.data?.pinged ?? 0;
      if (targetUserId) {
        setPingedUserIds((prev) => new Set(prev).add(targetUserId));
      }
      setPingSuccess(
        pinged === 1 ? 'Pinged 1 person' : `Pinged ${pinged} people`
      );
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Failed to send ping');
    } finally {
      setPinging(false);
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
    <div className={`space-y-3 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {pingSuccess && (
            <p className="text-otg-sodium text-sm font-medium truncate">{pingSuccess}</p>
          )}
          {pingError && (
            <p className="text-otg-danger text-sm truncate">{pingError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => pingNearby()}
          disabled={pinging}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-otg-sodium px-4 py-2 text-sm font-semibold text-otg-bg-dark transition-colors hover:bg-otg-sodium/90 disabled:opacity-50"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          {pinging ? 'Pinging…' : 'Ping nearby Crew'}
        </button>
      </div>

      <ul className="space-y-3">
        {checkIns.map((checkIn) => (
          <li key={checkIn.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <LiveActivityCard checkIn={checkIn} />
            </div>
            <button
              type="button"
              onClick={() => pingNearby(checkIn.user.id)}
              disabled={pinging || pingedUserIds.has(checkIn.user.id)}
              className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-otg-border px-3 py-1.5 text-xs font-medium text-otg-text-dim transition-colors hover:text-otg-sodium disabled:opacity-50"
              aria-label={`Ping ${checkIn.user.name ?? 'this Crew member'}`}
            >
              <Send className="w-3 h-3" aria-hidden="true" />
              {pingedUserIds.has(checkIn.user.id) ? 'Pinged' : 'Ping'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
