'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { SubCrewCard } from '@/components/subcrews';
import type { SubCrewResponse } from '@/types/subcrew';

export default function SubCrewDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [subCrew, setSubCrew] = useState<SubCrewResponse | null>(null);
  const [viewerIsMember, setViewerIsMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/subcrews/${id}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setError(body.error ?? 'Could not load SubCrew.');
          return;
        }
        setSubCrew(body.data.subCrew);
        setViewerIsMember(body.data.viewerIsMember);
      } catch {
        if (!cancelled) setError('Network error.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-2xl px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <Link
          href="/intents"
          className="mb-4 inline-flex items-center gap-1 text-sm text-otg-text-muted hover:text-otg-text-bright"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Intents
        </Link>

        {loading && <p className="text-sm text-otg-text-muted">Loading…</p>}
        {error && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        {subCrew && (
          <>
            <SubCrewCard subCrew={subCrew} linkToDetail={false} />
            <p className="mt-4 text-sm text-otg-text-muted">
              {viewerIsMember
                ? 'You are part of this SubCrew. Coordination + commit lands in the next phase.'
                : 'You can see this SubCrew because you are Crew of a member.'}
            </p>
          </>
        )}
      </main>
    </>
  );
}
