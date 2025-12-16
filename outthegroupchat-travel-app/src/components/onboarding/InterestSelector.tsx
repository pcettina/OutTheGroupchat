'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface Interest {
  id: string;
  label: string;
  icon: string;
  category: string;
}

interface InterestSelectorProps {
  onComplete: (interests: string[]) => void;
  onBack: () => void;
  minSelections?: number;
  maxSelections?: number;
}

const interests: Interest[] = [
  // Activities
  { id: 'hiking', label: 'Hiking', icon: '🥾', category: 'Activities' },
  { id: 'water-sports', label: 'Water Sports', icon: '🏄', category: 'Activities' },
  { id: 'skiing', label: 'Skiing', icon: '⛷️', category: 'Activities' },
  { id: 'yoga', label: 'Yoga & Wellness', icon: '🧘', category: 'Activities' },
  { id: 'photography', label: 'Photography', icon: '📷', category: 'Activities' },
  { id: 'cycling', label: 'Cycling', icon: '🚴', category: 'Activities' },

  // Experiences
  { id: 'food-tours', label: 'Food Tours', icon: '🍜', category: 'Experiences' },
  { id: 'wine-tasting', label: 'Wine Tasting', icon: '🍷', category: 'Experiences' },
  { id: 'nightlife', label: 'Nightlife', icon: '🌙', category: 'Experiences' },
  { id: 'live-music', label: 'Live Music', icon: '🎵', category: 'Experiences' },
  { id: 'festivals', label: 'Festivals', icon: '🎪', category: 'Experiences' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', category: 'Experiences' },

  // Culture
  { id: 'museums', label: 'Museums', icon: '🏛️', category: 'Culture' },
  { id: 'history', label: 'Historical Sites', icon: '🏰', category: 'Culture' },
  { id: 'art', label: 'Art Galleries', icon: '🎨', category: 'Culture' },
  { id: 'local-culture', label: 'Local Culture', icon: '👘', category: 'Culture' },
  { id: 'architecture', label: 'Architecture', icon: '🏗️', category: 'Culture' },
  { id: 'religion', label: 'Religious Sites', icon: '⛪', category: 'Culture' },

  // Nature
  { id: 'beaches', label: 'Beaches', icon: '🏖️', category: 'Nature' },
  { id: 'mountains', label: 'Mountains', icon: '🏔️', category: 'Nature' },
  { id: 'wildlife', label: 'Wildlife', icon: '🦁', category: 'Nature' },
  { id: 'national-parks', label: 'National Parks', icon: '🌲', category: 'Nature' },
  { id: 'sunsets', label: 'Sunsets', icon: '🌅', category: 'Nature' },
  { id: 'stargazing', label: 'Stargazing', icon: '✨', category: 'Nature' },
];

export function InterestSelector({
  onComplete,
  onBack,
  minSelections = 3,
  maxSelections = 10,
}: InterestSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleInterest = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length >= maxSelections) return prev;
      return [...prev, id];
    });
  };

  const handleContinue = () => {
    if (selected.length >= minSelections) {
      onComplete(selected);
    }
  };

  // Group interests by category
  const categories = interests.reduce((acc, interest) => {
    if (!acc[interest.category]) {
      acc[interest.category] = [];
    }
    acc[interest.category].push(interest);
    return acc;
  }, {} as Record<string, Interest[]>);

  const canContinue = selected.length >= minSelections;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <span className="text-sm text-slate-500 dark:text-slate-400">
            {selected.length}/{maxSelections} selected
          </span>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            What are you interested in?
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Select at least {minSelections} interests to personalize your experience
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-8 mb-8">
          {Object.entries(categories).map(([category, categoryInterests]) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="flex flex-wrap gap-2">
                {categoryInterests.map((interest) => {
                  const isSelected = selected.includes(interest.id);
                  return (
                    <motion.button
                      key={interest.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleInterest(interest.id)}
                      className={`px-4 py-2.5 rounded-full font-medium transition-all flex items-center gap-2 ${
                        isSelected
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                      }`}
                    >
                      <span>{interest.icon}</span>
                      <span>{interest.label}</span>
                      {isSelected && (
                        <motion.svg
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </motion.svg>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Continue Button */}
        <div className="sticky bottom-4">
          <motion.button
            whileHover={canContinue ? { scale: 1.02 } : {}}
            whileTap={canContinue ? { scale: 0.98 } : {}}
            onClick={handleContinue}
            disabled={!canContinue}
            className={`w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
              canContinue
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {canContinue ? (
              <>
                Continue
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            ) : (
              `Select ${minSelections - selected.length} more`
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

export default InterestSelector;
