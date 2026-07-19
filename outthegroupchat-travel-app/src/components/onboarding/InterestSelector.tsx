'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { canAdvanceFromTopics, fetchTopics, type OnboardingTopic } from './onboardingFlow';

interface InterestSelectorProps {
  /** Currently-selected Topic ids (controlled by the parent flow). */
  selected: string[];
  /** Toggle a Topic id in/out of the selection. */
  onToggle: (topicId: string) => void;
}

/**
 * Day-7 Topic selector (rewritten from the dead trip-era interest grid).
 *
 * Fetches the real Topic catalogue from `GET /api/topics` and renders each
 * `displayName` as a selectable chip using the app's `otg-*` token system.
 * Handles loading, empty, and error/retry states so the step never blanks out.
 */
export function InterestSelector({ selected, onToggle }: InterestSelectorProps) {
  const [topics, setTopics] = useState<OnboardingTopic[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTopics()
      .then((list) => {
        if (!cancelled) setTopics(list);
      })
      .catch(() => {
        if (!cancelled) setError('We couldn’t load interests. Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div
        data-testid="topics-loading"
        className="flex items-center justify-center gap-2 py-12 text-otg-text-dim"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading interests…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        data-testid="topics-error"
        className="flex flex-col items-center gap-3 rounded-xl border border-otg-danger/40 bg-otg-danger/10 p-6 text-center"
      >
        <p className="text-sm text-otg-danger">{error}</p>
        <button type="button" onClick={load} className="btn btn-secondary">
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  if (!topics || topics.length === 0) {
    return (
      <p data-testid="topics-empty" className="py-10 text-center text-sm text-otg-text-dim">
        No interests are available right now — you can skip ahead and add them later.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-otg-text-bright">Pick what you’re into</span>
        <span className="text-xs text-otg-text-dim">{selected.length} selected</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Topics of interest">
        {topics.map((topic) => {
          const isSelected = selected.includes(topic.id);
          return (
            <motion.button
              key={topic.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              aria-pressed={isSelected}
              onClick={() => onToggle(topic.id)}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                isSelected
                  ? 'border-otg-sodium bg-otg-sodium/15 text-otg-sodium'
                  : 'border-otg-border bg-otg-bg text-otg-text-dim hover:border-otg-sodium/50'
              }`}
            >
              {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
              <span>{topic.displayName}</span>
            </motion.button>
          );
        })}
      </div>
      {!canAdvanceFromTopics(selected) && (
        <p className="mt-3 text-xs text-otg-text-dim">Select at least one to continue.</p>
      )}
    </div>
  );
}

export default InterestSelector;
