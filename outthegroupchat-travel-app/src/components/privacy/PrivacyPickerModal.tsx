'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, MapPin, User as UserIcon } from 'lucide-react';
import {
  HeatmapGranularityMode,
  HeatmapIdentityMode,
  HeatmapSocialScope,
} from '@prisma/client';
import { ANONYMOUS_FLOOR } from '@/lib/heatmap/anonymous-floor';

export interface PrivacyChoice {
  socialScope: HeatmapSocialScope;
  granularity: HeatmapGranularityMode;
  identityMode: HeatmapIdentityMode;
}

const DEFAULTS: PrivacyChoice = {
  socialScope: 'NOBODY',
  granularity: 'BLOCK',
  identityMode: 'KNOWN',
};

interface PrivacyPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (choice: PrivacyChoice) => void | Promise<void>;
  /** Disable the confirm button while a parent is processing the commit. */
  submitting?: boolean;
  /**
   * Venue the contribution would be written against. Preferred identifier for
   * resolving the target heatmap cell. Optional: when neither `venueId` nor
   * `cityArea` is supplied the picker cannot verify the R14 floor and fails
   * safe by keeping "Anonymous" disabled.
   */
  venueId?: string | null;
  /** Neighborhood slug fallback used when no venue is bound. */
  cityArea?: string | null;
  /** Which contribution surface this commit feeds. Defaults to `'interest'`. */
  contributionType?: 'interest' | 'presence';
}

interface AxisOption<T extends string> {
  value: T;
  label: string;
  hint: string;
  /** When true the option cannot be selected (see `disabledReason`). */
  disabled?: boolean;
  /** User-facing explanation rendered in place of `hint` when disabled. */
  disabledReason?: string;
}

/**
 * Outcome of the R14 anonymity probe. `unknown` covers both "still loading" and
 * "no cell identifiers were supplied"; `error` covers a failed request. All
 * three non-`ok` states keep Anonymous disabled — the picker never promises
 * anonymity it cannot verify.
 */
type FloorStatus = 'loading' | 'ok' | 'below' | 'unknown' | 'error';

interface FloorState {
  status: FloorStatus;
  floor: number;
}

const SCOPE_OPTIONS: AxisOption<HeatmapSocialScope>[] = [
  { value: 'NOBODY', label: 'Nobody', hint: 'Default — no one sees this on the map.' },
  { value: 'SUBGROUP_ONLY', label: 'SubCrew', hint: 'Only people in this SubCrew see it.' },
  { value: 'FULL_CREW', label: 'Full Crew', hint: 'Everyone in your Crew sees it.' },
];

const GRANULARITY_OPTIONS: AxisOption<HeatmapGranularityMode>[] = [
  { value: 'HIDDEN', label: 'Hidden', hint: 'No location data written.' },
  { value: 'BLOCK', label: 'Block', hint: 'Default — snapped to ~110m grid.' },
  { value: 'DYNAMIC_CELL', label: 'Precise', hint: 'Snapped to ~11m grid.' },
];

const IDENTITY_OPTIONS: AxisOption<HeatmapIdentityMode>[] = [
  { value: 'KNOWN', label: 'With name', hint: 'Default for Crew (R20).' },
  {
    value: 'ANONYMOUS',
    label: 'Anonymous',
    hint: `No name — this spot already has at least ${ANONYMOUS_FLOOR} anonymous people, so you blend in.`,
  },
  { value: 'CREW_ANCHORED', label: 'Friend of…', hint: 'For FoF tier (Phase 4).' },
];

/** Shape of `GET /api/heatmap/contributor-count`. */
interface ContributorCountResponse {
  success?: boolean;
  data?: {
    count?: number;
    floor?: number;
    meetsFloor?: boolean;
    cellResolved?: boolean;
  };
}

function disabledReasonFor(state: FloorState): string | undefined {
  switch (state.status) {
    case 'ok':
      return undefined;
    case 'below':
      return `Not enough people here yet — anonymous spots need at least ${state.floor} contributors before they show on the map, so this would be hidden entirely.`;
    case 'loading':
      return 'Checking whether anonymity would hold here…';
    case 'error':
      return `Couldn't check the ${state.floor}-contributor anonymity floor right now, so anonymous is unavailable.`;
    default:
      return `Anonymity can't be verified for this spot, so it's unavailable. Anonymous needs at least ${state.floor} contributors in the same area.`;
  }
}

