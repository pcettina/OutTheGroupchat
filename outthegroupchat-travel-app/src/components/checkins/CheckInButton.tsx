'use client';

import { useState } from 'react';

interface CheckInButtonProps {
  venueId?: string;
  note?: string;
  onCheckedIn?: (checkIn: { id: string; activeUntil: string }) => void;
  className?: string;
}

interface ToastState {
  message: string;
  isError: boolean;
}

type ButtonState = 'idle' | 'loading' | 'checked-in';

export function CheckInButton({
  venueId,
  note,
  onCheckedIn,
  className = '',
}: CheckInButtonProps) {
  const [buttonState, setButtonState] = useState<ButtonState>('idle');
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCheckIn = async () => {
    if (buttonState !== 'idle') return;

    setButtonState('loading');

    try {
      const res = await fetch('/api/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, note }),
      });

      const data = (await res.json()) as {
        success: boolean;
        data?: { id: string; activeUntil: string };
        error?: string;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to check in.');
      }

      setButtonState('checked-in');
      showToast('Checked in successfully!');

      if (data.data && onCheckedIn) {
        onCheckedIn(data.data);
      }
    } catch (err) {
      setButtonState('idle');
      showToast(err instanceof Error ? err.message : 'Something went wrong.', true);
    }
  };

  const isLoading = buttonState === 'loading';
  const isCheckedIn = buttonState === 'checked-in';
  const disabled = isLoading || isCheckedIn;

  return (
    <div className={`relative inline-flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => { void handleCheckIn(); }}
        disabled={disabled}
        aria-label={isCheckedIn ? 'Checked in' : 'Check in to this venue'}
        className={[
          'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-150',
          isCheckedIn
            ? 'bg-emerald-500 text-white cursor-default'
            : 'bg-teal-600 hover:bg-teal-700 text-white active:bg-teal-800',
          disabled && !isCheckedIn ? 'opacity-70 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isLoading ? (
          <>
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
            Checking in…
          </>
        ) : isCheckedIn ? (
          <>
            <span aria-hidden="true">&#10003;</span>
            Checked in
          </>
        ) : (
          'Check in'
        )}
      </button>

      {toast && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs font-medium ${
            toast.isError ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}

export default CheckInButton;
