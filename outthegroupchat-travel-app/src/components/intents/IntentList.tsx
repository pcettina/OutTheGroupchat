'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { IntentChip } from './IntentChip';
import type { IntentResponse } from '@/types/intent';

interface IntentListProps {
  intents: IntentResponse[];
  /** Show user names on each chip — true for Crew feed, false for own list. */
  showAuthor?: boolean;
  /** Empty-state copy override. Defaults are tuned for Crew vs. Mine via showAuthor. */
  emptyMessage?: string;
  /** Empty-state CTA href (default: /intents/new). */
  emptyCtaHref?: string;
}

export function IntentList({
  intents,
  showAuthor = false,
  emptyMessage,
  emptyCtaHref = '/intents/new',
}: IntentListProps) {
  if (intents.length === 0) {
    const fallback = showAuthor
      ? 'Nothing on the radar from your Crew right now.'
      : 'You haven’t signaled an Intent yet.';
    return (
      <div
        data-testid="intent-list-empty"
        className="rounded-xl border border-dashed border-otg-border bg-otg-surface/40 p-6 text-center"
      >
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-otg-sodium" aria-hidden="true" />
        <p className="text-sm text-otg-text-muted">{emptyMessage ?? fallback}</p>
        {!showAuthor && (
          <Link
            href={emptyCtaHref}
            className="mt-3 inline-block rounded-full bg-otg-sodium px-4 py-1.5 text-xs font-medium text-otg-bg hover:bg-otg-sodium/90"
          >
            Signal an Intent
          </Link>
        )}
      </div>
    );
  }

  return (
    <ul data-testid="intent-list" className="flex flex-wrap gap-2">
      {intents.map((intent) => (
        <li key={intent.id}>
          <IntentChip intent={intent} showAuthor={showAuthor} />
        </li>
      ))}
    </ul>
  );
}
