'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, AlertCircle } from 'lucide-react';
import type { WindowPreset } from '@prisma/client';
import {
  WINDOW_PRESET_META,
  WINDOW_PRESET_ORDER,
  DAY_OFFSET_LABELS,
  type IntentTopicSummary,
  type CreateIntentResponse,
} from '@/types/intent';
import { NYC_NEIGHBORHOODS } from '@/lib/intent/neighborhoods';

interface IntentCreateFormProps {
  /** Where to redirect after a successful create. Default: /intents */
  redirectTo?: string;
}

/**
 * V1 Phase 1 — Journey A capture form.
 *
 * Two-step flow:
 *   1. User types free text + picks a window. Submit calls POST /api/intents.
 *   2. If the server returns 422 needsTopicPicker, the form swaps to a Topic
 *      dropdown (loaded lazily from GET /api/topics) and re-submits with
 *      explicit topicId.
 */
export function IntentCreateForm({ redirectTo = '/intents' }: IntentCreateFormProps) {
  const router = useRouter();

  const [rawText, setRawText] = useState('');
  const [windowPreset, setWindowPreset] = useState<WindowPreset>('EVENING');
  const [dayOffset, setDayOffset] = useState(0);
  const [cityArea, setCityArea] = useState('');

  const [topics, setTopics] = useState<IntentTopicSummary[] | null>(null);
  const [pickerTopicId, setPickerTopicId] = useState('');
  const [needsPicker, setNeedsPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Topic list lazily — only when the picker is exposed.
  useEffect(() => {
    if (!needsPicker || topics !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/topics');
        const body = await res.json();
        if (!cancelled && body.success) {
          setTopics(body.data.topics as IntentTopicSummary[]);
        }
      } catch {
        if (!cancelled) setError('Could not load Topic list — please try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsPicker, topics]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!rawText.trim() && !pickerTopicId) {
      setError('Tell us what you’re up for, or pick a category.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        windowPreset,
        dayOffset,
      };
      if (rawText.trim()) body.rawText = rawText.trim();
      if (pickerTopicId) body.topicId = pickerTopicId;
      if (cityArea) body.cityArea = cityArea;

      const res = await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as CreateIntentResponse;

      if (res.status === 422 && json.needsTopicPicker) {
        setNeedsPicker(true);
        setError(json.message ?? 'Pick the closest category to continue.');
        return;
      }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Something went wrong — please try again.');
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="intent-create-form"
      className="space-y-6 rounded-2xl border border-otg-border bg-otg-surface/60 p-6"
    >
      {/* rawText */}
      <div>
        <label htmlFor="intent-rawtext" className="mb-2 block text-sm font-medium text-otg-text-bright">
          What are you up for?
        </label>
        <input
          id="intent-rawtext"
          type="text"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="drinks tonight, run tomorrow morning, brunch Saturday…"
          maxLength={280}
          className="w-full rounded-lg border border-otg-border bg-otg-bg px-4 py-3 text-otg-text-bright placeholder-otg-text-muted focus:border-otg-sodium focus:outline-none"
          autoFocus
        />
      </div>

      {/* windowPreset segmented picker */}
      <div>
        <span className="mb-2 block text-sm font-medium text-otg-text-bright">When?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Window preset">
          {WINDOW_PRESET_ORDER.map((preset) => {
            const meta = WINDOW_PRESET_META[preset];
            const active = preset === windowPreset;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setWindowPreset(preset)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  active
                    ? 'border-otg-sodium bg-otg-sodium/15 text-otg-sodium'
                    : 'border-otg-border bg-otg-bg text-otg-text-muted hover:border-otg-sodium/50'
                }`}
              >
                <span className="font-medium">{meta.label}</span>
                <span className="ml-1 text-xs opacity-70">{meta.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* dayOffset segmented picker */}
      <div>
        <label htmlFor="intent-day" className="mb-2 block text-sm font-medium text-otg-text-bright">
          Day
        </label>
        <select
          id="intent-day"
          value={dayOffset}
          onChange={(e) => setDayOffset(Number(e.target.value))}
          className="w-full rounded-lg border border-otg-border bg-otg-bg px-4 py-2 text-otg-text-bright focus:border-otg-sodium focus:outline-none"
        >
          {DAY_OFFSET_LABELS.map((label, idx) => (
            <option key={idx} value={idx}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* cityArea dropdown */}
      <div>
        <label htmlFor="intent-cityarea" className="mb-2 block text-sm font-medium text-otg-text-bright">
          Neighborhood <span className="text-xs text-otg-text-muted">(optional)</span>
        </label>
        <select
          id="intent-cityarea"
          value={cityArea}
          onChange={(e) => setCityArea(e.target.value)}
          className="w-full rounded-lg border border-otg-border bg-otg-bg px-4 py-2 text-otg-text-bright focus:border-otg-sodium focus:outline-none"
        >
          <option value="">Anywhere</option>
          {NYC_NEIGHBORHOODS.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.displayName} <span className="opacity-60">· {n.borough}</span>
            </option>
          ))}
        </select>
      </div>

      {/* Manual Topic picker — only after a needsTopicPicker server hint */}
      {needsPicker && (
        <div data-testid="intent-topic-picker">
          <label htmlFor="intent-topic" className="mb-2 block text-sm font-medium text-otg-text-bright">
            Pick a Topic
          </label>
          <select
            id="intent-topic"
            value={pickerTopicId}
            onChange={(e) => setPickerTopicId(e.target.value)}
            className="w-full rounded-lg border border-otg-sodium bg-otg-bg px-4 py-2 text-otg-text-bright focus:outline-none"
            required
          >
            <option value="">Select a Topic…</option>
            {(topics ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.98 }}
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-otg-sodium px-6 py-3 text-sm font-semibold text-otg-bg transition hover:bg-otg-sodium/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {submitting ? 'Posting…' : 'Signal Intent'}
      </motion.button>
    </form>
  );
}
