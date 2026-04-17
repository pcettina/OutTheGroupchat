'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, X, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { CrewWithUsers } from '@/types/social';

interface CrewRequestCardProps {
  crew: CrewWithUsers;
  direction: 'incoming' | 'sent';
  currentUserId: string;
  onChange?: (crewId: string, nextStatus: 'ACCEPTED' | 'DECLINED' | 'REMOVED') => void;
}

export default function CrewRequestCard({
  crew,
  direction,
  currentUserId,
  onChange,
}: CrewRequestCardProps) {
  const other = crew.userAId === currentUserId ? crew.userB : crew.userA;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (endpoint: 'accept' | 'decline' | 'cancel') => {
    setBusy(true);
    setError(null);
    try {
      const init: RequestInit =
        endpoint === 'cancel'
          ? { method: 'DELETE' }
          : {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: endpoint }),
            };

      const res = await fetch(`/api/crew/${crew.id}`, init);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Failed');
      if (endpoint === 'cancel') onChange?.(crew.id, 'REMOVED');
      else onChange?.(crew.id, endpoint === 'accept' ? 'ACCEPTED' : 'DECLINED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <Link href={`/profile/${other.id}`} className="shrink-0">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {other.image ? (
            <Image
              src={other.image}
              alt={other.name ?? 'User'}
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-slate-500 font-semibold">
              {other.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/profile/${other.id}`} className="block">
          <p className="font-semibold text-slate-900 dark:text-white truncate">
            {other.name ?? 'Anonymous'}
          </p>
        </Link>
        {other.city && (
          <p className="text-sm text-slate-500 truncate">{other.city}</p>
        )}
        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
          <Clock className="w-3 h-3" />
          {direction === 'incoming' ? 'Requested' : 'Sent'}{' '}
          {formatDistanceToNow(new Date(crew.createdAt), { addSuffix: true })}
        </p>
      </div>

      <div className="flex flex-col gap-1 items-end">
        {direction === 'incoming' ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => act('accept')}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              Accept
            </button>
            <button
              type="button"
              onClick={() => act('decline')}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60"
            >
              <X className="w-4 h-4" />
              Decline
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => act('cancel')}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
