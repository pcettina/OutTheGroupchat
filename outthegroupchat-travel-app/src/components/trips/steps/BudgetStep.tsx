'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { StepProps } from '../TripWizard';
import type { TripBudget } from '@/types';

const currencies = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
];

const budgetPresets = [
  { label: 'Budget', min: 500, max: 1000, icon: '💰', description: 'Hostels, street food, free activities' },
  { label: 'Moderate', min: 1000, max: 2500, icon: '✨', description: 'Hotels, nice restaurants, tours' },
  { label: 'Comfort', min: 2500, max: 5000, icon: '🌟', description: 'Great hotels, fine dining, experiences' },
  { label: 'Luxury', min: 5000, max: 10000, icon: '👑', description: 'Premium everything' },
];

export function BudgetStep({ data, onUpdate, onNext, onBack }: StepProps) {
  const [currency, setCurrency] = useState(data.budget?.currency || 'USD');
  const [total, setTotal] = useState(data.budget?.total || 2000);
  const [breakdown, setBreakdown] = useState(
    data.budget?.breakdown || {
      accommodation: 40,
      food: 25,
      activities: 25,
      transport: 10,
    }
  );

  const currencySymbol = currencies.find((c) => c.code === currency)?.symbol || '$';

  // Calculate breakdown amounts
  const breakdownAmounts = useMemo(() => {
    return {
      accommodation: Math.round(total * (breakdown.accommodation / 100)),
      food: Math.round(total * (breakdown.food / 100)),
      activities: Math.round(total * (breakdown.activities / 100)),
      transport: Math.round(total * (breakdown.transport / 100)),
    };
  }, [total, breakdown]);

  const handleUpdateBudget = () => {
    const budget: TripBudget = {
      total,
      currency,
      breakdown: breakdownAmounts,
    };
    onUpdate({ budget });
  };

  const handlePresetSelect = (preset: typeof budgetPresets[0]) => {
    const avgBudget = Math.round((preset.min + preset.max) / 2);
    setTotal(avgBudget);
    handleUpdateBudget();
  };

  const handleBreakdownChange = (category: keyof typeof breakdown, value: number) => {
    const newBreakdown = { ...breakdown, [category]: value };
    const totalPercent = Object.values(newBreakdown).reduce((a, b) => a + b, 0);
    
    // Normalize to 100%
    if (totalPercent !== 100) {
      const others = Object.keys(newBreakdown).filter((k) => k !== category);
      const diff = 100 - value;
      const otherTotal = others.reduce((sum, k) => sum + newBreakdown[k as keyof typeof breakdown], 0);
      
      if (otherTotal > 0) {
        others.forEach((k) => {
          newBreakdown[k as keyof typeof breakdown] = Math.round(
            (newBreakdown[k as keyof typeof breakdown] / otherTotal) * diff
          );
        });
      }
    }
    
    setBreakdown(newBreakdown);
  };

  const tripDuration = useMemo(() => {
    if (!data.startDate || !data.endDate) return 1;
    return Math.ceil(
      (data.endDate.getTime() - data.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }, [data.startDate, data.endDate]);

  const dailyBudget = Math.round(total / tripDuration);

  return (
    <div className="space-y-6">
      {/* Budget Presets */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Budget Level
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {budgetPresets.map((preset) => {
            const isSelected = total >= preset.min && total <= preset.max;
            return (
              <motion.button
                key={preset.label}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePresetSelect(preset)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{preset.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{preset.label}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{preset.description}</p>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-2">
                  {currencySymbol}{preset.min.toLocaleString()} - {currencySymbol}{preset.max.toLocaleString()}
                </p>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Custom Budget */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Custom Budget
        </h3>
        <div className="flex gap-3">
          {/* Currency Selector */}
          <div className="w-32">
            <label htmlFor="currency" className="sr-only">Currency</label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 focus:border-emerald-500 outline-none transition-all"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code}
                </option>
              ))}
            </select>
          </div>

          {/* Total Budget Input */}
          <div className="flex-1">
            <label htmlFor="total-budget" className="sr-only">Total Budget</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                {currencySymbol}
              </span>
              <input
                id="total-budget"
                type="number"
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
                onBlur={handleUpdateBudget}
                min={100}
                max={100000}
                step={100}
                className="w-full px-4 py-3 pl-8 rounded-xl bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Budget Slider */}
        <div className="mt-4">
          <input
            type="range"
            value={total}
            onChange={(e) => setTotal(Number(e.target.value))}
            onMouseUp={handleUpdateBudget}
            onTouchEnd={handleUpdateBudget}
            min={100}
            max={15000}
            step={100}
            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-gradient-to-r [&::-webkit-slider-thumb]:from-emerald-500 [&::-webkit-slider-thumb]:to-teal-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{currencySymbol}100</span>
            <span>{currencySymbol}15,000</span>
          </div>
        </div>
      </div>

      {/* Daily Budget Display */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl"
      >
        <div className="text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            For {tripDuration} {tripDuration === 1 ? 'day' : 'days'}, that&apos;s about
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {currencySymbol}{dailyBudget.toLocaleString()}/day
          </p>
        </div>
      </motion.div>

      {/* Budget Breakdown */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Budget Breakdown
        </h3>
        <div className="space-y-4">
          {[
            { key: 'accommodation', label: 'Accommodation', icon: '🏨' },
            { key: 'food', label: 'Food & Drinks', icon: '🍽️' },
            { key: 'activities', label: 'Activities', icon: '🎯' },
            { key: 'transport', label: 'Local Transport', icon: '🚕' },
          ].map((item) => (
            <div key={item.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-2">
                  <span>{item.icon}</span>
                  <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                </span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {currencySymbol}{breakdownAmounts[item.key as keyof typeof breakdownAmounts].toLocaleString()}
                  <span className="text-slate-400 ml-1">
                    ({breakdown[item.key as keyof typeof breakdown]}%)
                  </span>
                </span>
              </div>
              <input
                type="range"
                value={breakdown[item.key as keyof typeof breakdown]}
                onChange={(e) => handleBreakdownChange(item.key as keyof typeof breakdown, Number(e.target.value))}
                min={0}
                max={80}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          ))}
        </div>
      </div>

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
          onClick={() => {
            handleUpdateBudget();
            onNext();
          }}
          className="px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
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
