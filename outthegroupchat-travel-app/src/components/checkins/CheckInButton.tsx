'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { easeOutQuart, triggerHaptic } from '@/lib/motion';

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

interface DurationOption {
  label: string;
  minutes: number;
}

const DURATION_OPTIONS: DurationOption[] = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
];

const DEFAULT_DURATION_MINUTES = 360;

// Drop-Pin — brief §6 signature micro-interaction #2. Pin falls 24px from above with a
// spring tuned for a more pronounced landing (bounce 0.5 vs the default 0.35 snappySpring),
// then a single sodium ring pulses outward from where the pin landed.
const DROP_PIN_SPRING = {
  type: 'spring' as const,
  visualDuration: 0.28,
  bounce: 0.5,
};

export function CheckInButton({
  venueId,
  note,
  onCheckedIn,
  className = '',
}: CheckInButtonProps) {
  const [buttonState, setButtonState] = useState<ButtonState>('idle');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [duration, setDuration] = useState(DEFAULT_DURATION_MINUTES);
  const [dropNonce, setDropNonce] = useState(0);

  const shouldReduceMotion = useReducedMotion();

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const handleCheckIn = async () => {
    if (buttonState !== 'idle') return;

    setButtonState('loading');

    try {
      const activeUntilOverride = new Date(Date.now() + duration * 60 * 1000).toISOString();

      const res = await fetch('/api/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, note, activeUntilOverride }),
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
      // Drop-Pin fires on the idle → checked-in transition only. Nonce lets us replay
      // the drop if this component ever supported re-check-in (today it doesn't —
      // state terminates at checked-in for this session).
      setDropNonce((n) => n + 1);
      triggerHaptic('checkin-success');
      showToast("You're out.");

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
      {!isCheckedIn && (
        <div
          role="group"
          aria-label="Check-in duration"
          className="flex flex-wrap gap-1.5"
        >
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.minutes}
              type="button"
              onClick={() => setDuration(option.minutes)}
              disabled={disabled}
              aria-pressed={duration === option.minutes}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium transition-colors duration-100 border',
                duration === option.minutes
                  ? 'bg-otg-tile border-otg-tile text-otg-bg-dark'
                  : 'bg-otg-maraschino border-otg-border text-otg-tile hover:border-otg-tile',
                disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative isolate inline-flex">
        {/* Drop-Pin concentric ring — scale 1 → 2.4, opacity 0.4 → 0, 600ms easeOutQuart */}
        <AnimatePresence>
          {isCheckedIn && dropNonce > 0 && !shouldReduceMotion && (
            <motion.span
              key={`ring-${dropNonce}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-otg-sodium"
              initial={{ opacity: 0.4, scale: 1 }}
              animate={{ opacity: 0, scale: 2.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: easeOutQuart }}
            />
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => {
            void handleCheckIn();
          }}
          disabled={disabled}
          aria-label={isCheckedIn ? 'Checked in' : 'Check in to this venue'}
          className={[
            'relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors duration-150',
            isCheckedIn
              ? 'bg-otg-tile text-otg-bg-dark cursor-default'
              : 'bg-otg-sodium text-otg-bg-dark hover:bg-otg-sodium-400 active:bg-otg-brick',
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
              {/* Dropping pin — lands into the button from 24px above on the state flip */}
              <motion.span
                key={`pin-${dropNonce}`}
                aria-hidden="true"
                className="inline-flex"
                initial={shouldReduceMotion ? false : { y: -24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={DROP_PIN_SPRING}
              >
                <MapPin className="h-4 w-4" />
              </motion.span>
              Checked in
            </>
          ) : (
            'Check in'
          )}
        </button>
      </div>

      {toast && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs font-medium ${
            toast.isError ? 'text-otg-danger' : 'text-otg-tile'
          }`}
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}

export default CheckInButton;
