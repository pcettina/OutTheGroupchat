'use client';

import { useState } from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from 'framer-motion';
import { Check, HelpCircle, X } from 'lucide-react';
import type { AttendeeStatus } from '@/types/meetup';
import { easeOutQuart, snappySpring, triggerHaptic } from '@/lib/motion';

interface RSVPButtonProps {
  meetupId: string;
  currentStatus?: AttendeeStatus | null;
  className?: string;
}

interface ToastState {
  message: string;
  isError: boolean;
}

type StatusOption = {
  value: AttendeeStatus;
  label: string;
  icon: typeof Check;
  activeClass: string;
  hoverClass: string;
};

// Last Call palette — brief §3. Going = sodium (primary affirmative), Maybe = bourbon
// (secondary warm), Declined = tile (teal, Crew-neutral; softer than a slate refusal).
const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'GOING',
    label: 'Going',
    icon: Check,
    activeClass: 'bg-otg-sodium border-otg-sodium text-otg-bg-dark',
    hoverClass: 'hover:border-otg-sodium hover:text-otg-sodium',
  },
  {
    value: 'MAYBE',
    label: 'Maybe',
    icon: HelpCircle,
    activeClass: 'bg-otg-bourbon border-otg-bourbon text-otg-bg-dark',
    hoverClass: 'hover:border-otg-bourbon hover:text-otg-bourbon',
  },
  {
    value: 'DECLINED',
    label: 'Declined',
    icon: X,
    activeClass: 'bg-otg-tile border-otg-tile text-otg-bg-dark',
    hoverClass: 'hover:border-otg-tile hover:text-otg-tile',
  },
];

export function RSVPButton({ meetupId, currentStatus = null, className = '' }: RSVPButtonProps) {
  const [status, setStatus] = useState<AttendeeStatus | null>(currentStatus);
  const [loadingStatus, setLoadingStatus] = useState<AttendeeStatus | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pulse, setPulse] = useState<{ status: AttendeeStatus; nonce: number } | null>(null);

  const shouldReduceMotion = useReducedMotion();

  // One controls handle per button — hooks can't live inside conditionals/maps,
  // and three buttons never scale; keep them static.
  const goingControls = useAnimationControls();
  const maybeControls = useAnimationControls();
  const declinedControls = useAnimationControls();

  const controlsFor = (value: AttendeeStatus) =>
    value === 'GOING'
      ? goingControls
      : value === 'MAYBE'
      ? maybeControls
      : declinedControls;

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

      // Pulse-In — brief §6 signature micro-interaction #1.
      // Button scales 1 → 0.94 → 1.06 → 1 via snappySpring; a tile-teal radial glow
      // fans out behind it (opacity 0.6 → 0, scale 1 → 1.8, 500ms easeOutQuart).
      // Haptic fires regardless of reduced-motion preference — motion and haptics are
      // orthogonal; users can disable vibration at the OS level.
      if (!shouldReduceMotion) {
        setPulse({ status: nextStatus, nonce: (pulse?.nonce ?? 0) + 1 });
        void controlsFor(nextStatus).start({
          scale: [1, 0.94, 1.06, 1],
          transition: snappySpring,
        });
      }
      triggerHaptic('rsvp-confirm');

      showToast(
        nextStatus === 'GOING'
          ? "You're going."
          : nextStatus === 'MAYBE'
          ? "You're a maybe."
          : 'RSVP updated.',
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
          const isPulsing = pulse?.status === value;

          return (
            <div key={value} className="relative">
              {/* Radial glow — scoped to the button that was just confirmed */}
              <AnimatePresence>
                {isPulsing && pulse && !shouldReduceMotion && (
                  <motion.span
                    key={pulse.nonce}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-otg-tile"
                    initial={{ opacity: 0.6, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.8 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: easeOutQuart }}
                  />
                )}
              </AnimatePresence>

              <motion.button
                type="button"
                onClick={() => {
                  void handleRSVP(value);
                }}
                disabled={disabled}
                aria-pressed={isActive}
                aria-label={`RSVP as ${label}`}
                animate={controlsFor(value)}
                className={[
                  'relative inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? activeClass
                    : 'border-otg-border bg-otg-maraschino text-otg-text-bright',
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
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* Inline toast feedback */}
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

export default RSVPButton;
