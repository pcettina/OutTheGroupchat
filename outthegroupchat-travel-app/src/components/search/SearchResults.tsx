'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

// ---------------------------------------------------------------------------
// Types matching /api/ai/search response shape
// ---------------------------------------------------------------------------

export interface ActivityResult {
  id: string;
  name: string;
  score: number;
  metadata: {
    description?: string | null;
    category?: string | null;
    cost?: number | null;
    priceRange?: string | null;
    location?: unknown;
    ratingCount?: number;
  };
}

export interface DestinationResult {
  id: string;
  city: string;
  country: string;
  score: number;
  metadata: {
    description?: string | null;
    highlights?: unknown;
    topCategories?: string[];
    activityCount?: number;
    averageRating?: number | null;
    bestTimeToVisit?: string | null;
    averageBudget?: number | null;
  };
}

export interface AiSearchResults {
  activities?: ActivityResult[];
  destinations?: DestinationResult[];
}

interface SearchResultsProps {
  results: AiSearchResults;
  isLoading: boolean;
  query: string;
}

export function SearchResults({ results, isLoading, query }: SearchResultsProps) {
  const activityCount = results.activities?.length ?? 0;
  const destinationCount = results.destinations?.length ?? 0;
  const totalCount = activityCount + destinationCount;

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

  if (totalCount === 0 && query) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        }
        title="No results found"
        description={`We couldn't find anything matching "${query}". Try different keywords or filters.`}
      />
    );
  }

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Destinations section */}
      {(results.destinations?.length ?? 0) > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <span>🌍</span>
            <span>Destinations</span>
            <span className="text-xs">({results.destinations!.length})</span>
          </h3>
          <div className="space-y-2">
            <AnimatePresence>
              {results.destinations!.map((dest, index) => (
                <motion.div
                  key={dest.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <DestinationResultItem result={dest} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* Activities section */}
      {(results.activities?.length ?? 0) > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <span>📍</span>
            <span>Activities</span>
            <span className="text-xs">({results.activities!.length})</span>
          </h3>
          <div className="space-y-2">
            <AnimatePresence>
              {results.activities!.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <ActivityResultItem result={activity} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Destination result item
// ---------------------------------------------------------------------------

function DestinationResultItem({ result }: { result: DestinationResult }) {
  const { metadata } = result;
  const scorePercent = Math.round(result.score * 100);

  return (
    <Link href={`/discover?destination=${encodeURIComponent(result.city)}`}>
      <motion.div
        whileHover={{ x: 4 }}
        className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
      >
        {/* Icon */}
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-2xl">
          🌍
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 dark:text-white truncate">
            {result.city}, {result.country}
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {metadata.description
              ? String(metadata.description).slice(0, 80)
              : metadata.topCategories?.join(', ') || 'Destination'}
          </p>
          <div className="flex items-center gap-3 mt-1">
            {typeof metadata.activityCount === 'number' && (
              <span className="text-xs text-slate-400">{metadata.activityCount} activities</span>
            )}
            {metadata.bestTimeToVisit && (
              <span className="text-xs text-slate-400">Best: {metadata.bestTimeToVisit}</span>
            )}
          </div>
        </div>

        {/* Match badge */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
            destination
          </span>
          <span className="text-xs text-slate-400">{scorePercent}% match</span>
        </div>

        {/* Arrow */}
        <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Activity result item
// ---------------------------------------------------------------------------

function ActivityResultItem({ result }: { result: ActivityResult }) {
  const { metadata } = result;
  const scorePercent = Math.round(result.score * 100);

  return (
    <Link href={`/activities/${result.id}`}>
      <motion.div
        whileHover={{ x: 4 }}
        className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
      >
        {/* Icon */}
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-2xl">
          📍
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 dark:text-white truncate">
            {result.name}
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            {metadata.description
              ? String(metadata.description).slice(0, 80)
              : metadata.category || 'Activity'}
          </p>
          <div className="flex items-center gap-3 mt-1">
            {metadata.category && (
              <span className="text-xs text-slate-400">{metadata.category}</span>
            )}
            {typeof metadata.cost === 'number' && (
              <span className="text-xs text-slate-400">${metadata.cost}</span>
            )}
            {metadata.priceRange && (
              <span className="text-xs text-slate-400">{metadata.priceRange}</span>
            )}
          </div>
        </div>

        {/* Match badge */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
            activity
          </span>
          <span className="text-xs text-slate-400">{scorePercent}% match</span>
        </div>

        {/* Arrow */}
        <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.div>
    </Link>
  );
}

export default SearchResults;