export function PrivacyPickerModal({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
  venueId = null,
  cityArea = null,
  contributionType = 'interest',
}: PrivacyPickerModalProps) {
  const [choice, setChoice] = useState<PrivacyChoice>(DEFAULTS);
  const [floorState, setFloorState] = useState<FloorState>({
    status: 'unknown',
    floor: ANONYMOUS_FLOOR,
  });

  // Probe the R14 floor for the cell this commit would land in. The cell
  // depends on the chosen granularity, so re-probe whenever it changes.
  // HIDDEN writes no contribution at all, so there is nothing to check.
  useEffect(() => {
    if (!isOpen) return;
    if (!venueId && !cityArea) {
      setFloorState({ status: 'unknown', floor: ANONYMOUS_FLOOR });
      return;
    }
    if (choice.granularity === 'HIDDEN') {
      setFloorState({ status: 'unknown', floor: ANONYMOUS_FLOOR });
      return;
    }

    let cancelled = false;
    setFloorState({ status: 'loading', floor: ANONYMOUS_FLOOR });

    const params = new URLSearchParams({
      type: contributionType,
      granularity: choice.granularity,
    });
    if (venueId) params.set('venueId', venueId);
    if (cityArea) params.set('cityArea', cityArea);

    (async () => {
      try {
        const res = await fetch(`/api/heatmap/contributor-count?${params.toString()}`);
        const body: ContributorCountResponse = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setFloorState({ status: 'error', floor: ANONYMOUS_FLOOR });
          return;
        }
        const floor = body.data.floor ?? ANONYMOUS_FLOOR;
        if (body.data.cellResolved === false) {
          setFloorState({ status: 'unknown', floor });
          return;
        }
        setFloorState({ status: body.data.meetsFloor === true ? 'ok' : 'below', floor });
      } catch {
        if (!cancelled) setFloorState({ status: 'error', floor: ANONYMOUS_FLOOR });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, venueId, cityArea, contributionType, choice.granularity]);

  const anonymousDisabled = floorState.status !== 'ok';
  const anonymousDisabledReason = disabledReasonFor(floorState);

  const identityOptions = useMemo<AxisOption<HeatmapIdentityMode>[]>(
    () =>
      IDENTITY_OPTIONS.map((opt) =>
        opt.value === 'ANONYMOUS'
          ? {
              ...opt,
              disabled: anonymousDisabled,
              disabledReason: anonymousDisabledReason,
            }
          : opt,
      ),
    [anonymousDisabled, anonymousDisabledReason],
  );

  // Fail safe: if Anonymous was selected and then became unavailable, drop back
  // to the default identity mode rather than committing an unhonored choice.
  useEffect(() => {
    if (!anonymousDisabled) return;
    setChoice((prev) =>
      prev.identityMode === 'ANONYMOUS'
        ? { ...prev, identityMode: DEFAULTS.identityMode }
        : prev,
    );
  }, [anonymousDisabled]);

  const set = <K extends keyof PrivacyChoice>(key: K, value: PrivacyChoice[K]) =>
    setChoice((prev) => ({ ...prev, [key]: value }));

  const handleConfirm = () => {
    void onConfirm(choice);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) onClose();
          }}
          data-testid="privacy-picker-modal"
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="w-full max-w-md rounded-2xl border border-otg-border bg-otg-surface p-6 shadow-2xl"
          >
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-otg-text-bright">Commit privacy</h2>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-full p-1 text-otg-text-muted hover:bg-otg-bg hover:text-otg-text-bright disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <p className="mb-5 text-xs text-otg-text-muted">
              Default is the safest setting. You can change these per Crew member later in
              Settings → Privacy.
            </p>

            <Axis
              testId="axis-scope"
              icon={<Eye className="h-4 w-4" aria-hidden="true" />}
              label="Who can see this on the map?"
              options={SCOPE_OPTIONS}
              value={choice.socialScope}
              onChange={(v) => set('socialScope', v)}
            />

            <Axis
              testId="axis-granularity"
              icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
              label="How precise?"
              options={GRANULARITY_OPTIONS}
              value={choice.granularity}
              onChange={(v) => set('granularity', v)}
            />

            <Axis
              testId="axis-identity"
              icon={<UserIcon className="h-4 w-4" aria-hidden="true" />}
              label="With your name?"
              options={identityOptions}
              value={choice.identityMode}
              onChange={(v) => set('identityMode', v)}
            />

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-full border border-otg-border px-4 py-2 text-sm font-medium text-otg-text-bright transition hover:bg-otg-bg/40 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="flex-1 rounded-full bg-otg-sodium px-4 py-2 text-sm font-semibold text-otg-bg transition hover:bg-otg-sodium/90 disabled:opacity-60"
              >
                {submitting ? 'Committing…' : 'Commit'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface AxisProps<T extends string> {
  testId: string;
  icon: React.ReactNode;
  label: string;
  options: AxisOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

function Axis<T extends string>({ testId, icon, label, options, value, onChange }: AxisProps<T>) {
  return (
    <fieldset className="mb-4" data-testid={testId}>
      <legend className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-otg-text-bright">
        {icon}
        {label}
      </legend>
      <div className="space-y-1.5">
        {options.map((opt) => {
          const active = opt.value === value;
          const disabled = opt.disabled === true;
          const explanation = disabled ? opt.disabledReason ?? opt.hint : opt.hint;
          const hintId = `${testId}-${opt.value}-hint`;
          return (
            <label
              key={opt.value}
              title={disabled ? explanation : undefined}
              className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                disabled
                  ? 'cursor-not-allowed border-otg-border bg-otg-bg/20 opacity-60'
                  : active
                    ? 'cursor-pointer border-otg-sodium bg-otg-sodium/10'
                    : 'cursor-pointer border-otg-border bg-otg-bg/40 hover:border-otg-sodium/40'
              }`}
            >
              <input
                type="radio"
                name={testId}
                value={opt.value}
                checked={active}
                disabled={disabled}
                aria-describedby={hintId}
                onChange={() => onChange(opt.value)}
                className="mt-0.5 disabled:cursor-not-allowed"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-otg-text-bright">{opt.label}</div>
                <div
                  id={hintId}
                  className="text-xs text-otg-text-muted"
                  data-testid={disabled ? `${testId}-${opt.value}-disabled-reason` : undefined}
                >
                  {explanation}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
