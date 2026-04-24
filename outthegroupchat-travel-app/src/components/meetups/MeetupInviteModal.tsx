'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { X, Users, Send } from 'lucide-react';

interface CrewUserPreview {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
  crewLabel: string | null;
}

interface CrewItem {
  id: string;
  userA: CrewUserPreview;
  userB: CrewUserPreview;
  crewLabel: string | null;
  activeUntil: string | null;
}

interface CrewListResponse {
  success: boolean;
  data?: { items: CrewItem[]; total: number; page: number; pageSize: number; hasMore: boolean };
  error?: string;
}

interface InviteResponse {
  invited?: number;
  skipped?: number;
  error?: string;
}

export interface MeetupInviteModalProps {
  meetupId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { invited: number; skipped: number }) => void;
}

export function MeetupInviteModal({ meetupId, isOpen, onClose, onSuccess }: MeetupInviteModalProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const [crew, setCrew] = useState<CrewItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingCrew, setLoadingCrew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crewError, setCrewError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setError(null);
    setCrewError(null);
  }, [isOpen]);

  // Fetch crew when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadCrew = async () => {
      setLoadingCrew(true);
      setCrewError(null);
      try {
        const res = await fetch('/api/crew?pageSize=100', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = (await res.json()) as CrewListResponse;
        if (cancelled) return;
        if (!res.ok || !data.success || !data.data) {
          throw new Error(data.error ?? 'Failed to load crew.');
        }
        setCrew(Array.isArray(data.data.items) ? data.data.items : []);
      } catch (err) {
        if (cancelled) return;
        setCrewError(err instanceof Error ? err.message : 'Failed to load crew.');
        setCrew([]);
      } finally {
        if (!cancelled) setLoadingCrew(false);
      }
    };
    void loadCrew();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, submitting, onClose]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  // Map each crew row to the "other" user from the caller's perspective, deduped.
  const invitableUsers = useMemo<CrewUserPreview[]>(() => {
    if (!currentUserId) return [];
    const seen = new Set<string>();
    const others: CrewUserPreview[] = [];
    for (const c of crew) {
      const other: CrewUserPreview = c.userA.id === currentUserId ? c.userB : c.userA;
      if (other.id === currentUserId || seen.has(other.id)) continue;
      seen.add(other.id);
      others.push(other);
    }
    return others;
  }, [crew, currentUserId]);

  const toggleUser = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else if (next.size < 20) next.add(userId);
      return next;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedIds.size === 0 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/meetups/${meetupId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selectedIds) }),
      });
      const data = (await res.json()) as InviteResponse;
      if (!res.ok) throw new Error(data.error ?? 'Failed to invite. Try again.');
      const invited = typeof data.invited === 'number' ? data.invited : 0;
      const skipped = typeof data.skipped === 'number' ? data.skipped : 0;
      onSuccess?.({ invited, skipped });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = selectedIds.size;
  const submitLabel = submitting
    ? 'Sending…'
    : selectedCount === 0
      ? 'Invite'
      : `Invite ${selectedCount} ${selectedCount === 1 ? 'person' : 'people'}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="invite-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-otg-bg-dark/70 backdrop-blur-sm"
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
          <motion.div
            key="invite-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-meetup-title"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto max-h-[90vh]"
          >
            <div className="m-4 rounded-2xl border border-otg-border bg-otg-maraschino shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-otg-border px-6 py-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-otg-tile" aria-hidden="true" />
                  <h2 id="invite-meetup-title" className="font-display text-lg font-semibold text-otg-text-bright">
                    Invite Crew
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  aria-label="Close"
                  className="rounded-full p-2 text-otg-text-dim hover:bg-otg-bg-dark hover:text-otg-text-bright disabled:opacity-50 transition-colors"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={(e) => { void handleSubmit(e); }} className="px-6 py-5">
                <div className="mb-4 max-h-[50vh] overflow-y-auto rounded-lg border border-otg-border bg-otg-bg-dark/60">
                  {loadingCrew && (
                    <p className="px-4 py-6 text-center text-sm text-otg-text-dim">
                      Loading Crew…
                    </p>
                  )}

                  {!loadingCrew && crewError && (
                    <p role="alert" className="px-4 py-6 text-center text-sm text-otg-text-bright">
                      {crewError}
                    </p>
                  )}

                  {!loadingCrew && !crewError && invitableUsers.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-otg-text-dim">
                      <p className="mb-2">
                        You don&apos;t have Crew yet. Add people from their profile to invite them.
                      </p>
                      <Link
                        href="/discover"
                        className="font-medium text-otg-sodium hover:text-otg-sodium-400 transition-colors"
                        onClick={handleClose}
                      >
                        Find people on Discover →
                      </Link>
                    </div>
                  )}

                  {!loadingCrew && !crewError && invitableUsers.length > 0 && (
                    <ul className="divide-y divide-otg-border">
                      {invitableUsers.map((user, idx) => {
                        const checked = selectedIds.has(user.id);
                        const inputId = `invite-user-${user.id}`;
                        const displayName = user.name ?? 'Unknown user';
                        return (
                          <li key={user.id}>
                            <label
                              htmlFor={inputId}
                              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-otg-maraschino/60 transition-colors"
                            >
                              <input
                                id={inputId}
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleUser(user.id)}
                                disabled={submitting}
                                autoFocus={idx === 0}
                                className="h-4 w-4 rounded border-otg-border bg-otg-bg-dark text-otg-sodium focus:ring-otg-sodium focus:ring-offset-0 disabled:opacity-50"
                              />
                              <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-otg-maraschino border border-otg-border">
                                {user.image ? (
                                  <Image src={user.image} alt={displayName} fill sizes="36px" className="object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-otg-text-dim">
                                    {displayName.charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-otg-text-bright">{displayName}</p>
                                {user.city && (
                                  <p className="truncate text-xs text-otg-text-dim">{user.city}</p>
                                )}
                              </div>
                              {user.crewLabel && (
                                <span className="rounded-full bg-otg-tile/15 px-2 py-0.5 text-xs font-medium text-otg-tile ring-1 ring-inset ring-otg-tile/30">
                                  {user.crewLabel}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {selectedCount > 0 && (
                  <p className="mb-3 text-xs text-otg-text-dim">
                    {selectedCount} of 20 max selected
                  </p>
                )}

                {error && (
                  <p
                    role="alert"
                    className="mb-3 rounded-lg border border-otg-danger/30 bg-otg-danger/10 px-3 py-2 text-sm text-otg-text-bright"
                  >
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="rounded-full border border-otg-border bg-otg-bg-dark px-5 py-2 text-sm font-medium text-otg-text-bright hover:border-otg-text-dim disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || selectedCount === 0}
                    className="inline-flex items-center gap-2 rounded-full bg-otg-sodium px-5 py-2 text-sm font-medium text-otg-bg-dark hover:bg-otg-sodium-400 active:bg-otg-brick disabled:opacity-60 transition-colors"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {submitLabel}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default MeetupInviteModal;
