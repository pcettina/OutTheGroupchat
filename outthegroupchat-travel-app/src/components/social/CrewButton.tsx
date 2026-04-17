'use client';

import { useEffect, useState } from 'react';
import { Check, UserPlus, Users, X, Hourglass } from 'lucide-react';
import type { CrewStatus } from '@prisma/client';

type ResolvedStatus = CrewStatus | 'NOT_IN_CREW' | 'SELF';

interface CrewButtonProps {
  targetUserId: string;
  initialStatus?: ResolvedStatus;
  initialCrewId?: string | null;
  initialIsRequester?: boolean;
  className?: string;
  onStatusChange?: (next: { status: ResolvedStatus; crewId: string | null }) => void;
}

/**
 * CrewButton replaces the former FollowButton.
 *
 * It renders the correct action(s) for the viewer's relationship with `targetUserId`:
 * add, accept/decline, cancel pending, or remove. Status is fetched lazily if not
 * passed via props.
 */
export default function CrewButton({
  targetUserId,
  initialStatus,
  initialCrewId = null,
  initialIsRequester = false,
  className = '',
  onStatusChange,
}: CrewButtonProps) {
  const [status, setStatus] = useState<ResolvedStatus>(initialStatus ?? 'NOT_IN_CREW');
  const [crewId, setCrewId] = useState<string | null>(initialCrewId);
  const [iAmRequester, setIAmRequester] = useState(initialIsRequester);
  const [loading, setLoading] = useState(initialStatus === undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialStatus !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/crew/status/${targetUserId}`);
        if (!res.ok) throw new Error('Failed to load Crew status');
        const body = (await res.json()) as {
          success: boolean;
          data?: { status: ResolvedStatus; crewId: string | null; iAmRequester: boolean };
        };
        if (cancelled || !body.data) return;
        setStatus(body.data.status);
        setCrewId(body.data.crewId);
        setIAmRequester(body.data.iAmRequester);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetUserId, initialStatus]);

  const notify = (next: ResolvedStatus, nextCrewId: string | null) => {
    onStatusChange?.({ status: next, crewId: nextCrewId });
  };

  const sendRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/crew/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Failed to send request');
      setStatus('PENDING');
      setCrewId(body.data.id);
      setIAmRequester(true);
      notify('PENDING', body.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (action: 'accept' | 'decline') => {
    if (!crewId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crew/${crewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || `Failed to ${action}`);
      const next: ResolvedStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
      setStatus(next);
      notify(next, crewId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const removeCrew = async () => {
    if (!crewId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crew/${crewId}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Failed to remove');
      setStatus('NOT_IN_CREW');
      setCrewId(null);
      setIAmRequester(false);
      notify('NOT_IN_CREW', null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'SELF') return null;
  if (loading) {
    return (
      <button
        disabled
        className={`inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-400 ${className}`}
      >
        <Hourglass className="w-4 h-4 animate-pulse" />
        Loading…
      </button>
    );
  }

  const baseClass = `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${className}`;

  if (status === 'NOT_IN_CREW' || status === 'DECLINED') {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={sendRequest}
          disabled={busy}
          className={`${baseClass} bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60`}
        >
          <UserPlus className="w-4 h-4" />
          Add to Crew
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  if (status === 'PENDING' && iAmRequester) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={removeCrew}
          disabled={busy}
          className={`${baseClass} bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300`}
          aria-label="Cancel Crew request"
        >
          <Hourglass className="w-4 h-4" />
          Request sent · Cancel
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  if (status === 'PENDING' && !iAmRequester) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => respond('accept')}
            disabled={busy}
            className={`${baseClass} bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60`}
          >
            <Check className="w-4 h-4" />
            Accept
          </button>
          <button
            type="button"
            onClick={() => respond('decline')}
            disabled={busy}
            className={`${baseClass} bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300`}
          >
            <X className="w-4 h-4" />
            Decline
          </button>
        </div>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  if (status === 'ACCEPTED') {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={removeCrew}
          disabled={busy}
          className={`${baseClass} bg-emerald-50 text-emerald-700 hover:bg-red-50 hover:text-red-700 dark:bg-emerald-900/30 dark:text-emerald-200`}
        >
          <Users className="w-4 h-4" />
          In your Crew
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  // BLOCKED → do not offer action to the other side.
  return (
    <button
      disabled
      className={`${baseClass} bg-slate-100 text-slate-400 cursor-not-allowed`}
    >
      Unavailable
    </button>
  );
}
