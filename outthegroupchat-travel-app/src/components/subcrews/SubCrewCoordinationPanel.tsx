'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Check, Clock } from 'lucide-react';
import { PrivacyPickerModal, type PrivacyChoice } from '@/components/privacy/PrivacyPickerModal';
import type { SubCrewResponse } from '@/types/subcrew';
import { snappySpring, triggerHaptic } from '@/lib/motion';

interface SubCrewCoordinationPanelProps {
  subCrew: SubCrewResponse;
  callerUserId: string;
  /** Caller's matching live INTERESTED Intent for this SubCrew, if any. */
  callerIntentId: string | null;
  onChanged?: () => void;
}

/**
 * V1 Phase 3 — coordinate + commit panel rendered on /subcrews/[id].
 *
 * Three sub-surfaces:
 *   1. Member proposals: each non-seed member's "when works?" time.
 *   2. Seed control: SEED members can freeze SubCrew.startAt.
 *   3. Per-member Commit CTA: opens the 3-axis PrivacyPickerModal then POSTs
 *      /api/subcrews/[id]/commit on confirm.
 */
export function SubCrewCoordinationPanel({
  subCrew,
  callerUserId,
  callerIntentId,
  onChanged,
}: SubCrewCoordinationPanelProps) {
  const callerMember = useMemo(
    () => subCrew.members.find((m) => m.userId === callerUserId) ?? null,
    [subCrew.members, callerUserId],
  );
  const isSeed = callerMember?.joinMode === 'SEED';
  const alreadyCommitted = !!callerMember && (callerMember as { committedAt?: string | null }).committedAt;

  const [proposedTimeLocal, setProposedTimeLocal] = useState<string>('');
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const [seedTimeLocal, setSeedTimeLocal] = useState<string>(
    subCrew.startAt ? toLocalInput(subCrew.startAt) : '',
  );
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // ---- proposeTime ----
  const handlePropose = async () => {
    if (!proposedTimeLocal) return;
    setProposing(true);
    setProposeError(null);
    triggerHaptic('button-press');
    try {
      const res = await fetch(`/api/subcrews/${subCrew.id}/members/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedTime: new Date(proposedTimeLocal).toISOString() }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setProposeError(body.error ?? 'Could not save proposal.');
        return;
      }
      onChanged?.();
    } catch {
      setProposeError('Network error.');
    } finally {
      setProposing(false);
    }
  };

  // ---- freeze SubCrew.startAt (seed only) ----
  const handleFreeze = async () => {
    if (!seedTimeLocal) return;
    setFreezing(true);
    setFreezeError(null);
    triggerHaptic('button-press');
    try {
      const startAt = new Date(seedTimeLocal);
      // endAt = startAt + 3h as a reasonable default; seed can later adjust.
      const endAt = new Date(startAt.getTime() + 3 * 60 * 60 * 1000);
      const res = await fetch(`/api/subcrews/${subCrew.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setFreezeError(body.error ?? 'Could not freeze time.');
        return;
      }
      onChanged?.();
    } catch {
      setFreezeError('Network error.');
    } finally {
      setFreezing(false);
    }
  };

  // ---- commit (with privacy modal) ----
  const handleCommitConfirm = async (choice: PrivacyChoice) => {
    if (!callerIntentId) {
      setCommitError('No matching Intent found to commit.');
      setPickerOpen(false);
      return;
    }
    setCommitting(true);
    setCommitError(null);
    triggerHaptic('rsvp-confirm');
    try {
      const res = await fetch(`/api/subcrews/${subCrew.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId: callerIntentId, ...choice }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setCommitError(body.error ?? 'Could not commit.');
        return;
      }
      setPickerOpen(false);
      onChanged?.();
    } catch {
      setCommitError('Network error.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <section className="space-y-6 rounded-2xl border border-otg-border bg-otg-surface/60 p-5">
      <header>
        <h2 className="text-base font-semibold text-otg-text-bright">Coordinate + commit</h2>
        <p className="text-xs text-otg-text-muted">
          {isSeed
            ? 'You can freeze the time once everyone has weighed in.'
            : 'Tell the seed what works for you.'}
        </p>
      </header>

      {/* When the seed has frozen a time, show it */}
      {subCrew.startAt && (
        <div className="rounded-lg border border-otg-sodium/40 bg-otg-sodium/10 p-3 text-sm">
          <div className="flex items-center gap-2 text-otg-sodium">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span className="font-semibold">
              {new Date(subCrew.startAt).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      )}

      {/* Member proposals (non-seed) */}
      {!isSeed && callerMember && (
        <div data-testid="propose-time">
          <label className="mb-1 block text-sm font-medium text-otg-text-bright" htmlFor="propose-time-input">
            <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
            When works for you?
          </label>
          <div className="flex gap-2">
            <input
              id="propose-time-input"
              type="datetime-local"
              value={proposedTimeLocal}
              onChange={(e) => setProposedTimeLocal(e.target.value)}
              className="flex-1 rounded-lg border border-otg-border bg-otg-bg px-3 py-2 text-sm text-otg-text-bright"
            />
            <button
              type="button"
              onClick={handlePropose}
              disabled={proposing || !proposedTimeLocal}
              className="rounded-full bg-otg-sodium/20 px-4 py-2 text-sm font-medium text-otg-sodium hover:bg-otg-sodium/30 disabled:opacity-50"
            >
              {proposing ? 'Saving…' : 'Propose'}
            </button>
          </div>
          {proposeError && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {proposeError}
            </p>
          )}
        </div>
      )}

      {/* Seed: freeze time */}
      {isSeed && (
        <div data-testid="freeze-time">
          <label className="mb-1 block text-sm font-medium text-otg-text-bright" htmlFor="freeze-time-input">
            <Calendar className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Freeze the time
          </label>
          <div className="flex gap-2">
            <input
              id="freeze-time-input"
              type="datetime-local"
              value={seedTimeLocal}
              onChange={(e) => setSeedTimeLocal(e.target.value)}
              className="flex-1 rounded-lg border border-otg-border bg-otg-bg px-3 py-2 text-sm text-otg-text-bright"
            />
            <button
              type="button"
              onClick={handleFreeze}
              disabled={freezing || !seedTimeLocal}
              className="rounded-full bg-otg-sodium px-4 py-2 text-sm font-semibold text-otg-bg hover:bg-otg-sodium/90 disabled:opacity-50"
            >
              {freezing ? 'Saving…' : 'Freeze'}
            </button>
          </div>
          {freezeError && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {freezeError}
            </p>
          )}
        </div>
      )}

      {/* Commit CTA */}
      {callerMember && (
        <div className="border-t border-otg-border pt-4">
          {alreadyCommitted ? (
            <div className="flex items-center gap-2 text-sm text-otg-sodium">
              <Check className="h-4 w-4" aria-hidden="true" />
              You committed.
            </div>
          ) : (
            <motion.button
              type="button"
              transition={snappySpring}
              whileTap={{ scale: 0.97 }}
              onClick={() => setPickerOpen(true)}
              disabled={!callerIntentId}
              className="w-full rounded-full bg-otg-sodium px-6 py-3 text-sm font-semibold text-otg-bg transition hover:bg-otg-sodium/90 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="commit-button"
            >
              {callerIntentId ? 'Commit (set privacy)' : 'No matching Intent — post one to commit'}
            </motion.button>
          )}
          {commitError && (
            <p className="mt-2 text-xs text-red-400" role="alert">
              {commitError}
            </p>
          )}
        </div>
      )}

      <PrivacyPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleCommitConfirm}
        submitting={committing}
      />
    </section>
  );
}

/**
 * Render an ISO datetime as the value an `<input type="datetime-local">`
 * expects (YYYY-MM-DDTHH:mm, local timezone, no seconds, no offset).
 */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
