'use client';

import { motion } from 'framer-motion';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt: string;
}

interface BadgeShowcaseProps {
  badges: Badge[];
  maxDisplay?: number;
}

const rarityConfig = {
  common: {
    border: 'border-slate-300 dark:border-slate-600',
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    glow: '',
  },
  rare: {
    border: 'border-blue-400 dark:border-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
    glow: 'shadow-blue-500/20',
  },
  epic: {
    border: 'border-purple-400 dark:border-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    text: 'text-purple-600 dark:text-purple-400',
    glow: 'shadow-purple-500/30',
  },
  legendary: {
    border: 'border-amber-400 dark:border-amber-500',
    bg: 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30',
    text: 'text-amber-600 dark:text-amber-400',
    glow: 'shadow-amber-500/40',
  },
};

export function BadgeShowcase({ badges, maxDisplay = 8 }: BadgeShowcaseProps) {
  const displayBadges = badges.slice(0, maxDisplay);
  const hasMore = badges.length > maxDisplay;

  // Sort by rarity (legendary first)
  const sortedBadges = [...displayBadges].sort((a, b) => {
    const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
    return rarityOrder[a.rarity] - rarityOrder[b.rarity];
  });

  if (badges.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <span>🏆</span>
          Badges
        </h3>
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl opacity-50">🏅</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            No badges earned yet
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Complete trips to earn badges!
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🏆</span>
          Badges ({badges.length})
        </h3>
        {hasMore && (
          <button className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
            View all
          </button>
        )}
      </div>

      {/* Badges Grid */}
      <div className="p-5">
        <div className="grid grid-cols-4 gap-3">
          {sortedBadges.map((badge, index) => {
            const config = rarityConfig[badge.rarity];
            
            return (
              <motion.div
                key={badge.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.1, y: -4 }}
                className="group relative cursor-pointer"
              >
                {/* Badge */}
                <div
                  className={`w-full aspect-square rounded-xl border-2 ${config.border} ${config.bg} flex items-center justify-center shadow-lg ${config.glow} transition-all`}
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">
                    {badge.icon}
                  </span>
                </div>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-slate-900 dark:bg-slate-700 text-white rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                    <p className="font-semibold">{badge.name}</p>
                    <p className="text-slate-300 dark:text-slate-400 mt-0.5">
                      {badge.description}
                    </p>
                    <p className={`mt-1 capitalize ${config.text}`}>
                      {badge.rarity}
                    </p>
                  </div>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
                </div>

                {/* Rarity Indicator */}
                {(badge.rarity === 'legendary' || badge.rarity === 'epic') && (
                  <motion.div
                    animate={{ 
                      opacity: [0.5, 1, 0.5],
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ 
                      repeat: Infinity, 
                      duration: 2,
                    }}
                    className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                      badge.rarity === 'legendary' ? 'bg-amber-400' : 'bg-purple-400'
                    }`}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-center gap-4 text-xs">
          {(['common', 'rare', 'epic', 'legendary'] as const).map((rarity) => {
            const config = rarityConfig[rarity];
            const count = badges.filter((b) => b.rarity === rarity).length;
            return (
              <span key={rarity} className={`flex items-center gap-1 ${config.text}`}>
                <span className={`w-2 h-2 rounded-full ${rarity === 'common' ? 'bg-slate-400' : rarity === 'rare' ? 'bg-blue-400' : rarity === 'epic' ? 'bg-purple-400' : 'bg-amber-400'}`} />
                <span className="capitalize">{rarity}</span>
                <span className="text-slate-400">({count})</span>
              </span>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export default BadgeShowcase;
