'use client';

/**
 * /meetups/new — Create a Meetup page
 * Inline form (not modal). On success redirects to /meetups.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, CalendarPlus } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { MeetupVisibility } from '@/types/meetup';
import type { CreateMeetupInput } from '@/types/meetup';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return a datetime-local string (YYYY-MM-DDTHH:mm) from a Date, in local time. */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Default scheduledAt: one hour from now, rounded to the nearest 15 min. */
function defaultScheduledAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return toDatetimeLocal(d);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  venueName: string;
  scheduledAt: string;
  endsAt: string;
  visibility: MeetupVisibility;
  capacity: string;
}

const INITIAL_FORM: FormState = {
  title: '',
  description: '',
  venueName: '',
  scheduledAt: defaultScheduledAt(),
  endsAt: '',
  visibility: MeetupVisibility.CREW,
  capacity: '',
};

const VISIBILITY_LABELS: Record<MeetupVisibility, string> = {
  PUBLIC: 'Public — anyone can see it',
  CREW: 'Crew — only your crew members',
  INVITE_ONLY: 'Invite-only — only people you invite',
  PRIVATE: 'Private — only you',
};

// ─── Form component ───────────────────────────────────────────────────────────

function CreateMeetupForm() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({ ...prev, [name]: value }));
      setError(null);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!session?.user?.id) {
        setError('You must be signed in to create a meetup.');
        return;
      }

      const scheduledDate = new Date(form.scheduledAt);
      if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        setError('Please pick a date and time in the future.');
        return;
      }

      const body: CreateMeetupInput = {
        title: form.title.trim(),
        scheduledAt: scheduledDate.toISOString(),
        visibility: form.visibility,
      };

      if (form.description.trim()) body.description = form.description.trim();
      if (form.venueName.trim()) body.venueName = form.venueName.trim();
      if (form.capacity.trim()) {
        const cap = parseInt(form.capacity, 10);
        if (isNaN(cap) || cap < 2 || cap > 500) {
          setError('Capacity must be between 2 and 500.');
          return;
        }
        body.capacity = cap;
      }
      if (form.endsAt.trim()) {
        const endsDate = new Date(form.endsAt);
        if (isNaN(endsDate.getTime())) {
          setError('End time is invalid.');
          return;
        }
        if (endsDate <= scheduledDate) {
          setError('End time must be after the start time.');
          return;
        }
        body.endsAt = endsDate.toISOString();
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/meetups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const json = (await res.json()) as { success: boolean; error?: string };

        if (!res.ok || !json.success) {
          setError(json.error ?? 'Failed to create meetup. Please try again.');
          return;
        }

        router.push('/meetups');
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [form, session, router]
  );

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={100}
          placeholder="e.g. Coffee &amp; Catch-up"
          value={form.title}
          onChange={handleChange}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="What's the vibe? Any details people should know…"
          value={form.description}
          onChange={handleChange}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
        <p className="mt-1 text-xs text-slate-400">{form.description.length}/500</p>
      </div>

      {/* Venue name */}
      <div>
        <label htmlFor="venueName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Venue name
        </label>
        <input
          id="venueName"
          name="venueName"
          type="text"
          maxLength={100}
          placeholder="e.g. Blue Bottle Coffee, SoHo"
          value={form.venueName}
          onChange={handleChange}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Date & time row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="scheduledAt" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Start time <span className="text-red-500">*</span>
          </label>
          <input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            required
            value={form.scheduledAt}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label htmlFor="endsAt" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            End time <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            value={form.endsAt}
            onChange={handleChange}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Visibility */}
      <div>
        <label htmlFor="visibility" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Visibility
        </label>
        <select
          id="visibility"
          name="visibility"
          value={form.visibility}
          onChange={handleChange}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {Object.entries(VISIBILITY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Capacity */}
      <div>
        <label htmlFor="capacity" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Capacity <span className="text-slate-400 font-normal">(optional, 2–500)</span>
        </label>
        <input
          id="capacity"
          name="capacity"
          type="number"
          min={2}
          max={500}
          placeholder="No limit"
          value={form.capacity}
          onChange={handleChange}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          <CalendarPlus className="w-4 h-4" />
          {submitting ? 'Creating…' : 'Create meetup'}
        </button>
        <Link
          href="/meetups"
          className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateMeetupPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />
      <div className="pt-20 pb-16">
        <div className="max-w-2xl mx-auto px-4">
          {/* Back link */}
          <div className="mb-6">
            <Link
              href="/meetups"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Meetups
            </Link>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Create a Meetup</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Plan a get-together with your crew. Fill in the details below and we&apos;ll handle
              the invites.
            </p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <CreateMeetupForm />
          </div>
        </div>
      </div>
    </div>
  );
}
