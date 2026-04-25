'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, MapPin, User as UserIcon } from 'lucide-react';
import {
  HeatmapGranularityMode,
  HeatmapIdentityMode,
  HeatmapSocialScope,
} from '@prisma/client';

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
}

interface AxisOption<T extends string> {
  value: T;
  label: string;
  hint: string;
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
  { value: 'ANONYMOUS', label: 'Anonymous', hint: 'No name; subject to N≥3 floor.' },
  { value: 'CREW_ANCHORED', label: 'Friend of…', hint: 'For FoF tier (Phase 4).' },
];

export function PrivacyPickerModal({
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
}: PrivacyPickerModalProps) {
  const [choice, setChoice] = useState<PrivacyChoice>(DEFAULTS);

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
              options={IDENTITY_OPTIONS}
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
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                active
                  ? 'border-otg-sodium bg-otg-sodium/10'
                  : 'border-otg-border bg-otg-bg/40 hover:border-otg-sodium/40'
              }`}
            >
              <input
                type="radio"
                name={testId}
                value={opt.value}
                checked={active}
                onChange={() => onChange(opt.value)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-otg-text-bright">{opt.label}</div>
                <div className="text-xs text-otg-text-muted">{opt.hint}</div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
