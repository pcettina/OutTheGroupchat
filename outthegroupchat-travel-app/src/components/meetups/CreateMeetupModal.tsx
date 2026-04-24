'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { VenuePicker } from './VenuePicker';
import type { MeetupVisibility } from '@/types/meetup';

interface SelectedVenue {
  id: string;
  name: string;
  address?: string;
  city: string;
}

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

const VISIBILITY_OPTIONS: { value: MeetupVisibility; label: string }[] = [
  { value: 'CREW', label: 'Crew only' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INVITE_ONLY', label: 'Invite only' },
  { value: 'PRIVATE', label: 'Private' },
];

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
        throw new Error(data.error ?? 'That didn\u2019t go through. Try again.');
      }

      onSuccess?.(data.data!.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn\u2019t go through. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Last Call palette — brief §3. Inputs live on the dark app background, not a white card
  // surface: `bg-otg-bg-dark` keeps them readable inside the `bg-otg-maraschino` modal
  // without competing with the form labels. Focus rings use sodium.
  const inputClass =
    'w-full rounded-lg border border-otg-border bg-otg-bg-dark px-3 py-2 text-sm text-otg-text-bright placeholder:text-otg-text-dim/70 focus:border-otg-sodium focus:outline-none focus:ring-1 focus:ring-otg-sodium disabled:opacity-60';

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
                {/* Title */}
                <div>
                  <label
                    htmlFor="meetup-title"
                    className="mb-1.5 block text-sm font-medium text-otg-text-bright"
                  >
                    Title <span className="text-otg-sodium" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="meetup-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Rooftop hangout"
                    disabled={submitting}
                    required
                    className={inputClass}
                  />
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="meetup-description"
                    className="mb-1.5 block text-sm font-medium text-otg-text-bright"
                  >
                    Description
                  </label>
                  <textarea
                    id="meetup-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What’s the vibe?"
                    rows={3}
                    disabled={submitting}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {/* Venue */}
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-otg-text-bright">
                    Venue
                  </span>
                  <VenuePicker
                    value={selectedVenue}
                    onChange={setSelectedVenue}
                    className="mb-2"
                  />
                  {!selectedVenue && (
                    <>
                      {paramVenueId && !freeTextVenue && (
                        <p className="mb-1.5 text-xs text-otg-text-dim">
                          Venue from your check-in will be used. Type below to override.
                        </p>
                      )}
                      <input
                        type="text"
                        value={freeTextVenue}
                        onChange={(e) => setFreeTextVenue(e.target.value)}
                        placeholder={
                          paramVenueId ? 'Override venue name (optional)' : 'Or type a venue name'
                        }
                        disabled={submitting}
                        className={inputClass}
                      />
                    </>
                  )}
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="meetup-scheduled-at"
                      className="mb-1.5 block text-sm font-medium text-otg-text-bright"
                    >
                      Date &amp; time <span className="text-otg-sodium" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="meetup-scheduled-at"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      disabled={submitting}
                      required
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="meetup-ends-at"
                      className="mb-1.5 block text-sm font-medium text-otg-text-bright"
                    >
                      End time
                    </label>
                    <input
                      id="meetup-ends-at"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      disabled={submitting}
                      className={`${inputClass} [color-scheme:dark]`}
                    />
                  </div>
                </div>

                {/* Visibility */}
                <div>
                  <label
                    htmlFor="meetup-visibility"
                    className="mb-1.5 block text-sm font-medium text-otg-text-bright"
                  >
                    Visibility
                  </label>
                  <select
                    id="meetup-visibility"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as MeetupVisibility)}
                    disabled={submitting}
                    className={inputClass}
                  >
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Capacity */}
                <div>
                  <label
                    htmlFor="meetup-capacity"
                    className="mb-1.5 block text-sm font-medium text-otg-text-bright"
                  >
                    Capacity <span className="text-otg-text-dim font-normal">(2–500)</span>
                  </label>
                  <input
                    id="meetup-capacity"
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    min={2}
                    max={500}
                    placeholder="No limit"
                    disabled={submitting}
                    className={inputClass}
                  />
                </div>

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
                    {submitting ? 'Creating\u2026' : 'Create meetup'}
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
