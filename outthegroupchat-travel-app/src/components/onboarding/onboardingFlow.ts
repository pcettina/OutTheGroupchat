/**
 * Day-7 onboarding flow — pure, framework-free logic.
 *
 * Everything here is deliberately DOM-free so it can be unit-tested under the
 * repo's `node` Vitest environment (no jsdom / @testing-library). The React
 * step components and the `/onboarding` page import these helpers; the tests
 * exercise them directly with a mocked `fetch` + a mock `navigate` callback.
 */

/** A selectable Topic, as returned by `GET /api/topics`. */
export interface OnboardingTopic {
  id: string;
  slug: string;
  displayName: string;
}

/** Where the flow lands the user once it is finished or skipped. */
export const ONBOARDING_DONE_PATH = '/intents';

/** Deep link for the "find your Crew" step. */
export const CREW_PATH = '/crew';

/** Ordered step keys for the flow. */
export const ONBOARDING_STEPS = ['topics', 'crew', 'intent'] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

/** Human labels for the step indicator. */
export const ONBOARDING_STEP_LABELS: Record<OnboardingStepKey, string> = {
  topics: 'Interests',
  crew: 'Crew',
  intent: 'First plan',
};

/**
 * Gate for advancing past the Topic-selection step: at least one Topic must be
 * chosen. Kept pure so both the UI and the tests share one source of truth.
 */
export function canAdvanceFromTopics(selected: readonly string[]): boolean {
  return selected.length >= 1;
}

/**
 * Best-effort completion marker. Calls `POST /api/users/onboarding` (owned by a
 * sibling agent) and reports whether it succeeded. Never throws — a failure
 * here must not block navigation.
 */
export async function markOnboardingComplete(): Promise<boolean> {
  try {
    const res = await fetch('/api/users/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Finish (or skip to the end of) the flow: fire the completion marker, then
 * navigate to `/intents`. Navigation ALWAYS happens, even if the marker call
 * fails, so a flaky/absent endpoint can never trap the user in onboarding.
 */
export async function finishOnboarding(navigate: (path: string) => void): Promise<void> {
  await markOnboardingComplete();
  navigate(ONBOARDING_DONE_PATH);
}

/**
 * Read onboarding status via `GET /api/users/onboarding`. Returns whether the
 * user is already onboarded; returns `false` on any failure so the flow simply
 * renders (fail-open) instead of blanking the screen.
 */
export async function fetchOnboardingStatus(): Promise<boolean> {
  try {
    const res = await fetch('/api/users/onboarding');
    if (!res.ok) return false;
    const body = (await res.json()) as { onboarded?: boolean } | null;
    return Boolean(body?.onboarded);
  } catch {
    return false;
  }
}

/**
 * Load the Topic catalogue from `GET /api/topics`. Throws on a non-success
 * envelope so the caller can render an explicit error + retry state.
 */
export async function fetchTopics(): Promise<OnboardingTopic[]> {
  const res = await fetch('/api/topics');
  const body = (await res.json()) as
    | { success?: boolean; data?: { topics?: OnboardingTopic[] } }
    | null;
  if (!body?.success) {
    throw new Error('Could not load Topics.');
  }
  return body.data?.topics ?? [];
}
