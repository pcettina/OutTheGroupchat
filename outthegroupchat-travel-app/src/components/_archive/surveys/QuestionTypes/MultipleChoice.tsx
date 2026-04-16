'use client';

import { motion } from 'framer-motion';
import type { SurveyQuestion } from '@/types';

interface MultipleChoiceProps {
  question: SurveyQuestion;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  singleSelect?: boolean;
}

export function MultipleChoice({
  question,
  value,
  onChange,
  singleSelect = false,
}: MultipleChoiceProps) {
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

  const handleSelect = (option: string) => {
    if (singleSelect) {
      onChange(option);
    } else {
      const newValues = selectedValues.includes(option)
        ? selectedValues.filter((v) => v !== option)
        : [...selectedValues, option];
      onChange(newValues);
    }
  };

  return (
    <div className="space-y-3">
      {question.options?.map((option, index) => {
        const isSelected = selectedValues.includes(option);
        
        return (
          <motion.button
            key={index}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => handleSelect(option)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
              isSelected
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'
            }`}
          >
            {/* Checkbox/Radio */}
            <div className={`w-6 h-6 rounded-${singleSelect ? 'full' : 'md'} border-2 flex items-center justify-center flex-shrink-0 ${
              isSelected
                ? 'border-emerald-500 bg-emerald-500'
                : 'border-slate-300 dark:border-slate-600'
            }`}>
              {isSelected && (
                <motion.svg
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </motion.svg>
              )}
            </div>

            {/* Option Text */}
            <span className={`font-medium ${
              isSelected
                ? 'text-emerald-900 dark:text-emerald-100'
                : 'text-slate-700 dark:text-slate-300'
            }`}>
              {option}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
