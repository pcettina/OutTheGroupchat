'use client';

import { motion } from 'framer-motion';

interface ProfileStatsCardsProps {
  tripsCreated: number;
  tripsCompleted: number;
  countriesVisited: number;
  activitiesPlanned: number;
}

export function ProfileStatsCards({
  tripsCreated,
  tripsCompleted,
  countriesVisited,
  activitiesPlanned,
}: ProfileStatsCardsProps) {
  const stats = [
    { label: 'Trips Created', value: tripsCreated, icon: '✈️' },
    { label: 'Completed', value: tripsCompleted, icon: '🎉' },
    { label: 'Countries', value: countriesVisited, icon: '🌍' },
    { label: 'Activities', value: activitiesPlanned, icon: '📍' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
    >
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <span className="text-2xl">{stat.icon}</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stat.value}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
