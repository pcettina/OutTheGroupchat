'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import {
  SubCrewCard,
  SubCrewCoordinationPanel,
  RecommendationsList,
} from '@/components/subcrews';
import { EmptyState, ErrorBanner } from '@/components/ui';
import type { SubCrewResponse } from '@/types/subcrew';

export default function SubCrewDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const { data: session } = useSession();
  const callerUserId = session?.user?.id ?? null;

  const [subCrew, setSubCrew] = useState<SubCrewResponse | null>(null);
  const [viewerIsMember, setViewerIsMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubCrew = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/subcrews/${id}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error ?? 'Could not load SubCrew.');
        return;
      }
      setSubCrew(body.data.subCrew);
      setViewerIsMember(body.data.viewerIsMember);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSubCrew();
  }, [fetchSubCrew]);

  const callerMember = subCrew && callerUserId
    ? subCrew.members.find((m) => m.userId === callerUserId)
    : null;
  const callerIntentId = callerMember?.intentId ?? null;

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <Link
          href="/intents"
          className="inline-flex items-center gap-1 text-sm text-otg-text-muted hover:text-otg-text-bright"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Intents
        </Link>

        {loading && <p className="text-sm text-otg-text-muted">Loading…</p>}
        {error && <ErrorBanner message={error} onRetry={fetchSubCrew} />}
        {subCrew && (
          <>
            <SubCrewCard subCrew={subCrew} linkToDetail={false} />

            {viewerIsMember && callerUserId ? (
              <>
                <SubCrewCoordinationPanel
                  subCrew={subCrew}
                  callerUserId={callerUserId}
                  callerIntentId={callerIntentId}
                  onChanged={fetchSubCrew}
                />
                <section className="rounded-2xl border border-otg-border bg-otg-surface/60 p-5">
                  <header className="mb-3">
                    <h2 className="text-base font-semibold text-otg-text-bright">
                      Where to go
                    </h2>
                    <p className="text-xs text-otg-text-muted">
                      Top picks for {subCrew.topic?.displayName ?? 'this Topic'}
                      {subCrew.cityArea ? ` in ${subCrew.cityArea.replace(/-/g, ' ')}` : ''}.
                    </p>
                  </header>
                  <RecommendationsList
                    topicId={subCrew.topicId}
                    cityArea={subCrew.cityArea}
                  />
                </section>
              </>
            ) : (
              <EmptyState
                variant="compact"
                icon={<Users className="h-5 w-5" aria-hidden="true" />}
                title="You're seeing this because you're Crew of a member"
                description="Tap “I'm in” from the feed to join and unlock coordination and venue recs."
                action={{ label: 'Back to Intents', onClick: () => router.push('/intents') }}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
