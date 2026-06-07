'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { MeetupVisibility } from '@/types/meetup';
import { MeetupBasicFields } from './createMeetup/MeetupBasicFields';
import { MeetupVenueSection } from './createMeetup/MeetupVenueSection';
import { MeetupScheduleFields } from './createMeetup/MeetupScheduleFields';
import type { SelectedVenue } from './createMeetup/types';

interface CreateMeetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (meetupId: string) => void;
  /** Pre-fill the title field (e.g. from a "Join me" check-in link). */
  initialTitle?: string;
  /** Pre-fill the free-text venue name (e.g. when venueId lookup is unavailable). */
  initialVenueName?: string;
  /** The check-in id this meetup originated from (stored, not shown). */
  initialCheckInId?: string;
}

export function CreateMeetupModal({
  isOpen,
  onClose,
  onSuccess,
  initialTitle,
  initialVenueName,
  initialCheckInId,
}: CreateMeetupModalProps) {
  // Read URL search params as a secondary source of pre-fill data.
  // Props take priority; params are used when the modal is opened without props
  // (e.g. rendered inside a page that receives query params directly).
  const searchParams = useSearchParams();

  const resolvedTitle = initialTitle ?? searchParams.get('title') ?? '';
  const resolvedVenueName = initialVenueName ?? '';
  const resolvedCheckInId = initialCheckInId ?? searchParams.get('checkInId') ?? '';
  // venueId from params — used to attempt a pre-selected venue via VenuePicker
  const paramVenueId = searchParams.get('venueId') ?? '';

  const [title, setTitle] = useState(resolvedTitle);
  const [description, setDescription] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<SelectedVenue | null>(null);
  const [freeTextVenue, setFreeTextVenue] = useState(resolvedVenueName);
  const [scheduledAt, setScheduledAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [visibility, setVisibility] = useState<MeetupVisibility>('CREW');
  const [capacity, setCapacity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stored on the form state; sent with the meetup POST so the server can
  // associate the meetup with the originating check-in if needed.
  const [checkInId] = useState(resolvedCheckInId);

  // When the modal opens, reset pre-fill values in case the caller's props changed.
  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle ?? searchParams.get('title') ?? '');
      setFreeTextVenue(initialVenueName ?? '');
    }
    // Only trigger on open/close transitions and prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
    if (scheduledDate <= new Date()) {
      setError('Scheduled time must be in the future.');
      return;
    }

    if (endsAt) {
      const endsDate = new Date(endsAt);
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

    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: scheduledDate.toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        visibility,
        capacity: parsedCapacity,
      };

      // Associate with originating check-in if present.
      if (checkInId) {
        body.checkInId = checkInId;
      }

      if (selectedVenue) {
        body.venueId = selectedVenue.id;
        body.venueName = selectedVenue.name;
      } else if (freeTextVenue.trim()) {
        body.venueName = freeTextVenue.trim();
      } else if (paramVenueId) {
        // Venue from check-in link — pass the venueId so the server can resolve it.
        body.venueId = paramVenueId;
      }

      const res = await fetch('/api/meetups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { success: boolean; data?: { id: string }; error?: string };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'That didn’t go through. Try again.');
      }

      onSuccess?.(data.data!.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
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
            key="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-meetup-title"
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
                  id="create-meetup-title"
                  className="font-display text-lg font-semibold text-otg-text-bright"
                >
                  Create meetup
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
                  paramVenueId={paramVenueId}
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
                    {submitting ? 'Creating…' : 'Create meetup'}
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

export default CreateMeetupModal;
