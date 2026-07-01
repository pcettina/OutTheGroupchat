/**
 * @module components/subcrews/HotNowBadge
 * @description V1 Phase 4 — surfaces the real hotness signal in the UI.
 *
 * Day 1 shipped `computeHotnessBoost`, so `/api/recommendations` now returns a
 * real, non-constant `hotnessBoost` per venue (1.0 when a venue's cell has no
 * recent contributions, up to `MAX_BOOST`). This module renders that signal:
 *   - `HotNowBadge` — a "🔥 Hot now" rising-density badge, shown ONLY when the
 *     boost clears `HOT_NOW_BOOST_THRESHOLD` (hidden at the neutral ~1.0 boost).
 *   - `ContributorCountChip` — a small chip for a raw contributor/density count
 *     (used by the heatmap, where markers carry a real `count`).
 *
 * Both are pure presentational components with no data fetching. Keeping the
 * threshold + chip in one shared module avoids duplicating the "is this hot?"
 * decision across the recommendations list and the heatmap.
 */

// Explicit React import so the classic JSX runtime (React.createElement)
// resolves under vitest/esbuild, which does not inject the automatic runtime
// the way the Next.js build does. Harmless under Next 14's own compiler.
import React from 'react';
import { Flame, Users } from 'lucide-react';

/**
 * Minimum `hotnessBoost` at which a venue is considered "hot now".
 *
 * `computeHotnessBoost` returns `1.0` for a cell with no recent contributions
 * (the neutral baseline) and scales up as recent INTEREST/PRESENCE density
 * rises. `1.15` (a ~15% lift over neutral) is the smallest boost that reflects
 * genuine recent density rather than a single stray contribution, so the badge
 * stays meaningful and does not appear on every venue.
 */
export const HOT_NOW_BOOST_THRESHOLD = 1.15;

/** True when a hotness boost is high enough to warrant the "Hot now" badge. */
export function isHotNow(hotnessBoost: number | null | undefined): boolean {
  return typeof hotnessBoost === 'number' && hotnessBoost >= HOT_NOW_BOOST_THRESHOLD;
}

interface HotNowBadgeProps {
  hotnessBoost: number | null | undefined;
  className?: string;
}

/**
 * Renders a "🔥 Hot now" badge when `hotnessBoost` clears the threshold;
 * renders nothing (returns `null`) at a neutral boost. Callers can render this
 * unconditionally and let the component decide.
 */
export function HotNowBadge({ hotnessBoost, className }: HotNowBadgeProps) {
  if (!isHotNow(hotnessBoost)) return null;

  return (
    <span
      data-testid="hot-now-badge"
      aria-label="Rising density — hot right now"
      title="More people have shown interest here recently"
      className={`inline-flex items-center gap-1 rounded-full bg-otg-sodium/15 px-2 py-0.5 text-xs font-semibold text-otg-sodium ${className ?? ''}`}
    >
      <Flame className="h-3 w-3" aria-hidden="true" />
      Hot now
    </span>
  );
}

interface ContributorCountChipProps {
  /** Raw contributor / density count for the cell or venue. */
  count: number;
  className?: string;
}

/**
 * Renders a small contributor-count chip (e.g. "12 here"). Returns `null` for a
 * non-positive count so empty cells don't get a "0" chip.
 */
export function ContributorCountChip({ count, className }: ContributorCountChipProps) {
  if (!Number.isFinite(count) || count <= 0) return null;

  const label = `${count} ${count === 1 ? 'person' : 'people'} contributing recently`;

  return (
    <span
      data-testid="contributor-count-chip"
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded-full bg-otg-surface/80 px-2 py-0.5 text-xs font-medium text-otg-text-muted ${className ?? ''}`}
    >
      <Users className="h-3 w-3" aria-hidden="true" />
      {count}
    </span>
  );
}
