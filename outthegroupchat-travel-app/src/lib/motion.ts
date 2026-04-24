/**
 * @module motion
 * @description Motion tokens + haptic helper used across OTG components. Source of truth:
 * `docs/design/DESIGN_BRIEF.md` §6. Timing + easing values are M3-aligned and verified against
 * Apple HIG, Motion for React v11+ docs (motion.dev/docs/react-transitions), and MDN Vibration API.
 *
 * Every new micro-interaction pulls from this file so the whole app stays on one motion vocabulary.
 * Never inline `{ duration, ease }` values in components — import the named token instead.
 */
import type { Transition } from 'framer-motion';

/** Entrances — M3 standard-decelerate. Use for elements appearing into view. */
export const easeOutQuart = [0.25, 1, 0.5, 1] as const;

/** Exits — M3 standard-accelerate. Use for elements leaving view. */
export const easeInQuart = [0.5, 0, 0.75, 0] as const;

/** Two-way — M3 standard. Use for state flips (toggle, selected → unselected). */
export const standard = [0.4, 0, 0.2, 1] as const;

/**
 * Snappy spring — brief §6 default for tap feedback + confirm pulses.
 * Motion v11+ `visualDuration` + `bounce` ergonomic API (overrides `duration`).
 */
export const snappySpring: Transition = {
  type: 'spring',
  visualDuration: 0.28,
  bounce: 0.35,
};

/**
 * Haptic action → pattern map (brief §6).
 *
 * - Android Chrome: plays via `navigator.vibrate()`.
 * - iOS Safari: `navigator.vibrate` does not exist — call is a silent no-op.
 * - Desktop: usually no-op.
 *
 * When a native iOS shell ships, these map to `UIImpactFeedbackGenerator` /
 * `UINotificationFeedbackGenerator`; rename or re-route here.
 */
export type HapticAction =
  | 'button-press'
  | 'rsvp-confirm'
  | 'checkin-success'
  | 'swipe-dismiss'
  | 'validation-error';

const HAPTIC_PATTERNS: Record<HapticAction, number | number[]> = {
  'button-press': 8,
  'rsvp-confirm': [12, 40, 18],
  'checkin-success': [20, 30, 35],
  'swipe-dismiss': 6,
  'validation-error': [60, 40, 60],
};

/**
 * Feature-detected `navigator.vibrate()` wrapper.
 *
 * - Silently no-ops when the API is unavailable (iOS Safari, SSR, older browsers).
 * - Some browsers throw if called outside a user gesture; that throw is swallowed so
 *   UI animations never crash on a haptic attempt.
 * - Callers that also animate should first check `prefers-reduced-motion` separately —
 *   this helper does not gate on that preference because haptics and motion are
 *   independently disabled by users.
 *
 * @param action Named action from the brief's haptic map.
 */
export function triggerHaptic(action: HapticAction): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(HAPTIC_PATTERNS[action]);
  } catch {
    // noop — some browsers reject outside a user gesture
  }
}
