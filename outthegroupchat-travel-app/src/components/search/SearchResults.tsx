'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface SearchResult {
  id: string;
  type: 'trip' | 'activity' | 'user';
  title: string;
  subtitle: string;
  image?: string;
  metadata?: Record<string, unknown>;
}

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  query: string;
  onResultClick?: (result: SearchResult) => void;
}

export function SearchResults({
  results,
  isLoading,
  query,
  onResultClick,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <Skeleton variant="rounded" width={64} height={64} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0 && query) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        }
        title="No results found"
        description={`We couldn't find anything matching "${query}". Try different keywords or filters.`}
      />
    );
  }

  // Group results by type
  const groupedResults = results.reduce((groups, result) => {
    if (!groups[result.type]) {
      groups[result.type] = [];
    }
    groups[result.type].push(result);
    return groups;
  }, {} as Record<string, SearchResult[]>);

  const typeLabels = {
    trip: { label: 'Trips', icon: '✈️' },
    activity: { label: 'Activities', icon: '📍' },
    user: { label: 'People', icon: '👥' },
  };

  return (
    <div className="space-y-6">
      {(['trip', 'activity', 'user'] as const).map((type) => {
        const typeResults = groupedResults[type];
        if (!typeResults?.length) return null;

        const config = typeLabels[type];

        return (
          <div key={type}>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
              <span>{config.icon}</span>
              <span>{config.label}</span>
              <span className="text-xs">({typeResults.length})</span>
            </h3>

            <div className="space-y-2">
              <AnimatePresence>
                {typeResults.map((result, index) => (
                  <motion.div
                    key={result.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <SearchResultItem
                      result={result}
                      onClick={() => onResultClick?.(result)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SearchResultItem({
  result,
  onClick,
}: {
  result: SearchResult;
  onClick?: () => void;
}) {
  const href = result.type === 'trip'
    ? `/trips/${result.id}`
    : result.type === 'activity'
    ? `/activities/${result.id}`
    : `/profile/${result.id}`;

  return (
    <Link href={href} onClick={onClick}>
      <motion.div
        whileHover={{ x: 4 }}
        className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
      >
        {/* Image */}
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 overflow-hidden flex-shrink-0">
          {result.image ? (
            <img src={result.image} alt={result.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-xl">
              {result.type === 'trip' ? '✈️' : result.type === 'activity' ? '📍' : result.title.charAt(0)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 dark:text-white truncate">
            {result.title}
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {result.subtitle}
          </p>
        </div>

        {/* Type Badge */}
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
          result.type === 'trip'
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
            : result.type === 'activity'
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
            : 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
        }`}>
          {result.type}
        </span>

        {/* Arrow */}
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.div>
    </Link>
  );
}

export default SearchResults;
