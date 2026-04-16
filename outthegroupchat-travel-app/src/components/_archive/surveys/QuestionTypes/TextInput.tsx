'use client';

import { useState } from 'react';
import type { SurveyQuestion } from '@/types';

interface TextInputProps {
  question: SurveyQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}

export function TextInput({ question, value, onChange }: TextInputProps) {
  const [charCount, setCharCount] = useState(value?.length || 0);
  const maxLength = 500;

  const handleChange = (text: string) => {
    if (text.length <= maxLength) {
      onChange(text);
      setCharCount(text.length);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Type your answer here..."
        rows={4}
        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all resize-none text-slate-900 dark:text-white placeholder-slate-500"
      />
      <div className="flex justify-end">
        <span className={`text-xs ${
          charCount > maxLength * 0.9
            ? 'text-amber-500'
            : 'text-slate-400 dark:text-slate-500'
        }`}>
          {charCount}/{maxLength}
        </span>
      </div>
    </div>
  );
}
