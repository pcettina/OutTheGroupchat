'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type TriggerKey = 'DAILY_PROMPT' | 'PER_MEMBER_INTENT' | 'GROUP_FORMATION';

interface TriggerPreference {
  enabled: boolean;
  schedule: string | null;
  perMemberTargets: string[];
}

interface PreferencesPayload {
  DAILY_PROMPT: TriggerPreference;
  PER_MEMBER_INTENT: TriggerPreference;
  GROUP_FORMATION: TriggerPreference;
}

interface PreferencesResponse {
  success: boolean;
  preferences: PreferencesPayload;
}

interface PatchBody {
  trigger: TriggerKey;
  enabled: boolean;
  schedule?: string | null;
  perMemberTargets?: string[];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_PREFS: PreferencesPayload = {
  DAILY_PROMPT: { enabled: false, schedule: null, perMemberTargets: [] },
  PER_MEMBER_INTENT: { enabled: false, schedule: null, perMemberTargets: [] },
  GROUP_FORMATION: { enabled: false, schedule: null, perMemberTargets: [] },
};

function parseTargets(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function NotificationSettingsForm() {
  const [prefs, setPrefs] = useState<PreferencesPayload>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [perMemberInput, setPerMemberInput] = useState<string>('');

  const scheduleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/users/notification-preferences', {
          credentials: 'include',
        });
        if (!res.ok) {
          if (!cancelled) {
            setError('Could not load preferences');
          }
          return;
        }
        const data = (await res.json()) as PreferencesResponse;
        if (!cancelled && data?.preferences) {
          setPrefs(data.preferences);
          setPerMemberInput(
            (data.preferences.PER_MEMBER_INTENT?.perMemberTargets ?? []).join(', '),
          );
        }
      } catch {
        if (!cancelled) {
          setError('Network error loading preferences');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scheduleDebounceRef.current) clearTimeout(scheduleDebounceRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const flashSaved = useCallback(() => {
    setSaveState('saved');
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => {
      setSaveState((prev) => (prev === 'saved' ? 'idle' : prev));
    }, 1500);
  }, []);

  const sendPatch = useCallback(
    async (body: PatchBody) => {
      setSaveState('saving');
      setError(null);
      try {
        const res = await fetch('/api/users/notification-preferences', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? 'Failed to save preferences');
          setSaveState('error');
          return;
        }
        flashSaved();
      } catch {
        setError('Network error — please try again');
        setSaveState('error');
      }
    },
    [flashSaved],
  );

  const updateTrigger = useCallback(
    (trigger: TriggerKey, patch: Partial<TriggerPreference>) => {
      setPrefs((prev) => ({
        ...prev,
        [trigger]: { ...prev[trigger], ...patch },
      }));
    },
    [],
  );

  function handleToggle(trigger: TriggerKey, nextEnabled: boolean) {
    updateTrigger(trigger, { enabled: nextEnabled });
    const current = prefs[trigger];
    const body: PatchBody = { trigger, enabled: nextEnabled };
    if (trigger === 'DAILY_PROMPT') {
      body.schedule = current.schedule;
    }
    if (trigger === 'PER_MEMBER_INTENT') {
      body.perMemberTargets = current.perMemberTargets;
    }
    void sendPatch(body);
  }

  function handleScheduleChange(value: string) {
    const nextSchedule = value || null;
    updateTrigger('DAILY_PROMPT', { schedule: nextSchedule });
    if (scheduleDebounceRef.current) clearTimeout(scheduleDebounceRef.current);
    scheduleDebounceRef.current = setTimeout(() => {
      void sendPatch({
        trigger: 'DAILY_PROMPT',
        enabled: prefs.DAILY_PROMPT.enabled,
        schedule: nextSchedule,
      });
    }, 500);
  }

  function handlePerMemberInputChange(value: string) {
    setPerMemberInput(value);
  }

  function handlePerMemberCommit() {
    const targets = parseTargets(perMemberInput);
    updateTrigger('PER_MEMBER_INTENT', { perMemberTargets: targets });
    void sendPatch({
      trigger: 'PER_MEMBER_INTENT',
      enabled: prefs.PER_MEMBER_INTENT.enabled,
      perMemberTargets: targets,
    });
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <p className="text-sm text-gray-500">Loading preferences…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Daily prompt"
        helper="We'll ask what you're up to."
        enabled={prefs.DAILY_PROMPT.enabled}
        onToggle={(v) => handleToggle('DAILY_PROMPT', v)}
      >
        {prefs.DAILY_PROMPT.enabled && (
          <div className="mt-4">
            <label
              htmlFor="daily-prompt-schedule"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Time of day
            </label>
            <input
              id="daily-prompt-schedule"
              type="time"
              value={prefs.DAILY_PROMPT.schedule ?? ''}
              onChange={(e) => handleScheduleChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Per-member intent"
        helper="Get notified when specific Crew members signal what they're up to."
        enabled={prefs.PER_MEMBER_INTENT.enabled}
        onToggle={(v) => handleToggle('PER_MEMBER_INTENT', v)}
      >
        {prefs.PER_MEMBER_INTENT.enabled && (
          <div className="mt-4">
            <label
              htmlFor="per-member-targets"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Crew member user IDs
            </label>
            <textarea
              id="per-member-targets"
              value={perMemberInput}
              onChange={(e) => handlePerMemberInputChange(e.target.value)}
              onBlur={handlePerMemberCommit}
              rows={3}
              placeholder="Comma-separated user IDs"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Separate IDs with commas. A real picker is coming soon.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Group formation"
        helper="Notify me when a SubCrew auto-forms around my Intent."
        enabled={prefs.GROUP_FORMATION.enabled}
        onToggle={(v) => handleToggle('GROUP_FORMATION', v)}
      />

      <div aria-live="polite" className="min-h-[1.25rem]">
        {saveState === 'saving' && (
          <p className="text-sm text-gray-500">Saving…</p>
        )}
        {saveState === 'saved' && (
          <p className="text-sm text-teal-600">✓ Saved</p>
        )}
        {saveState === 'error' && error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {saveState !== 'error' && error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  helper: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children?: React.ReactNode;
}

function SectionCard({ title, helper, enabled, onToggle, children }: SectionCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{helper}</p>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} label={title} />
      </div>
      {children}
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
        checked ? 'bg-teal-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
