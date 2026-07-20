'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NotificationPreferenceResponse } from '@/types/notification-preference';

type NotificationTrigger = NotificationPreferenceResponse['trigger'];

/** Client-side view of a preference row — the shared API response shape. */
type NotificationPreference = NotificationPreferenceResponse;

interface TriggerMeta {
  trigger: NotificationTrigger;
  label: string;
  description: string;
  hasSchedule: boolean;
}

const TRIGGERS: TriggerMeta[] = [
  {
    trigger: 'DAILY_PROMPT',
    label: 'Morning prompt to signal your plans',
    description: 'A daily nudge to share what you’re up to so your Crew can join in.',
    hasSchedule: true,
  },
  {
    trigger: 'PER_MEMBER_INTENT',
    label: 'When a Crew member you follow signals',
    description: 'Get notified the moment someone you follow shares their plans.',
    hasSchedule: false,
  },
  {
    trigger: 'GROUP_FORMATION',
    label: 'When a group forms around your plan',
    description: 'Find out when two or more of your Crew rally around the same Topic.',
    hasSchedule: false,
  },
];

const DEFAULT_SCHEDULE = '08:00';

function isNotificationTrigger(value: unknown): value is NotificationTrigger {
  return (
    value === 'DAILY_PROMPT' ||
    value === 'PER_MEMBER_INTENT' ||
    value === 'GROUP_FORMATION'
  );
}

/**
 * Unwraps the GET envelope returned by `/api/users/notification-preferences`:
 *   `{ success: true, data: { preferences: [...] } }`
 *
 * Also tolerates a bare `{ preferences: [...] }` object and a bare array, so a
 * future/legacy body shape degrades gracefully instead of silently rendering
 * defaults. Anything unrecognised yields `undefined` (never throws), which
 * `parsePreferencesResponse` turns into `[]` for the caller to treat as a
 * load failure.
 */
function unwrapPreferences(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'object' || raw === null) return undefined;

  const envelope = raw as Record<string, unknown>;

  // { success, data: { preferences: [...] } }
  const data = envelope.data;
  if (typeof data === 'object' && data !== null) {
    const inner = (data as Record<string, unknown>).preferences;
    if (Array.isArray(inner)) return inner;
  }

  // { preferences: [...] }
  if (Array.isArray(envelope.preferences)) return envelope.preferences;

  return undefined;
}

/**
 * Unwraps the response envelope and parses it into preference rows.
 * Returns `[]` for any malformed / missing body — never throws.
 */
export function parsePreferencesResponse(raw: unknown): NotificationPreference[] {
  return parsePreferences(unwrapPreferences(raw));
}

function parsePreferences(raw: unknown): NotificationPreference[] {
  if (!Array.isArray(raw)) return [];
  const result: NotificationPreference[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (!isNotificationTrigger(record.trigger)) continue;
    result.push({
      trigger: record.trigger,
      enabled: typeof record.enabled === 'boolean' ? record.enabled : false,
      schedule: typeof record.schedule === 'string' ? record.schedule : null,
      perMemberTargets: Array.isArray(record.perMemberTargets)
        ? record.perMemberTargets.filter((t): t is string => typeof t === 'string')
        : [],
    });
  }
  return result;
}

interface PatchPayload {
  trigger: NotificationTrigger;
  enabled: boolean;
  schedule?: string | null;
  perMemberTargets?: string[];
}

