'use client';

import { useState, useEffect } from 'react';
import { motion, Reorder } from 'framer-motion';
import type { SurveyQuestion } from '@/types';

interface RankingQuestionProps {
  question: SurveyQuestion;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}

export function RankingQuestion({ question, value, onChange }: RankingQuestionProps) {
  const [items, setItems] = useState<string[]>(value || question.options || []);

  useEffect(() => {
    if (value && value.length > 0) {
      setItems(value);
    } else if (question.options) {
      setItems(question.options);
    }
  }, [value, question.options]);

  const handleReorder = (newOrder: string[]) => {
    setItems(newOrder);
    onChange(newOrder);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Drag to reorder by preference (top = most preferred)
      </p>
      
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={handleReorder}
        className="space-y-2"
      >
        {items.map((item, index) => (
          <Reorder.Item
            key={item}
            value={item}
            className="cursor-grab active:cursor-grabbing"
          >
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.01 }}
              className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Rank Number */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                index === 0
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : index === 1
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                  : index === 2
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                  : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
              }`}>
                {index === 0 && '🥇'}
                {index === 1 && '🥈'}
                {index === 2 && '🥉'}
                {index > 2 && (index + 1)}
              </div>

              {/* Item Text */}
              <span className="flex-1 font-medium text-slate-900 dark:text-white">
                {item}
              </span>

              {/* Drag Handle */}
              <div className="text-slate-400 dark:text-slate-500">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                </svg>
              </div>
            </motion.div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}
