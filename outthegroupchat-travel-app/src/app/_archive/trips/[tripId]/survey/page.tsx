'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QuestionRenderer } from '@/components/surveys';
import { SurveyBuilder } from '@/components/surveys/SurveyBuilder';
import type { SurveyQuestion, SurveyAnswers } from '@/types';

interface TripInfo {
  ownerId: string;
  members?: { userId: string; role: string }[];
}

export default function SurveyPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const tripId = params.tripId as string;

  const [survey, setSurvey] = useState<{
    id: string;
    title: string;
    questions: SurveyQuestion[];
  } | null>(null);
  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const userId = session?.user?.id;
  const isOwnerOrAdmin = tripInfo
    ? tripInfo.ownerId === userId ||
      tripInfo.members?.some(
        (m) => m.userId === userId && (m.role === 'OWNER' || m.role === 'ADMIN')
      )
    : false;

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch survey and trip info in parallel
        const [surveyRes, tripRes] = await Promise.all([
          fetch(`/api/trips/${tripId}/survey`),
          fetch(`/api/trips/${tripId}`),
        ]);

        if (tripRes.ok) {
          const tripData = await tripRes.json();
          if (tripData.data) {
            setTripInfo({
              ownerId: tripData.data.ownerId,
              members: tripData.data.members?.map((m: { userId: string; role: string }) => ({
                userId: m.userId,
                role: m.role,
              })),
            });
          }
        }

        if (surveyRes.ok) {
          const data = await surveyRes.json();
          if (data.data) {
            setSurvey({
              id: data.data.id,
              title: data.data.title,
              questions: data.data.questions as SurveyQuestion[],
            });
          }
        }
      } catch {
        setError('Failed to load survey');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [tripId]);

  const currentQ = survey?.questions[currentQuestion];
  const progress = survey ? ((currentQuestion + 1) / survey.questions.length) * 100 : 0;

  const handleAnswer = (value: unknown) => {
    if (currentQ) {
      setAnswers((prev) => ({
        ...prev,
        [currentQ.id]: value as string | string[] | number | number[] | { start: string; end: string },
      }));
    }
  };

  const nextQuestion = () => {
    if (survey && currentQuestion < survey.questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!survey) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/survey`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (!res.ok) throw new Error('Failed to submit survey');

      router.push(`/trips/${tripId}?survey=completed`);
    } catch {
      setError('Failed to submit survey. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSurvey = async (questions: SurveyQuestion[], title: string) => {
    try {
      const res = await fetch(`/api/trips/${tripId}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, questions }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create survey');
      }

      const data = await res.json();
      setSurvey({
        id: data.data.id,
        title: data.data.title,
        questions: data.data.questions as SurveyQuestion[],
      });
      setShowBuilder(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create survey');
    }
  };

  const handleUseTemplate = async () => {
    setIsLoadingTemplate(true);
    try {
      // The API supports creating with the standard template via POST
      const res = await fetch(`/api/trips/${tripId}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Trip Planning Survey',
          questions: [
            { id: 'availability', type: 'multiple_choice', question: 'When are you available for the trip?', required: true, options: ['Late June', 'Early July', 'Late July', 'Early August', 'Late August'] },
            { id: 'duration', type: 'ranking', question: 'Rank your preferred trip duration', required: true, options: ['Weekend (2 Days)', '3-4 Days', '5-7 Days'] },
            { id: 'trip_budget', type: 'budget', question: "What's your budget for this trip (excluding flights)?", required: true, min: 300, max: 2000, step: 100 },
            { id: 'accommodation_type', type: 'single_choice', question: 'What type of accommodation do you prefer?', required: true, options: ['Cool Shared House/Airbnb', 'Cheapest Shared House', 'Depends on trip/location'] },
            { id: 'room_sharing', type: 'single_choice', question: 'Room sharing preference?', required: false, options: ['Private room', '2 to a room', "Don't care - cheapest option"] },
            { id: 'activity_preferences', type: 'ranking', question: 'Rank activities by your preference', required: true, options: ['Beach/Pool', 'Nightlife/Bars', 'Outdoor Adventure', 'Food & Dining', 'Cultural/Sightseeing', 'Sports/Games'] },
            { id: 'dining_preferences', type: 'multiple_choice', question: 'Which dining experiences interest you?', required: false, options: ['High-end restaurant', 'Sports bars', 'Local BBQ/street food', 'Group cooking session', 'Food tour'] },
            { id: 'departure_city', type: 'text', question: "Where are you flying out of?", required: true },
          ],
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create survey');
      }

      const data = await res.json();
      setSurvey({
        id: data.data.id,
        title: data.data.title,
        questions: data.data.questions as SurveyQuestion[],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create survey from template');
    } finally {
      setIsLoadingTemplate(false);
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
            onClick={() => { setError(null); router.back(); }}
            className="mt-4 text-primary font-medium hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  // No survey exists — show creation options for owners, or "no survey" for members
  if (!survey) {
    if (showBuilder) {
      return (
        <SurveyBuilder
          tripId={tripId}
          onSave={handleSaveSurvey}
          onCancel={() => setShowBuilder(false)}
        />
      );
    }

    if (isOwnerOrAdmin) {
      return (
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Create a Survey
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Gather preferences from your trip members to plan the perfect trip.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleUseTemplate}
                disabled={isLoadingTemplate}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {isLoadingTemplate ? 'Creating...' : 'Use Template'}
              </button>
              <button
                onClick={() => setShowBuilder(true)}
                className="px-6 py-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Build Custom Survey
              </button>
            </div>

            <button
              onClick={() => router.back()}
              className="mt-6 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Back to trip
            </button>
          </div>
        </div>
      );
    }

    // Non-owner: no survey yet
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-semibold text-yellow-700 mb-2">No Survey Yet</h2>
          <p className="text-yellow-600">The trip organizer hasn&apos;t created a survey yet. Check back later!</p>
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

  // Survey exists — show survey-taking UI
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
