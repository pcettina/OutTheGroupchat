'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { UserMinus, Users } from 'lucide-react';
import type { CrewWithUsers } from '@/types/social';

interface CrewListProps {
  crews: CrewWithUsers[];
  currentUserId: string;
  onRemove?: (crewId: string) => void;
}

export default function CrewList({ crews, currentUserId, onRemove }: CrewListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (crewId: string) => {
    setBusyId(crewId);
    setError(null);
    try {
      const res = await fetch(`/api/crew/${crewId}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Failed to remove');
      onRemove?.(crewId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusyId(null);
    }
  };

  if (crews.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center">
        <Users className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">No one here yet</h3>
        <p className="text-sm text-slate-500">
          Add your first Crew member from a profile page or search.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {crews.map((crew) => {
          const other = crew.userAId === currentUserId ? crew.userB : crew.userA;
          return (
            <li
              key={crew.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3"
            >
              <Link href={`/profile/${other.id}`} className="shrink-0">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  {other.image ? (
                    <Image
                      src={other.image}
                      alt={other.name ?? 'User'}
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
                  {other.name ?? 'Anonymous'}
                </Link>
                {other.city && (
                  <p className="text-sm text-slate-500 truncate">{other.city}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(crew.id)}
                disabled={busyId === crew.id}
                className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-60"
                aria-label={`Remove ${other.name ?? 'user'} from Crew`}
                title="Remove from Crew"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
