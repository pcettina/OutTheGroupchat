'use client';

import { useState } from 'react';
import { Ban, ShieldOff } from 'lucide-react';

interface BlockButtonProps {
  targetUserId: string;
  targetName?: string | null;
  /**
   * Initial blocked state. There is no read endpoint for block status, so this
   * reflects the value known to the caller (defaults to unblocked). The control
   * then tracks state locally for the rest of the session.
   */
  initialBlocked?: boolean;
  /** `button` = standalone control (profile). `menuItem` = row inside an overflow menu (Crew list). */
  variant?: 'button' | 'menuItem';
  className?: string;
  onBlockChange?: (blocked: boolean) => void;
}

/**
 * BlockButton — block / unblock a user via the users/[userId]/block route.
 *
 * Blocking requires an explicit confirmation because it also severs the Crew
 * edge between the two users (see POST /api/users/[userId]/block). Unblocking is
 * reversible and applies immediately. Handles 429 / error responses inline.
 */
export default function BlockButton({
  targetUserId,
  targetName,
  initialBlocked = false,
  variant = 'button',
  className = '',
  onBlockChange,
}: BlockButtonProps) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = targetName?.trim() ? targetName.trim() : 'this user';

  const block = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${targetUserId}/block`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          res.status === 429
            ? 'Too many requests — please wait a moment and try again.'
            : body.error || 'Failed to block user'
        );
      }
      setBlocked(true);
      setConfirming(false);
      onBlockChange?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const unblock = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${targetUserId}/block`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(
          res.status === 429
            ? 'Too many requests — please wait a moment and try again.'
            : body.error || 'Failed to unblock user'
        );
      }
      setBlocked(false);
      onBlockChange?.(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  // ─── Menu-item variant (Crew list overflow menu) ──────────────────────────
  if (variant === 'menuItem') {
    const rowClass =
      'w-full flex items-start gap-2 text-left px-3 py-2 text-sm transition disabled:opacity-60';
    if (blocked) {
      return (
        <div className={className}>
          <button
            type="button"
            onClick={unblock}
            disabled={busy}
            className={`${rowClass} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700`}
            aria-label={`Unblock ${displayName}`}
          >
            <ShieldOff className="w-4 h-4 mt-0.5 shrink-0" />
            {busy ? 'Unblocking…' : 'Unblock'}
          </button>
          {error && <p className="px-3 pb-2 text-xs text-red-500">{error}</p>}
        </div>
      );
    }
    if (confirming) {
      return (
        <div className={className} role="group" aria-label="Confirm block">
          <p className="px-3 pt-2 pb-1 text-xs text-slate-500 dark:text-slate-400">
            Blocking {displayName} removes them from your Crew.
          </p>
          <button
            type="button"
            onClick={block}
            disabled={busy}
            className={`${rowClass} font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20`}
            aria-label={`Confirm blocking ${displayName}`}
          >
            <Ban className="w-4 h-4 mt-0.5 shrink-0" />
            {busy ? 'Blocking…' : 'Confirm block'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className={`${rowClass} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700`}
          >
            Cancel
          </button>
          {error && <p className="px-3 pb-2 text-xs text-red-500">{error}</p>}
        </div>
      );
    }
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${rowClass} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20`}
          aria-label={`Block ${displayName}`}
        >
          <Ban className="w-4 h-4 mt-0.5 shrink-0" />
          Block
        </button>
      </div>
    );
  }

  // ─── Standalone button variant (profile page) ─────────────────────────────
  const baseClass = 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60';

  if (blocked) {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <button
          type="button"
          onClick={unblock}
          disabled={busy}
          className={`${baseClass} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}
          aria-label={`Unblock ${displayName}`}
        >
          <ShieldOff className="w-4 h-4" />
          {busy ? 'Unblocking…' : 'Blocked · Unblock'}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  if (confirming) {
    return (
      <div
        className={`flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20 ${className}`}
        role="group"
        aria-label="Confirm block"
      >
        <p className="text-sm text-red-700 dark:text-red-200">
          Block {displayName}? This removes them from your Crew and you won&apos;t see each other.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={block}
            disabled={busy}
            className={`${baseClass} bg-red-600 text-white hover:bg-red-700`}
            aria-label={`Confirm blocking ${displayName}`}
          >
            <Ban className="w-4 h-4" />
            {busy ? 'Blocking…' : 'Block'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className={`${baseClass} bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700`}
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`${baseClass} bg-white text-slate-500 border border-slate-200 hover:border-red-300 hover:text-red-600 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:text-red-400`}
        aria-label={`Block ${displayName}`}
      >
        <Ban className="w-4 h-4" />
        Block
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
