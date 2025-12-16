'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isAfter, isBefore, startOfDay } from 'date-fns';
import type { SurveyQuestion } from '@/types';

interface DateRangePickerProps {
  question: SurveyQuestion;
  value: { start: string; end: string } | undefined;
  onChange: (value: { start: string; end: string }) => void;
}

export function DateRangePicker({ question, value, onChange }: DateRangePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectingEnd, setSelectingEnd] = useState(false);

  const today = startOfDay(new Date());
  const startDate = value?.start ? new Date(value.start) : null;
  const endDate = value?.end ? new Date(value.end) : null;

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    const startDay = start.getDay();
    const paddingBefore = Array.from({ length: startDay }, (_, i) =>
      addDays(start, -(startDay - i))
    );

    const endDay = end.getDay();
    const paddingAfter = Array.from({ length: 6 - endDay }, (_, i) =>
      addDays(end, i + 1)
    );

    return [...paddingBefore, ...days, ...paddingAfter];
  }, [currentMonth]);

  const handleDateClick = (date: Date) => {
    if (isBefore(date, today)) return;

    const dateStr = format(date, 'yyyy-MM-dd');

    if (!selectingEnd || !startDate) {
      onChange({ start: dateStr, end: '' });
      setSelectingEnd(true);
    } else {
      if (isBefore(date, startDate)) {
        onChange({ start: dateStr, end: '' });
      } else {
        onChange({ start: value?.start || '', end: dateStr });
        setSelectingEnd(false);
      }
    }
  };

  const isInRange = (date: Date) => {
    if (!startDate || !endDate) return false;
    return isAfter(date, startDate) && isBefore(date, endDate);
  };

  const isSelected = (date: Date) => {
    return (
      (startDate && isSameDay(date, startDate)) ||
      (endDate && isSameDay(date, endDate))
    );
  };

  return (
    <div className="space-y-4">
      {/* Selected Dates Display */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 rounded-xl border-2 ${
          selectingEnd && !endDate
            ? 'border-slate-200 dark:border-slate-700'
            : startDate
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
            : 'border-slate-200 dark:border-slate-700'
        }`}>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Available From</p>
          <p className="font-semibold text-slate-900 dark:text-white">
            {startDate ? format(startDate, 'MMM d, yyyy') : 'Select start'}
          </p>
        </div>
        <div className={`p-4 rounded-xl border-2 ${
          selectingEnd
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
            : endDate
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
            : 'border-slate-200 dark:border-slate-700'
        }`}>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Available Until</p>
          <p className="font-semibold text-slate-900 dark:text-white">
            {endDate ? format(endDate, 'MMM d, yyyy') : 'Select end'}
          </p>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <button
            onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day Labels */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date, index) => {
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isPast = isBefore(date, today);
            const selected = isSelected(date);
            const inRange = isInRange(date);

            return (
              <motion.button
                key={index}
                whileHover={!isPast ? { scale: 1.1 } : {}}
                whileTap={!isPast ? { scale: 0.95 } : {}}
                onClick={() => handleDateClick(date)}
                disabled={isPast}
                className={`
                  p-2 text-sm rounded-lg transition-all
                  ${!isCurrentMonth ? 'text-slate-300 dark:text-slate-600' : ''}
                  ${isPast ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'cursor-pointer'}
                  ${selected ? 'bg-emerald-500 text-white font-semibold' : ''}
                  ${inRange ? 'bg-emerald-100 dark:bg-emerald-900/30' : ''}
                  ${!selected && !inRange && !isPast && isCurrentMonth ? 'hover:bg-slate-200 dark:hover:bg-slate-600' : ''}
                `}
              >
                {format(date, 'd')}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
