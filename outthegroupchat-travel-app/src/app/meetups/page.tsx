'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { CalendarDays, Plus } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { MeetupList } from '@/components/meetups';
import type { MeetupListItem } from '@/types/meetup';

export default function MeetupsPage() {
  const { data: session } = useSession();

  const meetupsQuery = useQuery({
    queryKey: ['meetups'],
    queryFn: async () => {
      const res = await fetch('/api/meetups');
      if (!res.ok) throw new Error('Failed to load meetups');
      const body = await res.json();
      return (body.data?.items ?? []) as MeetupListItem[];
    },
    enabled: !!session?.user?.id,
  });

  // Map MeetupListItem to the shape MeetupCard expects
  const meetups = (meetupsQuery.data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    scheduledAt: m.scheduledAt,
    endsAt: m.endsAt,
    venueName: m.venueName,
    visibility: m.visibility,
    cancelled: m.cancelled,
    host: m.host,
    _count: { attendees: m.attendeeCount },
  }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />
      <div className="pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <CalendarDays className="w-7 h-7 text-emerald-500" />
                Meetups
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                See what your Crew is up to.
              </p>
            </div>
            <Link
              href="/meetups/new"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Create Meetup
            </Link>
          </div>

          {!session?.user?.id ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
              <p className="text-slate-600 dark:text-slate-300">
                <Link href="/auth/signin" className="text-emerald-500 underline">
                  Sign in
                </Link>{' '}
                to view and create meetups.
              </p>
            </div>
          ) : meetupsQuery.isLoading ? (
            <p className="text-slate-500">Loading…</p>
          ) : meetupsQuery.error ? (
            <div className="rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 p-4">
              Failed to load meetups. Try refreshing.
            </div>
          ) : (
            <MeetupList meetups={meetups} />
          )}
        </div>
      </div>
    </div>
  );
}
