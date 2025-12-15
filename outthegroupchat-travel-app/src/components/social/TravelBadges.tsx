'use client';

import { motion } from 'framer-motion';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'trips' | 'social' | 'explorer' | 'planner' | 'special';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  earnedAt?: string;
  progress?: number;
  requirement?: number;
}

interface TravelBadgesProps {
  badges: Badge[];
  showLocked?: boolean;
  onBadgeClick?: (badge: Badge) => void;
  className?: string;
}

const tierColors = {
  bronze: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-700 dark:text-amber-400',
    glow: 'shadow-amber-500/20',
  },
  silver: {
    bg: 'bg-slate-100 dark:bg-slate-700/50',
    border: 'border-slate-300 dark:border-slate-500',
    text: 'text-slate-600 dark:text-slate-300',
    glow: 'shadow-slate-400/20',
  },
  gold: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    border: 'border-yellow-400 dark:border-yellow-600',
    text: 'text-yellow-700 dark:text-yellow-400',
    glow: 'shadow-yellow-500/30',
  },
  platinum: {
    bg: 'bg-gradient-to-br from-cyan-100 to-purple-100 dark:from-cyan-900/30 dark:to-purple-900/30',
    border: 'border-cyan-400 dark:border-cyan-600',
    text: 'text-cyan-700 dark:text-cyan-400',
    glow: 'shadow-cyan-500/30',
  },
};

const categoryIcons = {
  trips: '✈️',
  social: '👥',
  explorer: '🗺️',
  planner: '📋',
  special: '⭐',
};

// Default badge definitions
export const defaultBadges: Badge[] = [
  // Trip badges
  {
    id: 'first-trip',
    name: 'First Adventure',
    description: 'Complete your first trip',
    icon: '🎒',
    category: 'trips',
    tier: 'bronze',
    requirement: 1,
  },
  {
    id: 'globetrotter',
    name: 'Globetrotter',
    description: 'Visit 5 different countries',
    icon: '🌍',
    category: 'explorer',
    tier: 'silver',
    requirement: 5,
  },
  {
    id: 'world-traveler',
    name: 'World Traveler',
    description: 'Visit 10 different countries',
    icon: '🌎',
    category: 'explorer',
    tier: 'gold',
    requirement: 10,
  },
  {
    id: 'jet-setter',
    name: 'Jet Setter',
    description: 'Complete 10 trips',
    icon: '✈️',
    category: 'trips',
    tier: 'gold',
    requirement: 10,
  },
  // Social badges
  {
    id: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Travel with 10 different people',
    icon: '🦋',
    category: 'social',
    tier: 'silver',
    requirement: 10,
  },
  {
    id: 'trip-leader',
    name: 'Trip Leader',
    description: 'Organize 5 group trips',
    icon: '👑',
    category: 'planner',
    tier: 'gold',
    requirement: 5,
  },
  {
    id: 'influencer',
    name: 'Travel Influencer',
    description: 'Have 100 followers',
    icon: '📸',
    category: 'social',
    tier: 'platinum',
    requirement: 100,
  },
  // Explorer badges
  {
    id: 'foodie',
    name: 'Foodie Explorer',
    description: 'Add 20 food activities',
    icon: '🍽️',
    category: 'explorer',
    tier: 'silver',
    requirement: 20,
  },
  {
    id: 'culture-vulture',
    name: 'Culture Vulture',
    description: 'Visit 10 cultural sites',
    icon: '🎭',
    category: 'explorer',
    tier: 'silver',
    requirement: 10,
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Add 15 nightlife activities',
    icon: '🌙',
    category: 'explorer',
    tier: 'bronze',
    requirement: 15,
  },
  // Special badges
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Join during beta period',
    icon: '🚀',
    category: 'special',
    tier: 'platinum',
  },
  {
    id: 'perfect-planner',
    name: 'Perfect Planner',
    description: 'Complete a trip with 100% survey participation',
    icon: '📊',
    category: 'planner',
    tier: 'gold',
  },
];

