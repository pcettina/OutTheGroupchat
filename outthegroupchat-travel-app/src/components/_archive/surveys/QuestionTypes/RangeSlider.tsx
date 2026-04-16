'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { SurveyQuestion } from '@/types';

interface RangeSliderProps {
  question: SurveyQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
  isCurrency?: boolean;
}

export function RangeSlider({
  question,
  value,
  onChange,
  isCurrency = false,
}: RangeSliderProps) {
  const min = question.min || 0;
  const max = question.max || 100;
  const step = question.step || 1;
  
  const [localValue, setLocalValue] = useState(value ?? Math.round((min + max) / 2));

  useEffect(() => {
    if (value !== undefined) {
      setLocalValue(value);
    }
  }, [value]);

  const handleChange = (newValue: number) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const percentage = ((localValue - min) / (max - min)) * 100;

  const formatValue = (val: number) => {
    if (isCurrency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(val);
    }
    return val.toString();
  };

  // Generate scale labels
  const scaleLabels = [];
  if (!isCurrency && max - min <= 10) {
    for (let i = min; i <= max; i += step) {
      scaleLabels.push(i);
    }
  } else {
    scaleLabels.push(min, Math.round((min + max) / 2), max);
  }

  return (
    <div className="space-y-6">
      {/* Current Value Display */}
      <div className="text-center">
        <motion.div
          key={localValue}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`inline-block px-6 py-3 rounded-xl ${
            isCurrency
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
              : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          <span className="text-3xl font-bold">{formatValue(localValue)}</span>
        </motion.div>
      </div>

      {/* Slider */}
      <div className="relative px-3">
        {/* Track Background */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-200 dark:bg-slate-700 rounded-full" />
        
        {/* Track Fill */}
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
          style={{ width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />

        {/* Input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={(e) => handleChange(Number(e.target.value))}
          className="relative w-full h-2 appearance-none bg-transparent cursor-pointer z-10
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-6
            [&::-webkit-slider-thumb]:h-6
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-4
            [&::-webkit-slider-thumb]:border-emerald-500
            [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110"
        />
      </div>

      {/* Scale Labels */}
      <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
        {scaleLabels.map((label) => (
          <span key={label} className="text-center">
            {formatValue(label)}
          </span>
        ))}
      </div>

      {/* Quick Select (for scale questions) */}
      {!isCurrency && max - min <= 10 && (
        <div className="flex justify-center gap-2">
          {scaleLabels.map((val) => (
            <button
              key={val}
              onClick={() => handleChange(val)}
              className={`w-10 h-10 rounded-full text-sm font-semibold transition-all ${
                localValue === val
                  ? 'bg-emerald-500 text-white scale-110'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
