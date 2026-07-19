'use client';

// Explicit React import so the classic JSX runtime (React.createElement)
// resolves under vitest/esbuild, which does not inject the automatic runtime
// the way the Next.js build does. Harmless under Next 14's own compiler.
import React from 'react';
import { Users, ArrowRight } from 'lucide-react';
import { CREW_PATH } from './onboardingFlow';

interface OnboardingCrewStepProps {
  /** Advance without visiting the Crew page. */
  onSkip: () => void;
}

/**
 * Day-7 step 2 — "Find your Crew".
 *
 * There is no user-search endpoint, so this step stays lightweight: it explains
 * what a Crew is and deep-links to `/crew` (same tab) where the user can add
 * people, plus a "Skip for now" that advances the flow. Presentational only —
 * navigation to `/crew` is a plain anchor so it is SSR/render-test safe.
 */
export function OnboardingCrewStep({ onSkip }: OnboardingCrewStepProps) {
  return (
    <div data-testid="onboarding-crew-step" className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-otg-sodium/15 text-otg-sodium">
        <Users className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mb-2 font-display text-2xl font-bold tracking-tight text-otg-text-bright">
        Bring your Crew
      </h2>
      <p className="mx-auto mb-6 max-w-sm text-sm text-otg-text-dim">
        Your Crew is the people you actually want to see IRL. Add a few now so
        that when you and a friend are up for the same thing, we can group you up.
      </p>

      <div className="flex flex-col gap-3">
        <a href={CREW_PATH} className="btn btn-primary w-full">
          Add Crew
          <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-otg-text-dim transition-colors hover:text-otg-text-bright"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

export default OnboardingCrewStep;
