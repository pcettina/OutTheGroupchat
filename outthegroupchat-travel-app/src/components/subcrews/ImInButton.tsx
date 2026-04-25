'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { snappySpring, triggerHaptic } from '@/lib/motion';

interface ImInButtonProps {
  subCrewId: string;
  onJoined?: (memberId: string) => void;
  className?: string;
}

/**
 * "I'm in" CTA — appears on emerging SubCrew cards in the feed (R21 open join).
 * Reuses snappySpring + haptic from src/lib/motion.ts per the V1 plan.
 */
export function ImInButton({ subCrewId, onJoined, className = '' }: ImInButtonProps) {
  const [state, setState] = useState<'idle' | 'submitting' | 'joined' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = async () => {
    if (state === 'submitting' || state === 'joined') return;
    setState('submitting');
    setErrorMsg(null);
    triggerHaptic('button-press');

    try {
      const res = await fetch(`/api/subcrews/${subCrewId}/join`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setState('error');
        setErrorMsg(body.error ?? 'Could not join.');
        return;
      }
      setState('joined');
      onJoined?.(body.data.memberId);
    } catch {
      setState('error');
      setErrorMsg('Network error.');
    }
  };

  const label =
    state === 'joined'
      ? "You're in"
      : state === 'submitting'
        ? 'Joining…'
        : "I'm in";

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <motion.button
        type="button"
        onClick={handleClick}
        whileTap={{ scale: 0.96 }}
        transition={snappySpring}
        disabled={state === 'submitting' || state === 'joined'}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${
          state === 'joined'
            ? 'bg-otg-sodium/20 text-otg-sodium'
            : 'bg-otg-sodium text-otg-bg hover:bg-otg-sodium/90'
        }`}
      >
        {state === 'submitting' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state === 'joined' ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : null}
        {label}
      </motion.button>
      {errorMsg && (
        <span className="text-xs text-red-400" role="alert">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
