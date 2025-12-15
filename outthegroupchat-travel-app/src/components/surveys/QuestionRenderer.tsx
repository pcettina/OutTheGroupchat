'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { SurveyQuestion } from '@/types';

interface QuestionRendererProps {
  question: SurveyQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function QuestionRenderer({ question, value, onChange }: QuestionRendererProps) {
  switch (question.type) {
    case 'single_choice':
      return (
        <SingleChoice
          options={question.options || []}
          value={value as string}
          onChange={onChange}
        />
      );
    case 'multiple_choice':
      return (
        <MultipleChoice
          options={question.options || []}
          value={(value as string[]) || []}
          onChange={onChange}
        />
      );
    case 'ranking':
      return (
        <Ranking
          options={question.options || []}
          value={(value as string[]) || []}
          onChange={onChange}
        />
      );
    case 'scale':
      return (
        <Scale
          min={question.min || 1}
          max={question.max || 10}
          value={value as number}
          onChange={onChange}
        />
      );
    case 'budget':
      return (
        <BudgetSlider
          min={question.min || 0}
          max={question.max || 5000}
          step={question.step || 100}
          value={value as number}
          onChange={onChange}
        />
      );
    case 'date_range':
      return (
        <DateRange
          value={value as { start: string; end: string }}
          onChange={onChange}
        />
      );
    case 'text':
    default:
      return (
        <TextInput
          value={value as string}
          onChange={onChange}
        />
      );
  }
}

// Single choice component
function SingleChoice({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <motion.label
          key={option}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
            value === option
              ? 'border-primary bg-primary/5'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            value === option ? 'border-primary' : 'border-gray-300'
          }`}>
            {value === option && <div className="w-3 h-3 rounded-full bg-primary" />}
          </div>
          <span className="text-gray-900">{option}</span>
        </motion.label>
      ))}
    </div>
  );
}

// Multiple choice component
function MultipleChoice({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggleOption = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter(v => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <motion.label
          key={option}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
            value.includes(option)
              ? 'border-primary bg-primary/5'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
            value.includes(option) ? 'border-primary bg-primary' : 'border-gray-300'
          }`}>
            {value.includes(option) && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="text-gray-900">{option}</span>
        </motion.label>
      ))}
    </div>
  );
}

// Ranking component with drag-and-drop
function Ranking({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [items, setItems] = useState(value.length ? value : options);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setItems(newItems);
    onChange(newItems);
  };

  const moveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setItems(newItems);
    onChange(newItems);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 mb-3">Drag or use arrows to rank in order of preference (top = most preferred)</p>
      {items.map((item, index) => (
        <motion.div
          key={item}
          layout
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200"
        >
          <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
            {index + 1}
          </span>
          <span className="flex-1 text-gray-900">{item}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => moveUp(index)}
              disabled={index === 0}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => moveDown(index)}
              disabled={index === items.length - 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// Scale component
function Scale({ min, max, value, onChange }: { min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-4">
      <input
        type="range"
        min={min}
        max={max}
        value={value || min}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-sm text-gray-500">
        <span>{min}</span>
        <span className="font-bold text-primary text-lg">{value || min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// Budget slider component
function BudgetSlider({ min, max, step, value, onChange }: { min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const currentValue = value || min;
  const percentage = ((currentValue - min) / (max - min)) * 100;

  return (
    <div className="space-y-4">
      <div className="relative pt-6">
        <div
          className="absolute top-0 left-0 transform -translate-x-1/2 bg-primary text-white px-3 py-1 rounded-lg text-sm font-medium"
          style={{ left: `${percentage}%` }}
        >
          ${currentValue.toLocaleString()}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
        />
      </div>
      <div className="flex justify-between text-sm text-gray-500">
        <span>${min.toLocaleString()}</span>
        <span>${max.toLocaleString()}</span>
      </div>
    </div>
  );
}

// Date range component
function DateRange({ value, onChange }: { value: { start: string; end: string }; onChange: (v: { start: string; end: string }) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
        <input
          type="date"
          value={value?.start || ''}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
        <input
          type="date"
          value={value?.end || ''}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        />
      </div>
    </div>
  );
}

// Text input component
function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your response..."
      rows={3}
      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
    />
  );
}

