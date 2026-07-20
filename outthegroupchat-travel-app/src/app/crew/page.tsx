'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Inbox, MoreVertical, UserMinus, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import BlockButton from '@/components/safety/BlockButton';
import { PerMemberIntentToggle } from '@/components/notifications/PerMemberIntentToggle';
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

  const crews = crewQuery.data ?? [];

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
          ) : crews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center">
              <Users className="w-10 h-10 mx-auto text-slate-400 mb-3" />
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                No one here yet
              </h3>
              <p className="text-sm text-slate-500">
                Add your first Crew member from a profile page or search.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {crews.map((crew) => (
                <CrewMemberCard
                  key={crew.id}
                  crew={crew}
                  currentUserId={session.user.id}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface CrewMemberCardProps {
  crew: CrewWithUsers;
  currentUserId: string;
  onRemove: (crewId: string) => void;
}

function CrewMemberCard({ crew, currentUserId, onRemove }: CrewMemberCardProps) {
  const other = crew.userAId === currentUserId ? crew.userB : crew.userA;
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crew/${crew.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Failed to remove');
      setMenuOpen(false);
      onRemove(crew.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const displayName = other.name ?? 'Anonymous';

  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
      <Link href={`/profile/${other.id}`} className="shrink-0">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {other.image ? (
            <Image
              src={other.image}
              alt={displayName}
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-slate-500 font-semibold text-lg">
              {other.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <Link
          href={`/profile/${other.id}`}
          className="block font-semibold text-slate-900 dark:text-white truncate"
        >
          {displayName}
        </Link>
        {other.city && <p className="text-sm text-slate-500 truncate">{other.city}</p>}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <PerMemberIntentToggle targetUserId={other.id} targetName={other.name} variant="icon" />

        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-60"
          aria-label={`Remove ${displayName} from Crew`}
          title="Remove from Crew"
        >
          <UserMinus className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition"
            aria-label={`More options for ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              {/* Click-away backdrop */}
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                role="menu"
                aria-label={`Options for ${displayName}`}
                className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              >
                <BlockButton
                  targetUserId={other.id}
                  targetName={other.name}
                  variant="menuItem"
                  onBlockChange={(blocked) => {
                    // Blocking severs the Crew edge server-side; drop the card.
                    if (blocked) {
                      setMenuOpen(false);
                      onRemove(crew.id);
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
