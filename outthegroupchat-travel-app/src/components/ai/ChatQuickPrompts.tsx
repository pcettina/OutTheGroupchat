'use client';

import { motion } from 'framer-motion';
import type { TripContext } from './chat-types';

interface QuickPrompt {
  text: string;
  icon: string;
}

const TRIP_PROMPTS: QuickPrompt[] = [
  { text: 'Must-see attractions', icon: '🎯' },
  { text: 'Best local restaurants', icon: '🍽️' },
  { text: 'Create a day itinerary', icon: '📋' },
  { text: 'Budget tips', icon: '💰' },
];

const GENERAL_PROMPTS: QuickPrompt[] = [
  { text: 'Best bachelor party destinations', icon: '🎉' },
  { text: 'Budget-friendly group trips', icon: '💵' },
  { text: 'Beach getaway suggestions', icon: '🏖️' },
  { text: 'Adventure trip ideas', icon: '🏔️' },
];

interface ChatQuickPromptsProps {
  tripContext?: TripContext;
  onSelect: (text: string) => void;
}

/**
 * Renders a set of quick-prompt buttons below the welcome message.
 * Prompt set changes depending on whether a trip context is present.
 */
export function ChatQuickPrompts({ tripContext, onSelect }: ChatQuickPromptsProps) {
  const prompts = tripContext ? TRIP_PROMPTS : GENERAL_PROMPTS;

  return (
    <div className="px-4 pb-3">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Quick questions:</p>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt, i) => (
          <motion.button
            key={i}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(prompt.text)}
            className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors flex items-center gap-1"
          >
            <span>{prompt.icon}</span>
            <span>{prompt.text}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
