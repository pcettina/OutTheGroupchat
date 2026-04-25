'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { IntentList } from '@/components/intents';
import type { IntentResponse } from '@/types/intent';

type Tab = 'mine' | 'crew';

export default function IntentsPage() {
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<IntentResponse[] | null>(null);
  const [crew, setCrew] = useState<IntentResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mineRes, crewRes] = await Promise.all([
          fetch('/api/intents/mine'),
          fetch('/api/intents/crew'),
        ]);
        const mineBody = await mineRes.json();
        const crewBody = await crewRes.json();
        if (cancelled) return;
        if (mineBody.success) setMine(mineBody.data.intents as IntentResponse[]);
        if (crewBody.success) setCrew(crewBody.data.intents as IntentResponse[]);
      } catch {
        if (!cancelled) setError('Could not load Intents.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = tab === 'mine' ? mine : crew;
  const loading = list === null;

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-otg-text-bright">Intents</h1>
          <Link
            href="/intents/new"
            className="inline-flex items-center gap-2 rounded-full bg-otg-sodium px-4 py-2 text-sm font-medium text-otg-bg hover:bg-otg-sodium/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Intent
          </Link>
        </header>

        <div className="mb-4 flex gap-2 border-b border-otg-border">
          {(['mine', 'crew'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                tab === t
                  ? 'border-otg-sodium text-otg-text-bright'
                  : 'border-transparent text-otg-text-muted hover:text-otg-text-bright'
              }`}
            >
              {t === 'mine' ? 'Mine' : 'Crew'}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-otg-text-muted">Loading…</p>
        ) : (
          <IntentList intents={list ?? []} showAuthor={tab === 'crew'} />
        )}
      </main>
    </>
  );
}
