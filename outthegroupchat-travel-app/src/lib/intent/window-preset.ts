/**
 * @module intent/window-preset
 * @description WindowPreset → wall-clock range mapping (R3) and expiresAt helper (R12).
 *
 * The classifier and Intent capture form work in two layers:
 *   1. The user picks a `WindowPreset` (EVENING, NIGHT, …) plus a `dayOffset` (0..7).
 *   2. The server computes a concrete `[startAt, endAt]` window in the server's
 *      local time, then tacks on a 2-hour grace buffer to derive `expiresAt`.
 *
 * The user can override `startAt` / `endAt` with an explicit ISO datetime
 * (carrying its own timezone offset). This is the recommended path for any
 * client that knows the user's local timezone — the preset-based default below
 * assumes server time and is only a sensible fallback.
 *
 * Hour ranges below are 24h local-clock intervals. NIGHT crosses midnight
 * (21:00 → 02:00 next day) and is handled explicitly.
 */

import { WindowPreset } from '@prisma/client';

interface WindowRangeHours {
  /** Inclusive start hour, 0..23. */
  startHour: number;
  /** Exclusive end hour, may be > 24 to denote crossing midnight. */
  endHour: number;
}

const WINDOW_RANGES: Record<WindowPreset, WindowRangeHours> = {
  EARLY_MORNING: { startHour: 5, endHour: 8 },
  MORNING: { startHour: 8, endHour: 11 },
  BRUNCH: { startHour: 11, endHour: 14 },
  AFTERNOON: { startHour: 12, endHour: 17 },
  EVENING: { startHour: 17, endHour: 21 },
  NIGHT: { startHour: 21, endHour: 26 }, // 26 = 02:00 next day
};

/** Buffer applied past the window's end before the Intent expires (R12). */
export const EXPIRY_BUFFER_HOURS = 2;

/** Maximum allowed `dayOffset` (R3). */
export const MAX_DAY_OFFSET = 7;

export interface WindowRange {
  startAt: Date;
  endAt: Date;
}

/**
 * Compute the concrete [startAt, endAt] for a (preset, dayOffset) pair, using
 * `now`'s date as day-zero. Works in the server's local timezone — clients that
 * need user-local correctness should pass explicit overrides on the Intent.
 *
 * @param preset One of the curated WindowPreset values.
 * @param dayOffset Number of days from `now` (0 = today, 7 = a week out). Clamped
 *                  by the route layer; passed through here unchanged.
 * @param now Reference instant; defaults to current time. Tests pass a fixed Date.
 */
export function computeWindowRange(
  preset: WindowPreset,
  dayOffset: number,
  now: Date = new Date(),
): WindowRange {
  const { startHour, endHour } = WINDOW_RANGES[preset];

  const startAt = new Date(now);
  startAt.setDate(startAt.getDate() + dayOffset);
  startAt.setHours(startHour, 0, 0, 0);

  const endAt = new Date(startAt);
  endAt.setHours(endAt.getHours() + (endHour - startHour));

  return { startAt, endAt };
}

/**
 * Compute `expiresAt` per R12: window end + EXPIRY_BUFFER_HOURS.
 *
 * @param endAt The window's end instant (either computed from a preset or supplied
 *              by the client as an explicit override).
 */
export function computeExpiresAt(endAt: Date): Date {
  const expires = new Date(endAt);
  expires.setHours(expires.getHours() + EXPIRY_BUFFER_HOURS);
  return expires;
}

/**
 * Resolve the final (startAt, endAt, expiresAt) for an Intent, preferring
 * client-supplied overrides when present and falling back to the preset
 * default otherwise. Throws if `endAt` precedes `startAt` after resolution.
 */
export function resolveIntentWindow(args: {
  preset: WindowPreset;
  dayOffset: number;
  startAtOverride?: Date | null;
  endAtOverride?: Date | null;
  now?: Date;
}): WindowRange & { expiresAt: Date } {
  const { preset, dayOffset, startAtOverride, endAtOverride, now } = args;
  const defaults = computeWindowRange(preset, dayOffset, now);

  const startAt = startAtOverride ?? defaults.startAt;
  const endAt = endAtOverride ?? defaults.endAt;

  if (endAt.getTime() <= startAt.getTime()) {
    throw new Error('Intent window endAt must be after startAt');
  }

  return { startAt, endAt, expiresAt: computeExpiresAt(endAt) };
}
