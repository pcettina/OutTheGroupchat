'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/Skeleton';

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
  error?: string;
  onRetry?: () => void;
}

export function SearchResults({
  results,
  isLoading,
  query,
  onResultClick,
  error,
  onRetry,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading search results">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <Skeleton variant="rounded" width={64} height={64} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="text" width="25%" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skeleton variant="rounded" width={56} height={22} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12 px-6"
      >
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4 text-red-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Something went wrong
        </h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-sm mx-auto mb-6">
          {error}
        </p>
        {onRetry && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRetry}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            Try again
          </motion.button>
        )}
      </motion.div>
    );
  }

  if (results.length === 0 && query) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12 px-6"
      >
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          No results found for &ldquo;{query}&rdquo;
        </h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-sm mx-auto mb-6">
          We couldn&apos;t find anything matching your search. Try one of these:
        </p>
        <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <li className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Try different keywords
          </li>
          <li className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Explore trending destinations
          </li>
        </ul>
      </motion.div>
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
            <Image src={result.image} alt={result.title} width={56} height={56} className="w-full h-full object-cover" />
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
