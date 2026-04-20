'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import LiveActivityCard from './LiveActivityCard';

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
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export default function NearbyCrewList({ className }: NearbyCrewListProps) {
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
      <div className={`rounded-2xl bg-red-50 dark:bg-red-900/30 p-6 text-center ${className ?? ''}`}>
        <p className="text-red-700 dark:text-red-200 text-sm mb-3">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchFeed();
          }}
          className="inline-flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-200 hover:underline"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    );
  }

  if (checkIns.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center ${className ?? ''}`}>
        <MapPin className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          No one in your Crew is out right now. Be the first to check in!
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
