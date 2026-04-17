'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Calendar } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import CrewButton from '@/components/social/CrewButton';
import type { CrewStatus } from '@prisma/client';

type ResolvedStatus = CrewStatus | 'NOT_IN_CREW' | 'SELF';

interface PublicProfile {
  id: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  city: string | null;
  crewLabel: string | null;
  createdAt: string;
  _count: {
    ownedTrips: number;
  };
  crewCount: number;
}

interface CrewStatusResponse {
  status: ResolvedStatus;
  crewId: string | null;
  iAmRequester: boolean;
}

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId;
  const { data: session } = useSession();

  const profileQuery = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) throw new Error('Failed to load profile');
      const body = await res.json();
      return body.data as PublicProfile;
    },
    enabled: !!userId,
  });

  const crewStatusQuery = useQuery({
    queryKey: ['crew-status', userId],
    queryFn: async () => {
      const res = await fetch(`/api/crew/status/${userId}`);
      if (!res.ok) throw new Error('Failed to load crew status');
      const body = await res.json();
      return body.data as CrewStatusResponse;
    },
    enabled: !!userId && !!session?.user?.id,
  });

  const profile = profileQuery.data;
  const crewStatus = crewStatusQuery.data;
  const viewingSelf = !!session?.user?.id && session.user.id === userId;
  const label =
    profile?.crewLabel && profile.crewLabel.trim().length > 0 ? profile.crewLabel : 'Crew';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />
      <div className="pt-20 pb-12">
        <div className="max-w-3xl mx-auto px-4">
          {profileQuery.isLoading ? (
            <p className="text-slate-500">Loading profile…</p>
          ) : profileQuery.error || !profile ? (
            <div className="rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 p-4">
              Failed to load profile.{' '}
              <Link href="/" className="underline">
                Go home
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 flex flex-col md:flex-row items-start gap-6">
                <div className="w-28 h-28 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
                  {profile.image ? (
                    <Image
                      src={profile.image}
                      alt={profile.name ?? 'User'}
                      width={112}
                      height={112}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-4xl font-bold">
                      {profile.name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="min-w-0">
                      <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
                        {profile.name ?? 'Anonymous'}
                      </h1>
                      {profile.city && (
                        <p className="flex items-center gap-1 text-slate-600 dark:text-slate-400 mt-1 text-sm">
                          <MapPin className="w-4 h-4" />
                          {profile.city}
                        </p>
                      )}
                      <p className="flex items-center gap-1 text-slate-400 mt-1 text-xs">
                        <Calendar className="w-3 h-3" />
                        Joined {new Date(profile.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {!viewingSelf && session?.user?.id && (
                      <div data-testid="crew-button-slot">
                        <CrewButton
                          targetUserId={profile.id}
                          initialStatus={crewStatus?.status}
                          initialCrewId={crewStatus?.crewId ?? null}
                          initialIsRequester={crewStatus?.iAmRequester ?? false}
                        />
                      </div>
                    )}
                    {viewingSelf && (
                      <Link
                        href="/profile"
                        className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
                      >
                        Edit profile
                      </Link>
                    )}
                  </div>

                  {profile.bio && (
                    <p className="text-slate-600 dark:text-slate-300 mt-4 whitespace-pre-wrap">
                      {profile.bio}
                    </p>
                  )}

                  <dl className="mt-6 flex gap-6 text-sm">
                    <div>
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white text-lg">
                        {profile.crewCount}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
