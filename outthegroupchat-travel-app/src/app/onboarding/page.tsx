'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import {
  InterestSelector,
  OnboardingCrewStep,
  OnboardingIntentStep,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_LABELS,
  ONBOARDING_DONE_PATH,
  canAdvanceFromTopics,
  fetchOnboardingStatus,
  finishOnboarding,
} from '@/components/onboarding';

/**
 * `/onboarding` — Day-7 first-run flow.
 *
 * Three steps: pick Topics → find Crew → signal a first Intent. Completion is
 * marked via `POST /api/users/onboarding` (fire-and-forget-safe) and the user
 * always lands on `/intents`. If the user is already onboarded we replace to
 * `/intents` on mount so the flow is only ever seen once.
 */
export default function OnboardingPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);

  const stepKey = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  // Only show the flow once: bounce already-onboarded users to /intents.
  useEffect(() => {
    let cancelled = false;
    fetchOnboardingStatus().then((onboarded) => {
      if (cancelled) return;
      if (onboarded) {
        router.replace(ONBOARDING_DONE_PATH);
        return;
      }
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const toggleTopic = (topicId: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  };

  // Mark the flow complete then land on /intents. Failure never blocks nav.
  const complete = async () => {
    if (finishing) return;
    setFinishing(true);
    await finishOnboarding((path) => router.push(path));
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const goNext = () => {
    if (stepKey === 'topics' && !canAdvanceFromTopics(selectedTopics)) return;
    if (isLastStep) {
      void complete();
      return;
    }
    setStepIndex((i) => Math.min(ONBOARDING_STEPS.length - 1, i + 1));
  };

  // `crew` and `intent` steps own their own skip/finish affordances; the shared
  // footer "Continue" only drives the topics step + last-step completion.
  const showFooterContinue = stepKey === 'topics';
  const topicsBlocked = stepKey === 'topics' && !canAdvanceFromTopics(selectedTopics);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-otg-bg-dark">
        <div className="card w-full max-w-lg space-y-4 p-8">
          <div className="skeleton mx-auto h-8 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-otg-bg-dark px-4 py-10 text-otg-text-bright sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        {/* Step indicator */}
        <div className="mb-8" data-testid="onboarding-progress">
          <div className="flex items-center justify-center gap-2">
            {ONBOARDING_STEPS.map((key, idx) => {
              const done = idx < stepIndex;
              const active = idx === stepIndex;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition ${
                      active
                        ? 'border-otg-sodium bg-otg-sodium/15 text-otg-sodium'
                        : done
                          ? 'border-otg-sodium bg-otg-sodium text-otg-bg'
                          : 'border-otg-border bg-otg-bg text-otg-text-dim'
                    }`}
                    aria-current={active ? 'step' : undefined}
                  >
                    {done ? <Check className="h-4 w-4" aria-hidden="true" /> : idx + 1}
                  </div>
                  {idx < ONBOARDING_STEPS.length - 1 && (
                    <div
                      className={`h-px w-8 ${idx < stepIndex ? 'bg-otg-sodium' : 'bg-otg-border'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-sm font-medium text-otg-text-dim">
            Step {stepIndex + 1} of {ONBOARDING_STEPS.length} · {ONBOARDING_STEP_LABELS[stepKey]}
          </p>
        </div>

        {/* Step body */}
        <div className="card p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={stepKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {stepKey === 'topics' && (
                <>
                  <div className="mb-5 text-center">
                    <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-otg-text-bright">
                      What are you into?
                    </h1>
                    <p className="mx-auto max-w-sm text-sm text-otg-text-dim">
                      Pick the things you’d actually leave the house for. We use
                      these to match you with your Crew.
                    </p>
                  </div>
                  <InterestSelector selected={selectedTopics} onToggle={toggleTopic} />
                </>
              )}

              {stepKey === 'crew' && <OnboardingCrewStep onSkip={goNext} />}

              {stepKey === 'intent' && <OnboardingIntentStep onSkip={() => void complete()} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer controls */}
        <div className="mt-6 flex items-center justify-between">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm font-medium text-otg-text-dim transition-colors hover:text-otg-text-bright"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          ) : (
            <span />
          )}

          {showFooterContinue && (
            <button
              type="button"
              onClick={goNext}
              disabled={topicsBlocked}
              className="btn btn-primary"
            >
              Continue
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
