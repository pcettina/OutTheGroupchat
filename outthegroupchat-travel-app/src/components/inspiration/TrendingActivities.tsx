'use client';

import { motion } from 'framer-motion';
import type { TrendingActivity } from './types';

interface TrendingActivitiesProps {
  activities: TrendingActivity[];
}

export function TrendingActivities({ activities }: TrendingActivitiesProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
        <span>⭐</span> Trending Activities
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {activities.map((activity, index) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + index * 0.05 }}
            className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow hover:shadow-lg transition-shadow border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                {activity.category}
              </span>
              {activity.avgRating && (
                <span className="flex items-center gap-1 text-sm text-amber-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  {activity.avgRating.toFixed(1)}
                </span>
              )}
            </div>
            <h4 className="font-medium text-slate-900 dark:text-white mb-1">
              {activity.name}
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
              {activity.description}
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {activity.saveCount}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {activity.commentCount}
              </span>
              <span className="ml-auto">{activity.destination}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