export function NotificationPreferencesForm() {
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Partial<Record<NotificationTrigger, string>>>({});
  const [savingTrigger, setSavingTrigger] = useState<NotificationTrigger | null>(null);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/users/notification-preferences');
      if (!res.ok) {
        setLoadError('Failed to load notification preferences.');
        return;
      }
      const body: unknown = await res.json().catch(() => undefined);
      const parsed = parsePreferencesResponse(body);
      if (parsed.length === 0) {
        // A 200 with an unrecognisable body is a load failure, not an empty state:
        // the API always returns one entry per trigger.
        setLoadError('Failed to load notification preferences.');
        setPrefs([]);
        return;
      }
      setPrefs(parsed);
    } catch {
      setLoadError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  const persist = useCallback(
    async (
      trigger: NotificationTrigger,
      next: NotificationPreference,
      previous: NotificationPreference,
    ) => {
      setSavingTrigger(trigger);
      setRowError((prev) => ({ ...prev, [trigger]: undefined }));

      const payload: PatchPayload = {
        trigger: next.trigger,
        enabled: next.enabled,
        schedule: next.schedule,
        perMemberTargets: next.perMemberTargets,
      };

      try {
        const res = await fetch('/api/users/notification-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          // Roll back optimistic update
          setPrefs((prev) =>
            prev.map((p) => (p.trigger === trigger ? previous : p)),
          );
          setRowError((prev) => ({
            ...prev,
            [trigger]: body.error ?? 'Failed to save — changes were reverted.',
          }));
        }
      } catch {
        setPrefs((prev) => prev.map((p) => (p.trigger === trigger ? previous : p)));
        setRowError((prev) => ({
          ...prev,
          [trigger]: 'Network error — changes were reverted.',
        }));
      } finally {
        setSavingTrigger(null);
      }
    },
    [],
  );

  const handleToggle = useCallback(
    (trigger: NotificationTrigger, meta: TriggerMeta) => {
      setPrefs((prev) => {
        const previous = prev.find((p) => p.trigger === trigger);
        if (!previous) return prev;

        const enabled = !previous.enabled;
        const next: NotificationPreference = {
          ...previous,
          enabled,
          schedule:
            meta.hasSchedule && enabled
              ? previous.schedule ?? DEFAULT_SCHEDULE
              : previous.schedule,
        };

        void persist(trigger, next, previous);
        return prev.map((p) => (p.trigger === trigger ? next : p));
      });
    },
    [persist],
  );

  const handleScheduleChange = useCallback(
    (trigger: NotificationTrigger, schedule: string) => {
      setPrefs((prev) => {
        const previous = prev.find((p) => p.trigger === trigger);
        if (!previous) return prev;

        const next: NotificationPreference = { ...previous, schedule };
        void persist(trigger, next, previous);
        return prev.map((p) => (p.trigger === trigger ? next : p));
      });
    },
    [persist],
  );

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {TRIGGERS.map((meta) => (
          <div
            key={meta.trigger}
            className="h-20 rounded-xl border border-gray-100 bg-gray-50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {loadError}
        </p>
        <button
          onClick={() => void fetchPrefs()}
          className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (prefs.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">
        No notification preferences are available right now.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {TRIGGERS.map((meta) => {
        const pref = prefs.find((p) => p.trigger === meta.trigger);
        if (!pref) return null;

        const isSaving = savingTrigger === meta.trigger;
        const error = rowError[meta.trigger];

        return (
          <div
            key={meta.trigger}
            className={`p-4 rounded-xl border-2 transition-colors ${
              pref.enabled ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{meta.label}</div>
                <div className="text-sm text-gray-500">{meta.description}</div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={pref.enabled}
                aria-label={`Toggle: ${meta.label}`}
                disabled={isSaving}
                onClick={() => handleToggle(meta.trigger, meta)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  pref.enabled ? 'bg-teal-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    pref.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {meta.hasSchedule && pref.enabled && (
              <div className="mt-3 flex items-center gap-2">
                <label
                  htmlFor={`schedule-${meta.trigger}`}
                  className="text-sm font-medium text-gray-700"
                >
                  Send at
                </label>
                <input
                  id={`schedule-${meta.trigger}`}
                  type="time"
                  value={pref.schedule ?? DEFAULT_SCHEDULE}
                  disabled={isSaving}
                  onChange={(e) => handleScheduleChange(meta.trigger, e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
                />
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
