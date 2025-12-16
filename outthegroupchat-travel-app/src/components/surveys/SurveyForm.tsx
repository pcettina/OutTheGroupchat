'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SurveyQuestion, SurveyAnswers } from '@/types';
import { MultipleChoice, RangeSlider, DateRangePicker, RankingQuestion, TextInput } from './QuestionTypes';

interface SurveyFormProps {
  surveyId: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  expiresAt?: string;
  onSubmit: (answers: SurveyAnswers) => Promise<void>;
  onCancel?: () => void;
}

export function SurveyForm({
  surveyId,
  title,
  description,
  questions,
  expiresAt,
  onSubmit,
  onCancel,
}: SurveyFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentStep];
  const isLastQuestion = currentStep === questions.length - 1;
  const progress = ((currentStep + 1) / questions.length) * 100;

  const handleAnswer = useCallback((questionId: string, value: SurveyAnswers[string]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setError(null);
  }, []);

  const validateCurrentQuestion = (): boolean => {
    if (!currentQuestion.required) return true;
    
    const answer = answers[currentQuestion.id];
    if (answer === undefined || answer === null || answer === '') {
      setError('This question is required');
      return false;
    }
    
    if (Array.isArray(answer) && answer.length === 0) {
      setError('Please select at least one option');
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateCurrentQuestion()) return;
    
    if (isLastQuestion) {
      handleSubmit();
    } else {
      setCurrentStep((prev) => prev + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateCurrentQuestion()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(answers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit survey');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (question: SurveyQuestion) => {
    const answer = answers[question.id];

    switch (question.type) {
      case 'single_choice':
        return (
          <MultipleChoice
            question={question}
            value={answer as string}
            onChange={(value) => handleAnswer(question.id, value)}
            singleSelect
          />
        );
      
      case 'multiple_choice':
        return (
          <MultipleChoice
            question={question}
            value={answer as string[]}
            onChange={(value) => handleAnswer(question.id, value)}
          />
        );
      
      case 'ranking':
        return (
          <RankingQuestion
            question={question}
            value={answer as string[]}
            onChange={(value) => handleAnswer(question.id, value)}
          />
        );
      
      case 'scale':
        return (
          <RangeSlider
            question={question}
            value={answer as number}
            onChange={(value) => handleAnswer(question.id, value)}
          />
        );
      
      case 'budget':
        return (
          <RangeSlider
            question={question}
            value={answer as number}
            onChange={(value) => handleAnswer(question.id, value)}
            isCurrency
          />
        );
      
      case 'date_range':
        return (
          <DateRangePicker
            question={question}
            value={answer as { start: string; end: string }}
            onChange={(value) => handleAnswer(question.id, value)}
          />
        );
      
      case 'text':
        return (
          <TextInput
            question={question}
            value={answer as string}
            onChange={(value) => handleAnswer(question.id, value)}
          />
        );
      
      default:
        return <p className="text-slate-500">Unknown question type</p>;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {title}
        </h1>
        {description && (
          <p className="text-slate-600 dark:text-slate-400">{description}</p>
        )}
        {expiresAt && (
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
            Closes: {new Date(expiresAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            Question {currentStep + 1} of {questions.length}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {Math.round(progress)}% complete
          </span>
        </div>
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
          />
        </div>
      </div>

      {/* Question Card */}
      <motion.div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="p-6"
          >
            {/* Question Header */}
            <div className="mb-6">
              <div className="flex items-start gap-3 mb-2">
                <span className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {currentStep + 1}
                </span>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {currentQuestion.question}
                    {currentQuestion.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </h2>
                  {currentQuestion.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {currentQuestion.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Question Content */}
            {renderQuestion(currentQuestion)}

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={currentStep === 0 ? onCancel : handleBack}
            className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {currentStep === 0 ? 'Cancel' : '← Back'}
          </button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNext}
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </>
            ) : isLastQuestion ? (
              <>
                Submit Survey
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </>
            ) : (
              <>
                Next →
              </>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Question Navigation Dots */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {questions.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              if (index < currentStep || (index > currentStep && validateCurrentQuestion())) {
                setCurrentStep(index);
              }
            }}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              index === currentStep
                ? 'bg-emerald-500 w-6'
                : index < currentStep
                ? 'bg-emerald-300 dark:bg-emerald-700'
                : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default SurveyForm;
