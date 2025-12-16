'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { DestinationStep } from './steps/DestinationStep';
import { DateStep } from './steps/DateStep';
import { BudgetStep } from './steps/BudgetStep';
import { MembersStep } from './steps/MembersStep';
import type { Destination, TripBudget } from '@/types';

// Wizard step data interface
export interface WizardData {
  destination: Destination | null;
  startDate: Date | null;
  endDate: Date | null;
  budget: TripBudget | null;
  title: string;
  description: string;
  memberEmails: string[];
  isPublic: boolean;
}

export interface StepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const steps: WizardStep[] = [
  {
    id: 'destination',
    title: 'Where to?',
    description: 'Choose your destination',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'dates',
    title: 'When?',
    description: 'Select your travel dates',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'budget',
    title: 'Budget',
    description: 'Set your trip budget',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'members',
    title: 'Invite Friends',
    description: 'Add trip members',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

const initialData: WizardData = {
  destination: null,
  startDate: null,
  endDate: null,
  budget: null,
  title: '',
  description: '',
  memberEmails: [],
  isPublic: false,
};

export default function TripWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = useCallback((updates: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSubmit = async () => {
    if (!data.destination || !data.startDate || !data.endDate) {
      setError('Please complete all required fields');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title || `Trip to ${data.destination.city}`,
          description: data.description,
          destination: data.destination,
          startDate: data.startDate.toISOString(),
          endDate: data.endDate.toISOString(),
          budget: data.budget,
          isPublic: data.isPublic,
          memberEmails: data.memberEmails,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create trip');
      }

      const trip = await response.json();
      router.push(`/trips/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepProps: StepProps = {
    data,
    onUpdate: handleUpdate,
    onNext: handleNext,
    onBack: handleBack,
    isFirstStep: currentStep === 0,
    isLastStep: currentStep === steps.length - 1,
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <DestinationStep {...stepProps} />;
      case 1:
        return <DateStep {...stepProps} />;
      case 2:
        return <BudgetStep {...stepProps} />;
      case 3:
        return <MembersStep {...stepProps} onSubmit={handleSubmit} isSubmitting={isSubmitting} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Plan Your Trip
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Let&apos;s create an unforgettable adventure together
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            {/* Progress Line */}
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200 dark:bg-slate-700 -translate-y-1/2" />
            <div
              className="absolute left-0 top-1/2 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 -translate-y-1/2 transition-all duration-500"
              style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
            />

            {/* Step Indicators */}
            {steps.map((step, index) => (
              <div key={step.id} className="relative z-10 flex flex-col items-center">
                <motion.div
                  initial={false}
                  animate={{
                    scale: currentStep === index ? 1.1 : 1,
                    backgroundColor: index <= currentStep ? '#10b981' : '#e2e8f0',
                  }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    index <= currentStep
                      ? 'text-white shadow-lg shadow-emerald-500/30'
                      : 'text-slate-400 bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  {index < currentStep ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.icon
                  )}
                </motion.div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    index <= currentStep
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
          initial={false}
        >
          {/* Step Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4">
            <h2 className="text-xl font-semibold text-white">{steps[currentStep].title}</h2>
            <p className="text-emerald-100 text-sm">{steps[currentStep].description}</p>
          </div>

          {/* Step Body */}
          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Skip/Cancel */}
        <div className="mt-4 text-center">
          <button
            onClick={() => router.push('/trips')}
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors"
          >
            Cancel and return to trips
          </button>
        </div>
      </div>
    </div>
  );
}
