'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, eachDayOfInterval } from 'date-fns';
import type { Activity, ItineraryDay } from '@prisma/client';

interface ItineraryTimelineProps {
  tripId: string;
  startDate: Date;
  endDate: Date;
  activities?: Activity[];
  itinerary?: ItineraryDay[];
  onAddActivity?: (dayNumber: number) => void;
}

const categoryConfig: Record<string, { icon: string; color: string; bgColor: string }> = {
  FOOD: { icon: '🍽️', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  CULTURE: { icon: '🎭', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  NATURE: { icon: '🌲', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  ENTERTAINMENT: { icon: '🎪', color: 'text-pink-600', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
  NIGHTLIFE: { icon: '🌙', color: 'text-indigo-600', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  SPORTS: { icon: '⚽', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  SHOPPING: { icon: '🛍️', color: 'text-rose-600', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
  OTHER: { icon: '✨', color: 'text-slate-600', bgColor: 'bg-slate-100 dark:bg-slate-700' },
};

export default function ItineraryTimeline({
  tripId,
  startDate,
  endDate,
  activities = [],
  itinerary = [],
  onAddActivity,
}: ItineraryTimelineProps) {
  const [expandedDay, setExpandedDay] = useState<number>(1);

  // Generate days for the trip
  const tripDays = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return eachDayOfInterval({ start, end }).map((date, index) => ({
      dayNumber: index + 1,
      date,
      activities: activities.filter((a) => {
        if (!a.date) return false;
        const activityDate = new Date(a.date);
        return format(activityDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
      }),
    }));
  }, [startDate, endDate, activities]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Itinerary
        </h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {tripDays.length} days
        </span>
      </div>

      {/* Timeline */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {tripDays.map((day) => {
          const isExpanded = expandedDay === day.dayNumber;
          const hasActivities = day.activities.length > 0;

          return (
            <div key={day.dayNumber} className="relative">
              {/* Day Header */}
              <button
                onClick={() => setExpandedDay(isExpanded ? 0 : day.dayNumber)}
                className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                {/* Day Number Circle */}
                <div className={`w-12 h-12 rounded-full flex flex-col items-center justify-center flex-shrink-0 ${
                  hasActivities
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}>
                  <span className="text-xs font-medium">Day</span>
                  <span className="text-lg font-bold leading-none">{day.dayNumber}</span>
                </div>

                {/* Day Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white">
                    {format(day.date, 'EEEE')}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {format(day.date, 'MMMM d, yyyy')}
                  </p>
                </div>

                {/* Activity Count */}
                <div className="flex items-center gap-2">
                  {hasActivities && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                      {day.activities.length} {day.activities.length === 1 ? 'activity' : 'activities'}
                    </span>
                  )}
                  <motion.svg
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    className="w-5 h-5 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </motion.svg>
                </div>
              </button>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 space-y-3">
                      {/* Activities List */}
                      {day.activities.length > 0 ? (
                        <div className="space-y-2 ml-6 border-l-2 border-emerald-200 dark:border-emerald-800 pl-4">
                          {day.activities.map((activity, index) => {
                            const config = categoryConfig[activity.category || 'OTHER'] || categoryConfig.OTHER;
                            return (
                              <motion.div
                                key={activity.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl relative"
                              >
                                {/* Timeline Dot */}
                                <div className="absolute -left-[22px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800" />

                                {/* Icon */}
                                <div className={`w-10 h-10 rounded-lg ${config.bgColor} flex items-center justify-center text-xl flex-shrink-0`}>
                                  {config.icon}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-slate-900 dark:text-white">
                                    {activity.name}
                                  </p>
                                  {activity.description && (
                                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                                      {activity.description}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    {activity.duration && (
                                      <span className="flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {activity.duration} min
                                      </span>
                                    )}
                                    {activity.cost && (
                                      <span className="flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        ${activity.cost}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Status Badge */}
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  activity.status === 'APPROVED'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : activity.status === 'SUGGESTED'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                                }`}>
                                  {activity.status?.toLowerCase()}
                                </span>
                              </motion.div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 ml-6">
                          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            No activities planned for this day
                          </p>
                        </div>
                      )}

                      {/* Add Activity Button */}
                      {onAddActivity && (
                        <button
                          onClick={() => onAddActivity(day.dayNumber)}
                          className="w-full mt-3 px-4 py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add activity to Day {day.dayNumber}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
