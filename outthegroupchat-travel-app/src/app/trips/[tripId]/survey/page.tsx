'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QuestionRenderer } from '@/components/surveys';
import type { SurveyQuestion, SurveyAnswers } from '@/types';

export default function SurveyPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.tripId as string;

  const [survey, setSurvey] = useState<{
    id: string;
    title: string;
    questions: SurveyQuestion[];
  } | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSurvey() {
      try {
        const res = await fetch(`/api/trips/${tripId}/survey`);
        if (!res.ok) throw new Error('Failed to fetch survey');
        const data = await res.json();
        if (data.data) {
          setSurvey({
            id: data.data.id,
            title: data.data.title,
            questions: data.data.questions as SurveyQuestion[],
          });
        } else {
          setError('No survey found for this trip');
        }
      } catch (err) {
        setError('Failed to load survey');
      } finally {
        setIsLoading(false);
      }
    }
    fetchSurvey();
  }, [tripId]);

  const currentQ = survey?.questions[currentQuestion];
  const progress = survey ? ((currentQuestion + 1) / survey.questions.length) * 100 : 0;

  const handleAnswer = (value: unknown) => {
    if (currentQ) {
      setAnswers(prev => ({
        ...prev,
        [currentQ.id]: value as string | string[] | number | number[] | { start: string; end: string },
      }));
    }
  };

  const nextQuestion = () => {
    if (survey && currentQuestion < survey.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!survey) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: survey.id, answers }),
      });
      
      if (!res.ok) throw new Error('Failed to submit survey');
      
      router.push(`/trips/${tripId}?survey=completed`);
    } catch (err) {
      setError('Failed to submit survey. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="animate-pulse space-y-4">
          <div className="h-2 bg-gray-200 rounded" />
          <div className="h-8 bg-gray-200 rounded w-3/4 mx-auto" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-semibold text-red-700 mb-2">Error</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-primary font-medium hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-semibold text-yellow-700 mb-2">No Survey</h2>
          <p className="text-yellow-600">There's no survey for this trip yet.</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-primary font-medium hover:underline"
          >
            Go back to trip
          </button>
        </div>
      </div>
    );
  }

  const isLastQuestion = currentQuestion === survey.questions.length - 1;
  const canProceed = !currentQ?.required || answers[currentQ.id] !== undefined;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">
            Question {currentQuestion + 1} of {survey.questions.length}
          </span>
          <span className="text-sm font-medium text-primary">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Survey title */}
      <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">{survey.title}</h1>

      {/* Question card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentQ && (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {currentQ.question}
                    {currentQ.required && <span className="text-red-500 ml-1">*</span>}
                  </h2>
                  {currentQ.description && (
                    <p className="text-gray-500">{currentQ.description}</p>
                  )}
                </div>

                <QuestionRenderer
                  question={currentQ}
                  value={answers[currentQ.id]}
                  onChange={handleAnswer}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={prevQuestion}
          disabled={currentQuestion === 0}
          className="flex-1 px-6 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {isLastQuestion ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canProceed || isSubmitting}
            className="flex-1 px-6 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Survey'}
          </button>
        ) : (
          <button
            type="button"
            onClick={nextQuestion}
            disabled={!canProceed}
            className="flex-1 px-6 py-3 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

