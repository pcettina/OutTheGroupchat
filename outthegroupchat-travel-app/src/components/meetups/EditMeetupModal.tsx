'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { MeetupVisibility } from '@/types/meetup';
import { MeetupBasicFields } from './createMeetup/MeetupBasicFields';
import { MeetupVenueSection } from './createMeetup/MeetupVenueSection';
import { MeetupScheduleFields } from './createMeetup/MeetupScheduleFields';
import type { SelectedVenue } from './createMeetup/types';

/**
 * Minimal shape of a meetup the edit modal needs to pre-fill its fields.
 * Mirrors the detail-page `MeetupDetailData` subset the host can edit.
 */
export interface EditableMeetup {
  id: string;
  title: string;
  description: string | null;
  venueId: string | null;
  venueName: string | null;
  venue: { id: string; name: string; address: string | null; city: string } | null;
  scheduledAt: string;
  endsAt: string | null;
  visibility: MeetupVisibility;
  capacity: number | null;
}

export interface EditMeetupModalProps {
  /** The meetup being edited (its current server state). */
  meetup: EditableMeetup;
  /** Close the modal without saving. */
  onClose: () => void;
  /** Called after a successful PATCH so the parent can refetch. */
  onUpdated: () => void;
}

/** Convert an ISO datetime string to the `YYYY-MM-DDTHH:mm` value a
 *  `datetime-local` input expects, in the viewer's local timezone. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * EditMeetupModal — host-only modal to edit an existing meetup.
 *
 * Reuses the create-flow field subcomponents (`MeetupBasicFields`,
 * `MeetupVenueSection`, `MeetupScheduleFields`) and PATCHes
 * `/api/meetups/[id]` with only the fields that actually changed. On success
 * it calls `onUpdated` (parent refetch) then `onClose`.
 */
export function EditMeetupModal({ meetup, onClose, onUpdated }: EditMeetupModalProps) {
  // Initial venue selection: a linked venue becomes a SelectedVenue; a free-text
  // venue name (no venueId) becomes the free-text field.
  const initialSelectedVenue: SelectedVenue | null = meetup.venue
    ? {
        id: meetup.venue.id,
        name: meetup.venue.name,
        address: meetup.venue.address ?? undefined,
        city: meetup.venue.city,
      }
    : null;
  const initialFreeTextVenue = meetup.venue ? '' : meetup.venueName ?? '';
  const initialScheduledAt = isoToLocalInput(meetup.scheduledAt);
  const initialEndsAt = isoToLocalInput(meetup.endsAt);
  const initialCapacity = meetup.capacity !== null ? String(meetup.capacity) : '';

  const [title, setTitle] = useState(meetup.title);
  const [description, setDescription] = useState(meetup.description ?? '');
  const [selectedVenue, setSelectedVenue] = useState<SelectedVenue | null>(initialSelectedVenue);
  const [freeTextVenue, setFreeTextVenue] = useState(initialFreeTextVenue);
  const [scheduledAt, setScheduledAt] = useState(initialScheduledAt);
  const [endsAt, setEndsAt] = useState(initialEndsAt);
  const [visibility, setVisibility] = useState<MeetupVisibility>(meetup.visibility);
  const [capacity, setCapacity] = useState(initialCapacity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    if (!scheduledAt) {
      setError('Date & time is required.');
      return;
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      setError('Enter a valid date & time.');
      return;
    }

    let endsDate: Date | null = null;
    if (endsAt) {
      endsDate = new Date(endsAt);
      if (Number.isNaN(endsDate.getTime())) {
        setError('Enter a valid end time.');
        return;
      }
      if (endsDate <= scheduledDate) {
        setError('End time must be after the start time.');
        return;
      }
    }

    const parsedCapacity = capacity ? parseInt(capacity, 10) : undefined;
    if (parsedCapacity !== undefined && (parsedCapacity < 2 || parsedCapacity > 500)) {
      setError('Capacity must be between 2 and 500.');
      return;
    }

    // Build a PATCH body containing only fields that changed from the original.
    const body: Record<string, unknown> = {};

    const trimmedTitle = title.trim();
    if (trimmedTitle !== meetup.title) body.title = trimmedTitle;

    const trimmedDescription = description.trim();
    if (trimmedDescription !== (meetup.description ?? '')) {
      body.description = trimmedDescription;
    }

    // Venue: a picked venue wins; otherwise fall back to the free-text name.
    if (selectedVenue) {
      if (selectedVenue.id !== meetup.venueId) {
        body.venueId = selectedVenue.id;
        body.venueName = selectedVenue.name;
      }
    } else if (freeTextVenue.trim() !== (meetup.venueName ?? '')) {
      body.venueName = freeTextVenue.trim();
    }

    const scheduledIso = scheduledDate.toISOString();
    if (scheduledIso !== new Date(meetup.scheduledAt).toISOString()) {
      body.scheduledAt = scheduledIso;
    }

    if (endsDate) {
      const endsIso = endsDate.toISOString();
      if (!meetup.endsAt || endsIso !== new Date(meetup.endsAt).toISOString()) {
        body.endsAt = endsIso;
      }
    }

    if (visibility !== meetup.visibility) body.visibility = visibility;

    if (parsedCapacity !== undefined && parsedCapacity !== meetup.capacity) {
      body.capacity = parsedCapacity;
    }

    // Nothing changed — close without a network round-trip.
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/meetups/${meetup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null;

      if (!res.ok || !data?.success) {
        throw new Error(data?.error ?? 'That didn’t go through. Try again.');
      }

      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          key="edit-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-otg-bg-dark/70 backdrop-blur-sm"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />

        {/* Modal */}
        <motion.div
          key="edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-meetup-title"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2 }}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto max-h-[90vh]"
        >
          <div className="m-4 rounded-2xl border border-otg-border bg-otg-maraschino shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-otg-border px-6 py-4">
              <h2
                id="edit-meetup-title"
                className="font-display text-lg font-semibold text-otg-text-bright"
              >
                Edit meetup
              </h2>
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
            <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5 px-6 py-5">
              <MeetupBasicFields
                title={title}
                description={description}
                submitting={submitting}
                onTitleChange={setTitle}
                onDescriptionChange={setDescription}
              />

              <MeetupVenueSection
                selectedVenue={selectedVenue}
                freeTextVenue={freeTextVenue}
                paramVenueId=""
                submitting={submitting}
                onSelectedVenueChange={setSelectedVenue}
                onFreeTextVenueChange={setFreeTextVenue}
              />

              <MeetupScheduleFields
                scheduledAt={scheduledAt}
                endsAt={endsAt}
                visibility={visibility}
                capacity={capacity}
                submitting={submitting}
                onScheduledAtChange={setScheduledAt}
                onEndsAtChange={setEndsAt}
                onVisibilityChange={setVisibility}
                onCapacityChange={setCapacity}
              />

              {/* Error */}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-otg-danger/30 bg-otg-danger/10 px-3 py-2 text-sm text-otg-text-bright"
                >
                  {error}
                </p>
              )}

              {/* Actions */}
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
                  disabled={submitting}
                  className="rounded-full bg-otg-sodium px-5 py-2 text-sm font-medium text-otg-bg-dark hover:bg-otg-sodium-400 active:bg-otg-brick disabled:opacity-60 transition-colors"
                >
                  {submitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

export default EditMeetupModal;
