'use client';

import { useState, useCallback } from 'react';
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
}

const VISIBILITY_OPTIONS: { value: MeetupVisibility; label: string }[] = [
  { value: 'CREW', label: 'Crew only' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INVITE_ONLY', label: 'Invite only' },
  { value: 'PRIVATE', label: 'Private' },
];

export function CreateMeetupModal({ isOpen, onClose, onSuccess }: CreateMeetupModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<SelectedVenue | null>(null);
  const [freeTextVenue, setFreeTextVenue] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [visibility, setVisibility] = useState<MeetupVisibility>('CREW');
  const [capacity, setCapacity] = useState('');
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

      if (selectedVenue) {
        body.venueId = selectedVenue.id;
        body.venueName = selectedVenue.name;
      } else if (freeTextVenue.trim()) {
        body.venueName = freeTextVenue.trim();
      }

      const res = await fetch('/api/meetups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { success: boolean; data?: { id: string }; error?: string };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to create meetup.');
      }

      onSuccess?.(data.data!.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60';

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
            className="fixed inset-0 z-50 bg-black/50"
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
            <div className="m-4 rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                <h2
                  id="create-meetup-title"
                  className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                  Create Meetup
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  aria-label="Close"
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5 px-6 py-5">
                {/* Title */}
                <div>
                  <label
                    htmlFor="meetup-title"
                    className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="meetup-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Rooftop hangout"
                    disabled={submitting}
                    required
                    className={inputClass}
                  />
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="meetup-description"
                    className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Description
                  </label>
                  <textarea
                    id="meetup-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's the vibe?"
                    rows={3}
                    disabled={submitting}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {/* Venue */}
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Venue
                  </span>
                  <VenuePicker
                    value={selectedVenue}
                    onChange={setSelectedVenue}
                    className="mb-2"
                  />
                  {!selectedVenue && (
                    <input
                      type="text"
                      value={freeTextVenue}
                      onChange={(e) => setFreeTextVenue(e.target.value)}
                      placeholder="Or type a venue name freely"
                      disabled={submitting}
                      className={inputClass}
                    />
                  )}
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="meetup-scheduled-at"
                      className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Date & Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="meetup-scheduled-at"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      disabled={submitting}
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="meetup-ends-at"
                      className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      End Time
                    </label>
                    <input
                      id="meetup-ends-at"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      disabled={submitting}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Visibility */}
                <div>
                  <label
                    htmlFor="meetup-visibility"
                    className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
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
                    className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Capacity <span className="text-slate-400 font-normal">(2–500)</span>
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
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </p>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {submitting ? 'Creating…' : 'Create Meetup'}
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
