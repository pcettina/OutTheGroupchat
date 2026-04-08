'use client';

import { motion, AnimatePresence } from 'framer-motion';

// Internal activity result from /api/discover/search
export interface InternalSearchResult {
  id: string;
  type: 'internal';
  name: string;
  description: string | null;
  category: string;
  location: string | null;
  cost: number | null;
  currency: string | null;
  priceRange: string | null;
  trip: { title: string; destination: unknown } | null;
  engagement: {
    saves: number;
    comments: number;
    ratings: number;
  };
  createdAt: string;
}

// External activity result from /api/discover/search
export interface ExternalSearchResult {
  id: string;
  type: 'external';
  externalId: string;
  source: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  location: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    city: string | null;
    country: string | null;
  };
  rating: number | null;
  ratingCount: number | null;
  priceLevel: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  websiteUrl: string | null;
}

export type SearchResult = InternalSearchResult | ExternalSearchResult;

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 animate-pulse border border-slate-200 dark:border-slate-700">
      <div className="flex gap-3 mb-4">
        <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
      </div>
      <div className="flex gap-2 mt-4">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-16" />
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-20" />
      </div>
    </div>
  );
}

function InternalResultCard({ result }: { result: InternalSearchResult }) {
  const categoryColors: Record<string, string> = {
    FOOD: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    CULTURE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    SHOPPING: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    NATURE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    ENTERTAINMENT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    SPORTS: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    NIGHTLIFE: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    TRANSPORTATION: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400',
    ACCOMMODATION: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
  };
  const categoryColor = categoryColors[result.category] ?? categoryColors.OTHER;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-2xl flex-shrink-0">
          {result.category === 'FOOD' ? '🍽️'
            : result.category === 'CULTURE' ? '🏛️'
            : result.category === 'NATURE' ? '🌿'
            : result.category === 'ENTERTAINMENT' ? '🎭'
            : result.category === 'NIGHTLIFE' ? '🌙'
            : result.category === 'SPORTS' ? '⚽'
            : result.category === 'SHOPPING' ? '🛍️'
            : result.category === 'ACCOMMODATION' ? '🏨'
            : result.category === 'TRANSPORTATION' ? '🚗'
            : '✨'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{result.name}</h3>
          {result.location && (
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              {result.location}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {result.description && (
        <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-3">
          {result.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor}`}>
            {result.category}
          </span>
          {result.trip && (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
              from {result.trip.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span title="Saves">♡ {result.engagement.saves}</span>
          <span title="Comments">💬 {result.engagement.comments}</span>
        </div>
      </div>
    </motion.div>
  );
}

function ExternalResultCard({ result }: { result: ExternalSearchResult }) {
  const locationLabel = [result.location.city, result.location.country]
    .filter(Boolean)
    .join(', ');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 overflow-hidden flex-shrink-0">
          {result.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.thumbnailUrl}
              alt={result.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              🌐
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{result.name}</h3>
          {locationLabel && (
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              {locationLabel}
            </p>
          )}
        </div>
        {result.rating !== null && (
          <div className="flex-shrink-0 flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
            <span>⭐</span>
            <span>{result.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {result.description && (
        <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-3">
          {result.description}
        </p>
      )}

      {/* Tags */}
      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {result.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        {result.category && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            {result.category}
          </span>
        )}
        {result.websiteUrl && (
          <a
            href={result.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Visit site →
          </a>
        )}
      </div>
    </motion.div>
  );
}

export function SearchResults({ results, isLoading, error, onRetry }: SearchResultsProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-16">
        <span className="text-5xl mb-4 block">⚠️</span>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Search failed
        </h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // Empty state
  if (results.length === 0) {
    return (
      <div className="text-center py-16">
        <span className="text-5xl mb-4 block">🔍</span>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          No results found
        </h3>
        <p className="text-slate-500 dark:text-slate-400">
          No results found. Try a different search.
        </p>
      </div>
    );
  }

  // Results grid
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        layout
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {results.map((result) =>
          result.type === 'internal' ? (
            <InternalResultCard key={result.id} result={result} />
          ) : (
            <ExternalResultCard key={result.id} result={result} />
          )
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default SearchResults;
