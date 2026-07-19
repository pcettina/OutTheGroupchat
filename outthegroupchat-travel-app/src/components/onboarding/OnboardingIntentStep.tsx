'use client';

import { IntentCreateForm } from '@/components/intents/IntentCreateForm';
import { ONBOARDING_DONE_PATH } from './onboardingFlow';

interface OnboardingIntentStepProps {
  /** Skip creating a first Intent and finish the flow (lands on /intents). */
  onSkip: () => void;
}

/**
 * Day-7 step 3 — "What are you up for?".
 *
 * Reuses the shared {@link IntentCreateForm}. On a successful create the form
 * itself routes to `/intents` (via `redirectTo`); the onboarding page marks the
 * flow complete on mount of this final step, so either path lands the user in a
 * finished, onboarded state. A skip option finishes without posting an Intent.
 */
export function OnboardingIntentStep({ onSkip }: OnboardingIntentStepProps) {
  return (
    <div data-testid="onboarding-intent-step">
      <div className="mb-5 text-center">
        <h2 className="mb-2 font-display text-2xl font-bold tracking-tight text-otg-text-bright">
          What are you up for?
        </h2>
        <p className="mx-auto max-w-sm text-sm text-otg-text-dim">
          Signal one thing you’d be down to do. When someone in your Crew is up
          for the same, we’ll group you up.
        </p>
      </div>

      <IntentCreateForm redirectTo={ONBOARDING_DONE_PATH} />

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-otg-text-dim transition-colors hover:text-otg-text-bright"
        >
          Skip → go to my intents
        </button>
      </div>
    </div>
  );
}

export default OnboardingIntentStep;
