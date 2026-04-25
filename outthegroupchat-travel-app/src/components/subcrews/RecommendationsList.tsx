'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Star, MapPin, Sparkles } from 'lucide-react';

interface RecommendedVenue {
  id: string;
  name: string;
  address: string | null;
  city: string;
  category: string;
  imageUrl: string | null;
  source: 'google_places' | 'db';
  rating: number | null;
  score: number;
  hotnessBoost: number;
}

interface RecommendationsListProps {
  topicId: string;
  cityArea?: string | null;
  /** Called when the user picks a venue (e.g. for the seed to bind venueId). */
  onPick?: (venueId: string) => void;
  /** Cap the number rendered (default 6). */
  limit?: number;
}

/**
 * V1 Phase 3 — venue recommendations rendered on /subcrews/[id].
 *
 * Loads `/api/recommendations` with the SubCrew's topic + cityArea, then
 * renders a vertical list of cards. The seed can tap a card to surface a
 * "Use this venue" affordance via the `onPick` callback.
 */
export function RecommendationsList({
  topicId,
  cityArea,
  onPick,
  limit = 6,
}: RecommendationsListProps) {
  const [items, setItems] = useState<RecommendedVenue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams({ topicId, limit: String(limit) });
        if (cityArea) params.set('cityArea', cityArea);
        const res = await fetch(`/api/recommendations?${params.toString()}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setError(body.error ?? 'Could not load recommendations.');
          return;
        }
        setItems(body.data.recommendations as RecommendedVenue[]);
      } catch {
        if (!cancelled) setError('Network error.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, cityArea, limit]);

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (items === null) {
    return <p className="text-sm text-otg-text-muted">Loading recommendations…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-otg-border p-6 text-center text-sm text-otg-text-muted">
        <Sparkles className="mx-auto mb-2 h-5 w-5 text-otg-sodium" aria-hidden="true" />
        No spots found for this topic + neighborhood. Try widening the area.
      </div>
    );
  }

  return (
    <ul data-testid="recommendations-list" className="space-y-2">
      {items.map((v) => (
        <li key={v.id}>
          <motion.div
            whileHover={{ y: -1 }}
            className="flex items-center gap-3 rounded-xl border border-otg-border bg-otg-surface/60 p-3"
          >
            <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-otg-bg">
              {v.imageUrl ? (
                <Image
                  src={v.imageUrl}
                  alt=""
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-otg-text-muted">
                  {v.category[0] ?? '?'}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-otg-text-bright">{v.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-otg-text-muted">
                {v.rating !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3" aria-hidden="true" />
                    {v.rating.toFixed(1)}
                  </span>
                )}
                {v.address && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{v.address}</span>
                  </span>
                )}
              </div>
            </div>

            {onPick && v.source === 'db' && (
              <button
                type="button"
                onClick={() => onPick(v.id)}
                className="rounded-full bg-otg-sodium px-3 py-1.5 text-xs font-semibold text-otg-bg hover:bg-otg-sodium/90"
              >
                Use
              </button>
            )}
          </motion.div>
        </li>
      ))}
    </ul>
  );
}
