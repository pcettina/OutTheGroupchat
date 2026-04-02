'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import FollowButton from '@/components/social/FollowButton';
import { logger } from '@/lib/logger';

interface PublicTrip {
  id: string;
  title: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  _count: { members: number; activities: number };
}

interface PublicUserProfile {
  id: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  city: string | null;
  createdAt: string;
  _count: { followers: number; following: number; ownedTrips: number };
  isFollowing: boolean;
  publicTrips: PublicTrip[];
}

interface ApiResponse {
  success: boolean;
  data?: PublicUserProfile;
  error?: string;
}

type PageState = 'loading' | 'notFound' | 'error' | 'ready';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';

const statusStyle: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  ACTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};
const defaultStatusStyle = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

function TripCard({ trip }: { trip: PublicTrip }) {
  const dates = [fmtDate(trip.startDate), fmtDate(trip.endDate)].filter(Boolean).join(' – ');
  return (
    <Link href={`/trips/${trip.id}`} className="block bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{trip.title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{trip.destination}</p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${statusStyle[trip.status] ?? defaultStatusStyle}`}>
          {trip.status.charAt(0) + trip.status.slice(1).toLowerCase()}
        </span>
      </div>
      {dates && <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{dates}</p>}
      <div className="flex gap-4 mt-3 text-xs text-slate-500 dark:text-slate-400">
        <span>{trip._count.members} {trip._count.members === 1 ? 'member' : 'members'}</span>
        <span>{trip._count.activities} {trip._count.activities === 1 ? 'activity' : 'activities'}</span>
      </div>
    </Link>
  );
}

export default function PublicProfilePage() {
  const params = useParams();
  const userId = typeof params.userId === 'string' ? params.userId : '';
  const [pageState, setPageState] = useState<PageState>('loading');
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/${userId}`);
        if (cancelled) return;
        if (res.status === 404) { setPageState('notFound'); return; }
        if (!res.ok) { setPageState('error'); return; }
        const json: ApiResponse = await res.json();
        if (cancelled) return;
        if (json.success && json.data) { setProfile(json.data); setPageState('ready'); }
        else setPageState('error');
      } catch (err) {
        if (!cancelled) { logger.error({ err }, '[PublicProfilePage] fetch failed'); setPageState('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />
      <main className="pt-20 pb-16"><div className="max-w-3xl mx-auto px-4">{children}</div></main>
    </div>
  );

  if (pageState === 'loading') return shell(
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 animate-pulse mx-auto mb-4" />
        <p className="text-slate-500 dark:text-slate-400">Loading profile...</p>
      </div>
    </div>
  );

  if (pageState === 'notFound') return shell(
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <p className="text-5xl mb-4">404</p>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">User not found</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">This profile does not exist or has been removed.</p>
        <Link href="/" className="btn btn-primary px-6">Go home</Link>
      </div>
    </div>
  );

  if (pageState === 'error' || !profile) return shell(
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">Failed to load profile.</p>
        <button onClick={() => { setPageState('loading'); setProfile(null); }} className="btn btn-primary px-6">Try again</button>
      </div>
    </div>
  );

  const joinDate = new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return shell(
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative mb-8">
        <div className="h-40 rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10" />
        </div>
        <div className="relative -mt-16 px-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
            <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 p-1 shadow-xl">
              <div className="w-full h-full rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                {profile.image ? (
                  <Image src={profile.image} alt={profile.name ?? 'User avatar'} fill style={{ objectFit: 'cover' }} />
                ) : (
                  <span className="text-3xl font-bold text-emerald-500">{profile.name?.charAt(0) ?? '?'}</span>
                )}
              </div>
            </div>
            <div className="flex-1 text-center sm:text-left pb-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{profile.name ?? 'Anonymous'}</h1>
              {profile.city && (
                <p className="text-slate-500 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1 mt-1 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {profile.city}
                </p>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Joined {joinDate}</p>
              {profile.bio && <p className="text-slate-600 dark:text-slate-300 mt-2 max-w-md text-sm">{profile.bio}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row items-center sm:items-center gap-4">
            <FollowButton userId={profile.id} initialIsFollowing={profile.isFollowing} followersCount={profile._count.followers} />
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="font-bold text-slate-900 dark:text-white">{profile._count.following}</p>
                <p className="text-slate-500 dark:text-slate-400">Following</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-900 dark:text-white">{profile._count.ownedTrips}</p>
                <p className="text-slate-500 dark:text-slate-400">Trips</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {profile.publicTrips.length > 0 ? (
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Public Trips</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {profile.publicTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
          </div>
        </motion.section>
      ) : (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
          No public trips yet.
        </motion.p>
      )}
    </>
  );
}
