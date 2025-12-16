'use client';

import { motion } from 'framer-motion';
import type { UserPreferences } from '@/types';

interface PreferencesCardProps {
  preferences: UserPreferences;
  isEditable?: boolean;
  onEdit?: () => void;
}

const travelStyleConfig: Record<string, { icon: string; label: string; color: string }> = {
  adventure: { icon: '🏔️', label: 'Adventure', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  relaxation: { icon: '🏖️', label: 'Relaxation', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  cultural: { icon: '🏛️', label: 'Cultural', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  family: { icon: '👨‍👩‍👧‍👦', label: 'Family', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  solo: { icon: '🚶', label: 'Solo', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
};

const interestIcons: Record<string, string> = {
  food: '🍽️',
  nightlife: '🌙',
  nature: '🌲',
  sports: '⚽',
  art: '🎨',
  music: '🎵',
  history: '📜',
  shopping: '🛍️',
  photography: '📷',
  beaches: '🏖️',
  mountains: '⛰️',
  cities: '🏙️',
};

export function PreferencesCard({ preferences, isEditable = false, onEdit }: PreferencesCardProps) {
  const travelStyle = preferences.travelStyle && travelStyleConfig[preferences.travelStyle];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span>✨</span>
          Travel Preferences
        </h3>
        {isEditable && (
          <button
            onClick={onEdit}
            className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Travel Style */}
        {travelStyle && (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Travel Style
            </p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${travelStyle.color}`}>
              <span className="text-xl">{travelStyle.icon}</span>
              <span className="font-medium">{travelStyle.label}</span>
            </div>
          </div>
        )}

        {/* Budget Range */}
        {preferences.budgetRange && (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Budget Range
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {preferences.budgetRange.currency} {preferences.budgetRange.min.toLocaleString()} - {preferences.budgetRange.max.toLocaleString()}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">per trip</span>
            </div>
          </div>
        )}

        {/* Interests */}
        {preferences.interests && preferences.interests.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Interests
            </p>
            <div className="flex flex-wrap gap-2">
              {preferences.interests.map((interest) => (
                <span
                  key={interest}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full text-sm"
                >
                  <span>{interestIcons[interest.toLowerCase()] || '✨'}</span>
                  <span className="capitalize">{interest}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Language & Timezone */}
        {(preferences.language || preferences.timezone) && (
          <div className="grid grid-cols-2 gap-4">
            {preferences.language && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Language
                </p>
                <p className="text-slate-900 dark:text-white font-medium">
                  {preferences.language}
                </p>
              </div>
            )}
            {preferences.timezone && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Timezone
                </p>
                <p className="text-slate-900 dark:text-white font-medium">
                  {preferences.timezone}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!travelStyle && !preferences.budgetRange && (!preferences.interests || preferences.interests.length === 0) && (
          <div className="text-center py-4">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              No preferences set yet
            </p>
            {isEditable && (
              <button
                onClick={onEdit}
                className="mt-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
              >
                Add preferences →
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default PreferencesCard;