export function TravelBadges({
  badges,
  showLocked = true,
  onBadgeClick,
  className = '',
}: TravelBadgesProps) {
  const earnedBadges = badges.filter((b) => b.earnedAt);
  const lockedBadges = badges.filter((b) => !b.earnedAt);

  const renderBadge = (badge: Badge, isLocked: boolean) => {
    const colors = tierColors[badge.tier];
    
    return (
      <motion.button
        key={badge.id}
        onClick={() => onBadgeClick?.(badge)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all ${
          isLocked
            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-50'
            : `${colors.bg} ${colors.border} shadow-lg ${colors.glow}`
        }`}
      >
        {/* Badge Icon */}
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl mb-2 ${
            isLocked ? 'grayscale' : ''
          }`}
        >
          {badge.icon}
        </div>

        {/* Badge Name */}
        <p
          className={`text-sm font-semibold text-center ${
            isLocked ? 'text-slate-400 dark:text-slate-500' : colors.text
          }`}
        >
          {badge.name}
        </p>

        {/* Tier indicator */}
        <span
          className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full capitalize ${
            isLocked
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400'
              : `${colors.bg} ${colors.text}`
          }`}
        >
          {badge.tier}
        </span>

        {/* Progress bar for locked badges */}
        {isLocked && badge.progress !== undefined && badge.requirement && (
          <div className="w-full mt-2">
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (badge.progress / badge.requirement) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1 text-center">
              {badge.progress} / {badge.requirement}
            </p>
          </div>
        )}

        {/* Lock overlay */}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl opacity-30">🔒</span>
          </div>
        )}
      </motion.button>
    );
  };

  return (
    <div className={className}>
      {/* Earned Badges */}
      {earnedBadges.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Earned Badges
            </h3>
            <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-medium rounded-full">
              {earnedBadges.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {earnedBadges.map((badge) => renderBadge(badge, false))}
          </div>
        </div>
      )}

      {/* Locked Badges */}
      {showLocked && lockedBadges.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Badges to Earn
            </h3>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-full">
              {lockedBadges.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {lockedBadges.map((badge) => renderBadge(badge, true))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {badges.length === 0 && (
        <div className="text-center py-12">
          <span className="text-6xl mb-4 block">🏆</span>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Start earning badges!
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Complete trips, explore new destinations, and engage with the community to earn badges.
          </p>
        </div>
      )}
    </div>
  );
}

// Badge Detail Modal Component
interface BadgeDetailModalProps {
  badge: Badge | null;
  isOpen: boolean;
  onClose: () => void;
}

export function BadgeDetailModal({ badge, isOpen, onClose }: BadgeDetailModalProps) {
  if (!badge || !isOpen) return null;

  const colors = tierColors[badge.tier];
  const isEarned = !!badge.earnedAt;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header with gradient */}
        <div className={`p-6 ${colors.bg} text-center`}>
          <span className="text-6xl block mb-3">{badge.icon}</span>
          <h3 className={`text-xl font-bold ${colors.text}`}>{badge.name}</h3>
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm capitalize ${colors.bg} ${colors.text} border ${colors.border}`}>
            {badge.tier}
          </span>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-slate-600 dark:text-slate-400 text-center mb-4">
            {badge.description}
          </p>

          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <span>{categoryIcons[badge.category]}</span>
            <span className="capitalize">{badge.category}</span>
          </div>

          {isEarned && badge.earnedAt && (
            <p className="mt-4 text-center text-emerald-600 dark:text-emerald-400 text-sm">
              ✓ Earned on {new Date(badge.earnedAt).toLocaleDateString()}
            </p>
          )}

          {!isEarned && badge.requirement && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-slate-500 mb-1">
                <span>Progress</span>
                <span>{badge.progress || 0} / {badge.requirement}</span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((badge.progress || 0) / badge.requirement) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Close button */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </>
  );
}

export default TravelBadges;

