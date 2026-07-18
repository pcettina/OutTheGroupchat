'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';

type ReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'INAPPROPRIATE_CONTENT'
  | 'IMPERSONATION'
  | 'SAFETY_CONCERN'
  | 'OTHER';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
  { value: 'IMPERSONATION', label: 'Impersonation' },
  { value: 'SAFETY_CONCERN', label: 'Safety concern' },
  { value: 'OTHER', label: 'Other' },
];

interface ReportButtonProps {
  targetType: 'USER' | 'MEETUP';
  targetId: string;
  targetName?: string | null;
  /** `button` = standalone control. `menuItem` = row inside an overflow menu. */
  variant?: 'button' | 'menuItem';
  className?: string;
}

/**
 * ReportButton — report a user or meetup via POST /api/reports.
 *
 * Click opens an inline panel to pick a reason (and optionally add details),
 * then submits. Handles 429 / error responses inline and shows a terminal
 * "Reported" state on success (201).
 */
export default function ReportButton({
  targetType,
  targetId,
  targetName,
  variant = 'button',
  className = '',
}: ReportButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [details, setDetails] = useState('');

  const displayName = targetName?.trim()
    ? targetName.trim()
    : targetType === 'MEETUP' ? 'this meetup' : 'this user';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          details: details.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new Error(
          res.status === 429
            ? 'Too many requests, try again later.'
            : body?.error || 'Failed to submit report'
        );
      }
      setDone(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const isMenu = variant === 'menuItem';
  const triggerClass = isMenu
    ? 'w-full flex items-start gap-2 text-left px-3 py-2 text-sm transition disabled:opacity-60 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
    : 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 bg-white text-slate-500 border border-slate-200 hover:border-red-300 hover:text-red-600 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:text-red-400';

  if (done) {
    return (
      <div className={className}>
        <span className={isMenu ? 'flex items-center gap-2 px-3 py-2 text-sm text-slate-500 dark:text-slate-400' : 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
          <Flag className="w-4 h-4" />
          Reported
        </span>
      </div>
    );
  }

  if (confirming) {
    return (
      <div
        className={`flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20 ${className}`}
        role="group"
        aria-label={`Report ${displayName}`}
      >
        <p className="text-sm text-red-700 dark:text-red-200">Report {displayName}?</p>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="report-reason">
          Reason
        </label>
        <select
          id="report-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          disabled={busy}
          rows={2}
          maxLength={1000}
          placeholder="Add details (optional)"
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 bg-red-600 text-white hover:bg-red-700"
            aria-label={`Submit report for ${displayName}`}
          >
            <Flag className="w-4 h-4" />
            {busy ? 'Submitting…' : 'Submit report'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <div className={isMenu ? className : `flex flex-col gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={triggerClass}
        aria-label={`Report ${displayName}`}
      >
        <Flag className={isMenu ? 'w-4 h-4 mt-0.5 shrink-0' : 'w-4 h-4'} />
        Report
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
