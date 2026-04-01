'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { WelcomeScreen } from '@/components/onboarding/WelcomeScreen';
import { InterestSelector } from '@/components/onboarding/InterestSelector';
import { TravelStyleQuiz } from '@/components/onboarding/TravelStyleQuiz';

type OnboardingStep = 1 | 2 | 3;

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState<string>('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const handleGetStarted = () => {
    setCurrentStep(2);
  };

  const handleInterestsComplete = (interests: string[]) => {
    setSelectedInterests(interests);
    setCurrentStep(3);
  };

  const handleTravelStyleComplete = (style: string) => {
    setTravelStyle(style);
    router.push('/');
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as OnboardingStep);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  const userName = session?.user?.name ?? undefined;
  const totalSteps = 3;

  return (
    <div className="relative">
      {/* Progress indicator */}
      {currentStep > 1 && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-center gap-3 shadow-sm">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Step {currentStep} of {totalSteps}
          </span>
          <div className="flex gap-1.5">
            {([1, 2, 3] as OnboardingStep[]).map((step) => (
              <div
                key={step}
                className={`h-2 rounded-full transition-all ${
                  step <= currentStep
                    ? 'w-8 bg-emerald-500'
                    : 'w-2 bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step content */}
      <div className={currentStep > 1 ? 'pt-14' : ''}>
        {currentStep === 1 && (
          <WelcomeScreen
            userName={userName}
            onGetStarted={handleGetStarted}
          />
        )}

        {currentStep === 2 && (
          <InterestSelector
            onComplete={handleInterestsComplete}
            onBack={handleBack}
          />
        )}

        {currentStep === 3 && (
          <TravelStyleQuiz
            onComplete={handleTravelStyleComplete}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}
