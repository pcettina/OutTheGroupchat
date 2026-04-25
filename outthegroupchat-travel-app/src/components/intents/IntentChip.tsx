'use client';

import { Clock } from 'lucide-react';
import type { IntentResponse } from '@/types/intent';
import { WINDOW_PRESET_META, DAY_OFFSET_LABELS } from '@/types/intent';

interface IntentChipProps {
  intent: IntentResponse;
  /** Show the user's name + avatar (used in Crew lists). Default: false. */
  showAuthor?: boolean;
  className?: string;
}

/**
 * Compact pill rendering one Intent's topic, window, and (optionally) author.
 *
 * Used by IntentList (Crew feed) and on the user's own profile. Does NOT
 * render commit-state, cityArea, or venue overrides — those surface in the
 * detail view (Phase 2).
 */
export function IntentChip({ intent, showAuthor = false, className = '' }: IntentChipProps) {
  const topicLabel = intent.topic?.displayName ?? 'Something';
  const window = WINDOW_PRESET_META[intent.windowPreset];
  const dayLabel =
    intent.dayOffset >= 0 && intent.dayOffset < DAY_OFFSET_LABELS.length
      ? DAY_OFFSET_LABELS[intent.dayOffset]
      : `In ${intent.dayOffset} days`;

  const isCommitted = intent.state === 'COMMITTED';

  return (
    <div
      data-testid="intent-chip"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
        isCommitted
          ? 'border-otg-sodium/40 bg-otg-sodium/10 text-otg-sodium'
          : 'border-otg-border bg-otg-surface text-otg-text-bright'
      } ${className}`}
    >
      {showAuthor && intent.user?.name && (
        <span className="font-medium">{intent.user.name}</span>
      )}
      <span className="font-semibold">{topicLabel}</span>
      <span className="opacity-70">·</span>
      <span className="inline-flex items-center gap-1 text-xs opacity-80">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {dayLabel} {window.label}
      </span>
      {isCommitted && (
        <span className="ml-1 rounded-full bg-otg-sodium/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          Committed
        </span>
      )}
    </div>
  );
}
