'use client';

import { motion } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';
import type { TripWithRelations, TripBudget } from '@/types';

interface TripOverviewProps {
  trip: TripWithRelations;
}

export default function TripOverview({ trip }: TripOverviewProps) {
  const budget = trip.budget as unknown as TripBudget | null;
  const memberCount = trip._count?.members || trip.members?.length || 1;
  
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const daysUntilTrip = differenceInDays(startDate, new Date());
  const tripDuration = differenceInDays(endDate, startDate);

  const budgetBreakdown = budget?.breakdown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Trip Overview
        </h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Countdown */}
        {daysUntilTrip > 0 && (
          <div className="text-center p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl">
            <p className="text-sm text-slate-600 dark:text-slate-400">Trip starts in</p>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {daysUntilTrip} {daysUntilTrip === 1 ? 'day' : 'days'}
            </p>
          </div>
        )}

        {/* Date Range */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Duration</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {tripDuration} {tripDuration === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Start</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {format(startDate, 'EEE, MMM d, yyyy')}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">End</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {format(endDate, 'EEE, MMM d, yyyy')}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200 dark:border-slate-700" />

        {/* Budget Summary */}
        {budget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Total Budget</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                {budget.currency} {budget.total.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Per Person</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {budget.currency} {Math.round(budget.total / memberCount).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Per Day</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {budget.currency} {Math.round(budget.total / tripDuration).toLocaleString()}
              </span>
            </div>

            {/* Budget Breakdown */}
            {budgetBreakdown && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Breakdown
                </p>
                {[
                  { key: 'accommodation', label: 'Accommodation', icon: '🏨' },
                  { key: 'food', label: 'Food & Drinks', icon: '🍽️' },
                  { key: 'activities', label: 'Activities', icon: '🎯' },
                  { key: 'transport', label: 'Transport', icon: '🚕' },
                ].map((item) => {
                  const value = budgetBreakdown[item.key as keyof typeof budgetBreakdown];
                  if (!value) return null;
                  const percentage = Math.round((value / budget.total) * 100);
                  return (
                    <div key={item.key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <span>{item.icon}</span>
                          {item.label}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {budget.currency} {value.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {trip.description && (
          <>
            <div className="border-t border-slate-200 dark:border-slate-700" />
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">About this trip</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {trip.description}
              </p>
            </div>
          </>
        )}

        {/* Quick Stats */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {memberCount}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Members</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {trip.activities?.length || 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Activities</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {tripDuration}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Days</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
