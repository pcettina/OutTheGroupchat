'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Inbox, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import CrewList from '@/components/social/CrewList';
import type { CrewWithUsers } from '@/types/social';

export default function CrewPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const crewQuery = useQuery({
    queryKey: ['crew'],
    queryFn: async () => {
      const res = await fetch('/api/crew');
      if (!res.ok) throw new Error('Failed to load Crew');
      const body = await res.json();
      return (body.data?.items ?? []) as CrewWithUsers[];
    },
    enabled: !!session?.user?.id,
  });

  const requestsQuery = useQuery({
    queryKey: ['crew-requests-count'],
    queryFn: async () => {
      const res = await fetch('/api/crew/requests');
      if (!res.ok) throw new Error('Failed to load requests');
      const body = await res.json();
      return {
        incomingCount: (body.data?.incomingCount as number) ?? 0,
        sentCount: (body.data?.sentCount as number) ?? 0,
      };
    },
    enabled: !!session?.user?.id,
  });

  const handleRemove = (crewId: string) => {
    queryClient.setQueryData<CrewWithUsers[]>(['crew'], (prev) =>
      prev ? prev.filter((c) => c.id !== crewId) : prev
    );
  };

  const crewLabel =
    (session?.user as { crewLabel?: string | null } | undefined)?.crewLabel?.trim() || 'Crew';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />
      <div className="pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <Users className="w-7 h-7 text-emerald-500" />
                My {crewLabel}
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                The people you meet up with.
              </p>
            </div>
            <Link
              href="/crew/requests"
              className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <Inbox className="w-4 h-4" />
              Requests
              {(requestsQuery.data?.incomingCount ?? 0) > 0 && (
                <span className="ml-1 rounded-full bg-emerald-500 text-white text-xs font-bold px-2 py-0.5">
                  {requestsQuery.data!.incomingCount}
                </span>
              )}
            </Link>
          </div>

          {!session?.user?.id ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
              <p className="text-slate-600 dark:text-slate-300">Sign in to view your Crew.</p>
            </div>
          ) : crewQuery.isLoading ? (
            <p className="text-slate-500">Loading…</p>
          ) : crewQuery.error ? (
            <div className="rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 p-4">
              Failed to load Crew. Try refreshing.
            </div>
          ) : (
            <CrewList
              crews={crewQuery.data ?? []}
              currentUserId={session.user.id}
              onRemove={handleRemove}
            />
          )}
        </div>
      </div>
    </div>
  );
}
