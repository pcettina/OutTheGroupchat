'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TravelStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
  color: string;
}

interface TravelStyleQuizProps {
  onComplete: (style: string) => void;
  onBack: () => void;
}

const travelStyles: TravelStyle[] = [
  {
    id: 'adventure',
    label: 'Adventure Seeker',
    icon: '🏔️',
    description: 'Hiking, extreme sports, and exploring the unknown',
    color: 'from-orange-400 to-red-500',
  },
  {
    id: 'relaxation',
    label: 'Beach Bum',
    icon: '🏖️',
    description: 'Sun, sand, and total relaxation',
    color: 'from-cyan-400 to-blue-500',
  },
  {
    id: 'cultural',
    label: 'Culture Explorer',
    icon: '🏛️',
    description: 'Museums, history, and local traditions',
    color: 'from-purple-400 to-indigo-500',
  },
  {
    id: 'foodie',
    label: 'Foodie',
    icon: '🍽️',
    description: 'Local cuisine, food tours, and culinary adventures',
    color: 'from-amber-400 to-orange-500',
  },
  {
    id: 'party',
    label: 'Nightlife Lover',
    icon: '🎉',
    description: 'Clubs, bars, and social scenes',
    color: 'from-pink-400 to-rose-500',
  },
  {
    id: 'nature',
    label: 'Nature Enthusiast',
    icon: '🌲',
    description: 'Wildlife, national parks, and eco-tourism',
    color: 'from-emerald-400 to-green-500',
  },
];

const questions = [
  {
    id: 'pace',
    question: 'What\'s your ideal vacation pace?',
    options: [
      { value: 'fast', label: 'Pack in as much as possible', icon: '⚡' },
      { value: 'moderate', label: 'Mix of activities and downtime', icon: '⚖️' },
      { value: 'slow', label: 'Slow and relaxed', icon: '🐢' },
    ],
  },
  {
    id: 'accommodation',
    question: 'Where do you prefer to stay?',
    options: [
      { value: 'luxury', label: 'Luxury hotels', icon: '🏨' },
      { value: 'boutique', label: 'Boutique or unique stays', icon: '🏡' },
      { value: 'budget', label: 'Hostels or budget options', icon: '🛏️' },
      { value: 'adventure', label: 'Camping or outdoors', icon: '⛺' },
    ],
  },
  {
    id: 'group',
    question: 'Who do you usually travel with?',
    options: [
      { value: 'solo', label: 'Solo adventures', icon: '🚶' },
      { value: 'partner', label: 'Partner or best friend', icon: '💑' },
      { value: 'small', label: 'Small group (3-5)', icon: '👨‍👩‍👧' },
      { value: 'large', label: 'Large group (6+)', icon: '👨‍👩‍👧‍👦' },
    ],
  },
];

export function TravelStyleQuiz({ onComplete, onBack }: TravelStyleQuizProps) {
  const [step, setStep] = useState(0);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleStyleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
    setStep(1);
  };

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    
    if (step < questions.length) {
      setStep((prev) => prev + 1);
    } else {
      onComplete(selectedStyle!);
    }
  };

  const handleBack = () => {
    if (step === 0) {
      onBack();
    } else {
      setStep((prev) => prev - 1);
    }
  };

  const progress = ((step + 1) / (questions.length + 1)) * 100;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={handleBack}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Progress */}
          <div className="flex-1 mx-4">
            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <span className="text-sm text-slate-500 dark:text-slate-400">
            {step + 1}/{questions.length + 1}
          </span>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div
              key="styles"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">
                What's your travel style?
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-8 text-center">
                Pick the one that best describes you
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {travelStyles.map((style) => (
                  <motion.button
                    key={style.id}
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleStyleSelect(style.id)}
                    className={`p-6 rounded-2xl border-2 text-left transition-all ${
                      selectedStyle === style.id
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${style.color} flex items-center justify-center mb-4`}>
                      <span className="text-2xl">{style.icon}</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                      {style.label}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {style.description}
                    </p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`question-${step}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">
                {questions[step - 1].question}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-8 text-center">
                This helps us personalize your experience
              </p>

              <div className="space-y-3">
                {questions[step - 1].options.map((option) => (
                  <motion.button
                    key={option.value}
                    whileHover={{ scale: 1.01, x: 4 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleAnswer(questions[step - 1].id, option.value)}
                    className="w-full p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors flex items-center gap-4 text-left"
                  >
                    <span className="text-2xl">{option.icon}</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {option.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default TravelStyleQuiz;
