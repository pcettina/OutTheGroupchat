'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { IntentList } from '@/components/intents';
import { SubCrewCard, EmergingSubCrewCard } from '@/components/subcrews';
import type { IntentResponse } from '@/types/intent';
import type { SubCrewResponse } from '@/types/subcrew';

type Tab = 'mine' | 'crew' | 'subcrews';

export default function IntentsPage() {
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<IntentResponse[] | null>(null);
  const [crew, setCrew] = useState<IntentResponse[] | null>(null);
  const [mySubCrews, setMySubCrews] = useState<SubCrewResponse[] | null>(null);
  const [emergingSubCrews, setEmergingSubCrews] = useState<SubCrewResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mineRes, crewRes, mySubRes, emergingRes] = await Promise.all([
          fetch('/api/intents/mine'),
          fetch('/api/intents/crew'),
          fetch('/api/subcrews/mine'),
          fetch('/api/subcrews/emerging'),
        ]);
        const mineBody = await mineRes.json();
        const crewBody = await crewRes.json();
        const mySubBody = await mySubRes.json();
        const emergingBody = await emergingRes.json();
        if (cancelled) return;
        if (mineBody.success) setMine(mineBody.data.intents as IntentResponse[]);
        if (crewBody.success) setCrew(crewBody.data.intents as IntentResponse[]);
        if (mySubBody.success) setMySubCrews(mySubBody.data.subCrews as SubCrewResponse[]);
        if (emergingBody.success) setEmergingSubCrews(emergingBody.data.subCrews as SubCrewResponse[]);
      } catch {
        if (!cancelled) setError('Could not load.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          {(['mine', 'crew', 'subcrews'] as const).map((t) => (
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
              {t === 'mine' ? 'Mine' : t === 'crew' ? 'Crew' : 'SubCrews'}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {tab === 'mine' &&
          (mine === null ? (
            <p className="text-sm text-otg-text-muted">Loading…</p>
          ) : (
            <IntentList intents={mine} />
          ))}

        {tab === 'crew' &&
          (crew === null ? (
            <p className="text-sm text-otg-text-muted">Loading…</p>
          ) : (
            <IntentList intents={crew} showAuthor />
          ))}

        {tab === 'subcrews' && (
          <div className="space-y-6">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-otg-text-muted">
                Joinable
              </h2>
              {emergingSubCrews === null ? (
                <p className="text-sm text-otg-text-muted">Loading…</p>
              ) : emergingSubCrews.length === 0 ? (
                <p className="text-sm text-otg-text-muted">Nothing forming around your Crew right now.</p>
              ) : (
                <ul className="space-y-3">
                  {emergingSubCrews.map((sc) => (
                    <li key={sc.id}>
                      <EmergingSubCrewCard subCrew={sc} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-otg-text-muted">
                Yours
              </h2>
              {mySubCrews === null ? (
                <p className="text-sm text-otg-text-muted">Loading…</p>
              ) : mySubCrews.length === 0 ? (
                <p className="text-sm text-otg-text-muted">No SubCrews yet — keep posting Intents.</p>
              ) : (
                <ul className="space-y-3">
                  {mySubCrews.map((sc) => (
                    <li key={sc.id}>
                      <SubCrewCard subCrew={sc} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
