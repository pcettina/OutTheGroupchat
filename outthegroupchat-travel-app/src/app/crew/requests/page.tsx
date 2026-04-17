'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Inbox, Send } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import CrewRequestCard from '@/components/social/CrewRequestCard';
import type { CrewWithUsers } from '@/types/social';

type RequestsData = {
  incoming: CrewWithUsers[];
  sent: CrewWithUsers[];
  incomingCount: number;
  sentCount: number;
};

export default function CrewRequestsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'incoming' | 'sent'>('incoming');

  const query = useQuery({
    queryKey: ['crew-requests'],
    queryFn: async () => {
      const res = await fetch('/api/crew/requests');
      if (!res.ok) throw new Error('Failed to load requests');
      const body = await res.json();
      return body.data as RequestsData;
    },
    enabled: !!session?.user?.id,
  });

  const handleChange = (crewId: string, next: 'ACCEPTED' | 'DECLINED' | 'REMOVED') => {
    queryClient.setQueryData<RequestsData | undefined>(['crew-requests'], (prev) => {
      if (!prev) return prev;
      const filterOut = (list: CrewWithUsers[]) => list.filter((c) => c.id !== crewId);
      return {
        incoming: filterOut(prev.incoming),
        sent: filterOut(prev.sent),
        incomingCount: filterOut(prev.incoming).length,
        sentCount: filterOut(prev.sent).length,
      };
    });
    if (next === 'ACCEPTED') {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
    }
    queryClient.invalidateQueries({ queryKey: ['crew-requests-count'] });
  };

  const data = query.data;
  const userId = session?.user?.id;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />
      <div className="pt-20 pb-12">
        <div className="max-w-2xl mx-auto px-4">
          <div className="mb-6">
            <Link
              href="/crew"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Crew
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-6">
            Crew requests
          </h1>

          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700 mb-6 w-fit">
            <button
              onClick={() => setTab('incoming')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === 'incoming'
                  ? 'bg-emerald-500 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Inbox className="w-4 h-4" />
              Incoming
              {(data?.incomingCount ?? 0) > 0 && (
                <span className="ml-1 text-xs font-bold bg-white/20 rounded-full px-2 py-0.5">
                  {data!.incomingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('sent')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === 'sent'
                  ? 'bg-emerald-500 text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Send className="w-4 h-4" />
              Sent
              {(data?.sentCount ?? 0) > 0 && (
                <span className="ml-1 text-xs font-bold bg-white/20 rounded-full px-2 py-0.5">
                  {data!.sentCount}
                </span>
              )}
            </button>
          </div>

          {!userId ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
              <p className="text-slate-600 dark:text-slate-300">Sign in to view requests.</p>
            </div>
          ) : query.isLoading ? (
            <p className="text-slate-500">Loading…</p>
          ) : query.error || !data ? (
            <div className="rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 p-4">
              Failed to load requests.
            </div>
          ) : tab === 'incoming' ? (
            data.incoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500">
                No incoming requests right now.
              </div>
            ) : (
              <div className="space-y-3">
                {data.incoming.map((crew) => (
                  <CrewRequestCard
                    key={crew.id}
                    crew={crew}
                    direction="incoming"
                    currentUserId={userId}
                    onChange={handleChange}
                  />
                ))}
              </div>
            )
          ) : data.sent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500">
              You haven&apos;t sent any requests yet.
            </div>
          ) : (
            <div className="space-y-3">
              {data.sent.map((crew) => (
                <CrewRequestCard
                  key={crew.id}
                  crew={crew}
                  direction="sent"
                  currentUserId={userId}
                  onChange={handleChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
