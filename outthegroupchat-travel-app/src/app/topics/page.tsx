'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Compass, Plus } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { EmptyState, ErrorBanner } from '@/components/ui';
import {
  buildTopicIntentHref,
  formatSignalCount,
  parseTopicsResponse,
  sortTopicsBySignal,
  type TopicWithCount,
} from './topicsPageLogic';

/**
 * Browse-by-Topic discovery (V1 Day 9 M2).
 *
 * Lists every curated Topic with a live "N Crew signaled" count so a member can
 * see where momentum already exists, then tap through to signal their own
 * Intent. Counts come from `GET /api/topics?withCounts=true`.
 */
export default function TopicsPage() {
  const router = useRouter();
  // Tri-state: null = loading, [] = loaded-but-empty, else the list.
  const [topics, setTopics] = useState<TopicWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/topics?withCounts=true');
      const body: unknown = await res.json();
      // Unwrap the { success, data: { topics } } envelope explicitly.
      const parsed = parseTopicsResponse(body);
      if (parsed === null) {
        setError('Could not load Topics. Try again.');
        return;
      }
      setTopics(sortTopicsBySignal(parsed));
    } catch {
      setError('Could not load Topics. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-otg-text-bright">Topics</h1>
          <p className="mt-1 text-sm text-otg-text-muted">
            See what people are up for right now. Tap a Topic to signal your own Intent.
          </p>
        </header>

        {error && (
          <ErrorBanner
            message={error}
            onRetry={load}
            onDismiss={() => setError(null)}
            className="mb-4"
          />
        )}

        {topics === null ? (
          <p className="text-sm text-otg-text-muted">Loading…</p>
        ) : topics.length === 0 ? (
          <EmptyState
            icon={<Compass className="h-8 w-8" aria-hidden="true" />}
            title="No Topics yet"
            description="Topics are the curated categories we group people around. Check back shortly."
            action={{ label: 'Signal an Intent', onClick: () => router.push('/intents/new') }}
          />
        ) : (
          <ul className="space-y-3">
            {topics.map((topic) => (
              <li key={topic.id}>
                <Link
                  href={buildTopicIntentHref(topic)}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-otg-border bg-otg-bg px-5 py-4 transition hover:border-otg-sodium/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium text-otg-text-bright">
                      {topic.displayName}
                    </span>
                    <span className="mt-0.5 block text-sm text-otg-text-muted">
                      {formatSignalCount(topic.count)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-otg-border text-otg-text-muted"
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
