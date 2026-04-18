'use client';

import { useState } from 'react';
import { Check, HelpCircle, X } from 'lucide-react';
import type { AttendeeStatus } from '@/types/meetup';

interface RSVPButtonProps {
  meetupId: string;
  currentStatus?: AttendeeStatus | null;
  className?: string;
}

interface ToastState {
  message: string;
  isError: boolean;
}

const STATUS_OPTIONS: {
  value: AttendeeStatus;
  label: string;
  icon: typeof Check;
  activeClass: string;
  hoverClass: string;
}[] = [
  {
    value: 'GOING',
    label: 'Going',
    icon: Check,
    activeClass: 'bg-emerald-500 text-white border-emerald-500',
    hoverClass: 'hover:border-emerald-400 hover:text-emerald-600',
  },
  {
    value: 'MAYBE',
    label: 'Maybe',
    icon: HelpCircle,
    activeClass: 'bg-amber-400 text-white border-amber-400',
    hoverClass: 'hover:border-amber-400 hover:text-amber-600',
  },
  {
    value: 'DECLINED',
    label: 'Declined',
    icon: X,
    activeClass: 'bg-slate-400 text-white border-slate-400',
    hoverClass: 'hover:border-slate-400 hover:text-slate-600',
  },
];

export function RSVPButton({ meetupId, currentStatus = null, className = '' }: RSVPButtonProps) {
  const [status, setStatus] = useState<AttendeeStatus | null>(currentStatus);
  const [loadingStatus, setLoadingStatus] = useState<AttendeeStatus | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRSVP = async (nextStatus: AttendeeStatus) => {
    if (loadingStatus !== null) return;

    const previousStatus = status;

    // Optimistic update
    setStatus(nextStatus);
    setLoadingStatus(nextStatus);

    try {
      const res = await fetch(`/api/meetups/${meetupId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = (await res.json()) as { success: boolean; error?: string };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to update RSVP.');
      }

      showToast(
        nextStatus === 'GOING'
          ? "You're going!"
          : nextStatus === 'MAYBE'
          ? "You're a maybe."
          : "RSVP updated.",
      );
    } catch (err) {
      // Revert optimistic update
      setStatus(previousStatus);
      showToast(err instanceof Error ? err.message : 'Something went wrong.', true);
    } finally {
      setLoadingStatus(null);
    }
  };

  return (
    <div className={`relative inline-flex flex-col gap-2 ${className}`}>
      {/* Buttons */}
      <div className="inline-flex items-center gap-2" role="group" aria-label="RSVP options">
        {STATUS_OPTIONS.map(({ value, label, icon: Icon, activeClass, hoverClass }) => {
          const isActive = status === value;
          const isLoading = loadingStatus === value;
          const disabled = loadingStatus !== null;

          return (
            <button
              key={value}
              type="button"
              onClick={() => { void handleRSVP(value); }}
              disabled={disabled}
              aria-pressed={isActive}
              aria-label={`RSVP as ${label}`}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? activeClass
                  : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                !isActive && !disabled ? hoverClass : '',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {isLoading ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              ) : (
                <Icon className="h-4 w-4" aria-hidden="true" />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {/* Inline toast feedback */}
      {toast && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs font-medium ${toast.isError ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}

export default RSVPButton;
