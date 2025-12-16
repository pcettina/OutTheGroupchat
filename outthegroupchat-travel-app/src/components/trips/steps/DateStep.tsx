'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isAfter, isBefore, startOfDay } from 'date-fns';
import type { StepProps } from '../TripWizard';

export function DateStep({ data, onUpdate, onNext, onBack }: StepProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectingEnd, setSelectingEnd] = useState(false);

  const today = startOfDay(new Date());

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    // Add padding days from previous month
    const startDay = start.getDay();
    const paddingBefore = Array.from({ length: startDay }, (_, i) =>
      addDays(start, -(startDay - i))
    );

    // Add padding days from next month
    const endDay = end.getDay();
    const paddingAfter = Array.from({ length: 6 - endDay }, (_, i) =>
      addDays(end, i + 1)
    );

    return [...paddingBefore, ...days, ...paddingAfter];
  }, [currentMonth]);

  const handleDateClick = (date: Date) => {
    if (isBefore(date, today)) return;

    if (!selectingEnd || !data.startDate) {
      onUpdate({ startDate: date, endDate: null });
      setSelectingEnd(true);
    } else {
      if (isBefore(date, data.startDate)) {
        onUpdate({ startDate: date, endDate: null });
      } else {
        onUpdate({ endDate: date });
        setSelectingEnd(false);
      }
    }
  };

  const isInRange = (date: Date) => {
    if (!data.startDate || !data.endDate) return false;
    return isAfter(date, data.startDate) && isBefore(date, data.endDate);
  };

  const isSelected = (date: Date) => {
    return (
      (data.startDate && isSameDay(date, data.startDate)) ||
      (data.endDate && isSameDay(date, data.endDate))
    );
  };

  const tripDuration = useMemo(() => {
    if (!data.startDate || !data.endDate) return null;
    const days = Math.ceil(
      (data.endDate.getTime() - data.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  }, [data.startDate, data.endDate]);

  const canProceed = data.startDate !== null && data.endDate !== null;

  // Quick date presets
  const presets = [
    { label: 'Weekend', days: 3 },
    { label: 'Long Weekend', days: 4 },
    { label: 'One Week', days: 7 },
    { label: 'Two Weeks', days: 14 },
  ];

  const applyPreset = (days: number) => {
    const start = addDays(today, 7); // Start a week from now
    const end = addDays(start, days - 1);
    onUpdate({ startDate: start, endDate: end });
    setSelectingEnd(false);
  };

  return (
    <div className="space-y-6">
      {/* Quick Presets */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Quick Select
        </h3>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset.days)}
              className="px-4 py-2 text-sm rounded-full border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            aria-label="Previous month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <button
            onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            aria-label="Next month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day Labels */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-2"
            >
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
                  relative p-2 text-sm rounded-lg transition-all
                  ${!isCurrentMonth ? 'text-slate-300 dark:text-slate-600' : ''}
                  ${isPast ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'cursor-pointer'}
                  ${selected ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold' : ''}
                  ${inRange ? 'bg-emerald-100 dark:bg-emerald-900/30' : ''}
                  ${!selected && !inRange && !isPast && isCurrentMonth ? 'hover:bg-slate-200 dark:hover:bg-slate-600' : ''}
                `}
              >
                {format(date, 'd')}
                {isSameDay(date, today) && !selected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500" />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Selected Dates Display */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`p-4 rounded-xl border-2 transition-all ${
            selectingEnd && !data.endDate
              ? 'border-slate-200 dark:border-slate-700'
              : data.startDate
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
              : 'border-slate-200 dark:border-slate-700'
          }`}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Start Date</p>
          <p className="font-semibold text-slate-900 dark:text-white">
            {data.startDate ? format(data.startDate, 'MMM d, yyyy') : 'Select date'}
          </p>
        </div>
        <div
          className={`p-4 rounded-xl border-2 transition-all ${
            selectingEnd
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
              : data.endDate
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
              : 'border-slate-200 dark:border-slate-700'
          }`}
        >
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">End Date</p>
          <p className="font-semibold text-slate-900 dark:text-white">
            {data.endDate ? format(data.endDate, 'MMM d, yyyy') : 'Select date'}
          </p>
        </div>
      </div>

      {/* Trip Duration */}
      {tripDuration !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl"
        >
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
            {tripDuration} {tripDuration === 1 ? 'day' : 'days'} trip
          </span>
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBack}
          className="px-6 py-3 rounded-xl font-semibold border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          disabled={!canProceed}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            canProceed
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
