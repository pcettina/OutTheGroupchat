'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { HeatmapGranularityMode, HeatmapIdentityMode } from '@prisma/client';

interface AxisOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

const GRANULARITY_OPTIONS: AxisOption<HeatmapGranularityMode>[] = [
  { value: 'HIDDEN', label: 'Hidden', hint: 'No location data written.' },
  { value: 'BLOCK', label: 'Block', hint: 'Default — snapped to ~110m grid.' },
  { value: 'DYNAMIC_CELL', label: 'Precise', hint: 'Snapped to ~11m grid.' },
];

const IDENTITY_OPTIONS: AxisOption<HeatmapIdentityMode>[] = [
  { value: 'KNOWN', label: 'With name', hint: 'Default for Crew (R20).' },
  { value: 'ANONYMOUS', label: 'Anonymous', hint: 'No name; subject to N≥3 floor.' },
  { value: 'CREW_ANCHORED', label: 'Friend of…', hint: 'For FoF tier (Phase 4).' },
];

const ANONYMOUS_HELPER = 'Only shown when at least 3 people share a cell.';

interface RelationshipSetting {
  targetId: string;
  name: string | null;
  image: string | null;
  crewLabel: string | null;
  granularityMode: HeatmapGranularityMode;
  identityMode: HeatmapIdentityMode;
}

interface GetResponse {
  success: boolean;
  data?: { settings: RelationshipSetting[] };
  error?: string;
}

interface PatchResponse {
  success: boolean;
  data?: {
    setting: {
      targetId: string;
      granularityMode: HeatmapGranularityMode;
      identityMode: HeatmapIdentityMode;
    };
  };
  error?: string;
}

type RowStatus = 'idle' | 'saving' | 'saved' | 'error';

interface RowState {
  status: RowStatus;
  error: string | null;
}

export function RelationshipSettingsList() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<RelationshipSetting[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/users/relationship-settings');
        const body = (await res.json().catch(() => null)) as GetResponse | null;

        if (!res.ok || !body?.success || !body.data) {
          if (!cancelled) {
            setLoadError(body?.error ?? 'Failed to load your Crew settings. Please try again.');
          }
          return;
        }

        if (!cancelled) {
          setSettings(body.data.settings);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Network error — please try again.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function setRow(targetId: string, next: RowState) {
    setRowState((prev) => ({ ...prev, [targetId]: next }));
  }

  async function persist(
    targetId: string,
    granularityMode: HeatmapGranularityMode,
    identityMode: HeatmapIdentityMode,
    previous: RelationshipSetting,
  ) {
    setRow(targetId, { status: 'saving', error: null });
    try {
      const res = await fetch('/api/users/relationship-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, granularityMode, identityMode }),
      });
      const body = (await res.json().catch(() => null)) as PatchResponse | null;

      if (!res.ok || !body?.success) {
        // Revert to previous values on error.
        setSettings((prev) =>
          prev.map((s) => (s.targetId === targetId ? previous : s)),
        );
        setRow(targetId, {
          status: 'error',
          error: body?.error ?? 'Could not save — please try again.',
        });
        return;
      }

      setRow(targetId, { status: 'saved', error: null });
      window.setTimeout(() => {
        setRowState((prev) => {
          if (prev[targetId]?.status !== 'saved') return prev;
          return { ...prev, [targetId]: { status: 'idle', error: null } };
        });
      }, 2500);
    } catch {
      setSettings((prev) => prev.map((s) => (s.targetId === targetId ? previous : s)));
      setRow(targetId, { status: 'error', error: 'Network error — please try again.' });
    }
  }

  function updateGranularity(targetId: string, value: HeatmapGranularityMode) {
    const current = settings.find((s) => s.targetId === targetId);
    if (!current || current.granularityMode === value) return;
    const previous = current;
    const next: RelationshipSetting = { ...current, granularityMode: value };
    setSettings((prev) => prev.map((s) => (s.targetId === targetId ? next : s)));
    void persist(targetId, value, current.identityMode, previous);
  }

  function updateIdentity(targetId: string, value: HeatmapIdentityMode) {
    const current = settings.find((s) => s.targetId === targetId);
    if (!current || current.identityMode === value) return;
    const previous = current;
    const next: RelationshipSetting = { ...current, identityMode: value };
    setSettings((prev) => prev.map((s) => (s.targetId === targetId ? next : s)));
    void persist(targetId, current.granularityMode, value, previous);
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-gray-500" role="status">
        Loading your Crew…
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {loadError}
      </p>
    );
  }

  if (settings.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">
          Add Crew members to manage who sees your location
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {settings.map((setting) => {
        const row = rowState[setting.targetId] ?? { status: 'idle', error: null };
        return (
          <div
            key={setting.targetId}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center gap-3 mb-4">
              <Avatar name={setting.name} image={setting.image} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900 truncate">
                  {setting.name ?? 'Crew member'}
                </div>
                {setting.crewLabel && (
                  <div className="text-xs text-gray-500 truncate">{setting.crewLabel}</div>
                )}
              </div>
              {row.status === 'saving' && (
                <span className="text-xs text-gray-400" role="status">
                  Saving…
                </span>
              )}
              {row.status === 'saved' && (
                <span className="text-xs text-teal-600" role="status">
                  ✓ Saved
                </span>
              )}
            </div>

            <RadioCardGroup
              legend="How precise?"
              name={`granularity-${setting.targetId}`}
              options={GRANULARITY_OPTIONS}
              value={setting.granularityMode}
              onChange={(v) => updateGranularity(setting.targetId, v)}
            />

            <RadioCardGroup
              legend="With your name?"
              name={`identity-${setting.targetId}`}
              options={IDENTITY_OPTIONS}
              value={setting.identityMode}
              onChange={(v) => updateIdentity(setting.targetId, v)}
            />

            {setting.identityMode === 'ANONYMOUS' && (
              <p className="mt-1 text-xs text-gray-500">{ANONYMOUS_HELPER}</p>
            )}

            {row.status === 'error' && row.error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {row.error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ name, image }: { name: string | null; image: string | null }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
      {image ? (
        <Image
          src={image}
          alt={name ?? 'Crew member'}
          width={40}
          height={40}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}

interface RadioCardGroupProps<T extends string> {
  legend: string;
  name: string;
  options: AxisOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

function RadioCardGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: RadioCardGroupProps<T>) {
  return (
    <fieldset className="mb-4 last:mb-0" role="radiogroup" aria-label={legend}>
      <legend className="mb-2 text-sm font-medium text-gray-700">{legend}</legend>
      <div className="space-y-2">
        {options.map((opt) => {
          const active = opt.value === value;
          const id = `${name}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={id}
              aria-checked={active}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                active
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-200 hover:border-teal-300 bg-white'
              }`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={opt.value}
                checked={active}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 accent-teal-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.hint}</div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
