'use client';

/**
 * @module components/heatmap/HeatmapView
 * @description V1 Phase 4 — orchestrates the heatmap surface.
 *
 * Two tabs (Interest / Presence) and two overlay tiers (Crew / FoF). Polls
 * `/api/heatmap` every 30s per R19, gating on Page Visibility: when the tab
 * is hidden the interval pauses; on visibility-restore it refetches and
 * resumes. Always re-renders on every poll per R25.
 *
 * Phase 4b adds:
 *   - FoF toggle (formerly disabled in 4a) — sets `tier=fof` on the request.
 *   - `MutualThresholdSlider` — feeds `mutualThreshold` per R5.
 *   - Per-cell anchor attribution chip ("via Alex, Jamie + 2 more") for FoF
 *     responses, rendered as a top-of-map summary list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, MapPin, Users } from 'lucide-react';
import type { HeatmapCell, HeatmapResponse, HeatmapType, HeatmapVenueMarker } from '@/types/heatmap';
import { NYC_NEIGHBORHOODS } from '@/lib/intent/neighborhoods';
import { MutualThresholdSlider, useMutualThreshold } from './MutualThresholdSlider';

const HeatmapMap = dynamic(
  () => import('./HeatmapMap').then((m) => m.HeatmapMap),
  { ssr: false, loading: () => <MapPlaceholder /> },
);

const POLL_INTERVAL_MS = 30_000;

export function HeatmapView() {
  const [type, setType] = useState<HeatmapType>('interest');
  const [tier, setTier] = useState<'crew' | 'fof'>('crew');
  const [cityArea, setCityArea] = useState<string>('');
  const [mutualThreshold, setMutualThreshold] = useMutualThreshold(1);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [venueMarkers, setVenueMarkers] = useState<HeatmapVenueMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnceRef = useRef<() => Promise<void>>(async () => {});

  const fetchHeatmap = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ type, tier });
      if (cityArea) params.set('cityArea', cityArea);
      if (tier === 'fof') params.set('mutualThreshold', String(mutualThreshold));
      const res = await fetch(`/api/heatmap?${params.toString()}`, {
        cache: 'no-store',
      });
      const json: HeatmapResponse = await res.json();
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'Failed to load heatmap');
        return;
      }
      setCells(json.data.cells);
      setVenueMarkers(json.data.venueMarkers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [type, tier, cityArea, mutualThreshold]);

  useEffect(() => {
    fetchOnceRef.current = fetchHeatmap;
  }, [fetchHeatmap]);

  // 30s polling, paused when tab hidden (R19 — Page Visibility API).
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        fetchOnceRef.current();
      }, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchOnceRef.current();
        start();
      } else {
        stop();
      }
    };

    fetchOnceRef.current();
    if (document.visibilityState === 'visible') {
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // When the user changes filters, refetch immediately (don't wait for poll).
  useEffect(() => {
    fetchHeatmap();
    // fetchHeatmap captures all deps via useCallback; re-runs on dep change.
  }, [fetchHeatmap]);

  const anchorSummaries = useMemo(
    () =>
      cells
        .filter((c) => c.anchorSummary)
        .slice(0, 5)
        .map((c) => c.anchorSummary as string),
    [cells],
  );

  return (
    <div className="flex flex-col h-full w-full gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-2" role="tablist" aria-label="Heatmap window">
          <TabButton active={type === 'interest'} onClick={() => setType('interest')}>
            Interest
          </TabButton>
          <TabButton active={type === 'presence'} onClick={() => setType('presence')}>
            Presence
          </TabButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TierToggle
            label="Crew"
            active={tier === 'crew'}
            onClick={() => setTier('crew')}
          />
          <TierToggle
            label="FoF"
            active={tier === 'fof'}
            onClick={() => setTier('fof')}
          />

          {tier === 'fof' && (
            <MutualThresholdSlider
              value={mutualThreshold}
              onChange={setMutualThreshold}
            />
          )}

          <select
            value={cityArea}
            onChange={(e) => setCityArea(e.target.value)}
            className="bg-otg-bg-dark border border-otg-border rounded px-2 py-1 text-sm text-otg-text-bright"
            aria-label="Filter by neighborhood"
          >
            <option value="">All neighborhoods</option>
            {NYC_NEIGHBORHOODS.map((n) => (
              <option key={n.slug} value={n.slug}>
                {n.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tier === 'fof' && anchorSummaries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2" aria-label="Anchor attribution summary">
          {anchorSummaries.map((summary, idx) => (
            <span
              key={`${summary}-${idx}`}
              className="text-xs px-2 py-0.5 rounded-full bg-otg-bg-dark border border-otg-border text-otg-text-dim"
            >
              {summary}
            </span>
          ))}
        </div>
      )}

      <div className="relative flex-1 min-h-[480px]">
        {loading && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 text-xs text-otg-text-bright">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="absolute top-2 left-2 z-10 px-3 py-1 rounded bg-otg-danger/20 text-otg-danger text-xs"
          >
            {error}
          </div>
        )}

        <HeatmapMap cells={cells} venueMarkers={venueMarkers} />

        {!loading && !error && cells.length === 0 && venueMarkers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-3 rounded bg-black/60 text-otg-text-dim text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {tier === 'fof'
                ? `No ${type} signals at ≥${mutualThreshold} mutual Crew right now.`
                : `No ${type === 'interest' ? 'interest' : 'presence'} signals from your Crew right now.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'px-3 py-1.5 rounded-full text-sm font-medium transition-colors ' +
        (active
          ? 'bg-otg-sodium text-otg-bg-dark'
          : 'bg-otg-bg-dark text-otg-text-bright hover:bg-otg-maraschino')
      }
    >
      {children}
    </button>
  );
}

function TierToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ' +
        (active
          ? 'bg-otg-sodium text-otg-bg-dark border-otg-sodium'
          : 'bg-otg-bg-dark text-otg-text-bright border-otg-border hover:border-otg-sodium')
      }
    >
      <Users className="w-3 h-3" />
      {label}
    </button>
  );
}

function MapPlaceholder() {
  return (
    <div
      className="w-full h-full min-h-[480px] rounded-lg flex items-center justify-center text-otg-text-dim text-sm"
      style={{ background: '#0E1418' }}
    >
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );
}
