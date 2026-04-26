'use client';

/**
 * @module components/heatmap/MutualThresholdSlider
 * @description V1 Phase 4b — discrete mutual-Crew threshold slider for the
 * FoF heatmap layer (R5). Five steps: a viewer can ask to see only FoF
 * users with whom they share at least N mutual Crew members.
 *
 * Persisted to localStorage so the user's tightness preference survives a
 * tab reload.
 */

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

const STORAGE_KEY = 'otg.heatmap.fof.mutualThreshold';
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 5;

interface MutualThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function MutualThresholdSlider({ value, onChange, disabled }: MutualThresholdSliderProps) {
  return (
    <label
      className={
        'flex items-center gap-2 text-sm ' +
        (disabled ? 'opacity-60 cursor-not-allowed' : 'text-otg-text-bright')
      }
    >
      <Users className="w-4 h-4 text-otg-sodium" />
      <span className="whitespace-nowrap">≥{value} mutual</span>
      <input
        type="range"
        min={MIN_THRESHOLD}
        max={MAX_THRESHOLD}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Minimum mutual Crew members for FoF visibility"
        className="accent-otg-sodium w-24"
      />
    </label>
  );
}

/** Hook helper — initializes from localStorage and persists changes. */
export function useMutualThreshold(initial = 1): [number, (n: number) => void] {
  const [value, setValue] = useState<number>(initial);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = Number.parseInt(stored, 10);
        if (Number.isFinite(parsed) && parsed >= MIN_THRESHOLD && parsed <= MAX_THRESHOLD) {
          setValue(parsed);
        }
      }
    } catch {
      // ignore — localStorage may be unavailable in private mode
    }
  }, []);

  const update = (next: number) => {
    setValue(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore storage errors
    }
  };

  return [value, update];
}
