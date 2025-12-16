'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface TrendingItem {
  id: string;
  type: 'destination' | 'trip' | 'activity';
  title: string;
  subtitle: string;
  image?: string;
  stats?: {
    views?: number;
    bookings?: number;
    growth?: number;
  };
}

interface TrendingSectionProps {
  items: TrendingItem[];
  title?: string;
  className?: string;
}

export function TrendingSection({
  items,
  title = 'Trending Now',
  className = '',
}: TrendingSectionProps) {
  return (
    <section className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center">
            <span className="text-xl">🔥</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Popular this week</p>
          </div>
        </div>
        <Link
          href="/discover/trending"
          className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
        >
          View all →
        </Link>
      </div>

      {/* Trending Items */}
      <div className="space-y-3">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Link href={`/${item.type === 'destination' ? 'discover' : item.type === 'trip' ? 'trips' : 'activities'}/${item.id}`}>
              <motion.div
                whileHover={{ x: 4 }}
                className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
              >
                {/* Rank */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  index === 0
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : index === 1
                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    : index === 2
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                }`}>
                  {index + 1}
                </div>

                {/* Image */}
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 overflow-hidden flex-shrink-0">
                  {item.image ? (
                    <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl text-white">
                      {item.type === 'destination' ? '📍' : item.type === 'trip' ? '✈️' : '🎯'}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                    {item.subtitle}
                  </p>
                </div>

                {/* Stats */}
                <div className="text-right">
                  {item.stats?.growth !== undefined && (
                    <span className={`text-sm font-medium ${
                      item.stats.growth > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {item.stats.growth > 0 ? '↑' : '↓'} {Math.abs(item.stats.growth)}%
                    </span>
                  )}
                  {item.stats?.views && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.stats.views.toLocaleString()} views
                    </p>
                  )}
                </div>
              </motion.div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export default TrendingSection;
