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
  priceLevel: number | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  websiteUrl: string | null;
}

export type SearchResult = InternalSearchResult | ExternalSearchResult;

interface SearchResultCardProps {
  result: SearchResult;
}

function InternalResultCard({ result }: { result: InternalSearchResult }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-emerald-600 text-lg">🎯</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{result.name}</h3>
          {result.trip && (
            <p className="text-sm text-emerald-600 truncate">
              {result.trip.title}
            </p>
          )}
        </div>
        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full whitespace-nowrap flex-shrink-0">
          {result.category}
        </span>
      </div>

      {result.description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {result.description}
        </p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-400">
        {result.location && (
          <span className="flex items-center gap-1">
            <span>📍</span>
            <span className="truncate">{result.location}</span>
          </span>
        )}
        {result.cost !== null && result.cost !== undefined && (
          <span className="flex items-center gap-1">
            <span>💰</span>
            <span>
              {result.currency ?? '$'}{result.cost}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <span>{result.engagement.saves} saves</span>
        <span>{result.engagement.comments} comments</span>
        <span>{result.engagement.ratings} ratings</span>
        <span className="ml-auto text-gray-300">Community</span>
      </div>
    </div>
  );
}

function ExternalResultCard({ result }: { result: ExternalSearchResult }) {
  const locationParts = [result.location.city, result.location.country].filter(Boolean);
  const locationText = locationParts.join(', ');

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 mb-3">
        {result.thumbnailUrl || result.imageUrl ? (
          <div
            className="w-10 h-10 rounded-xl bg-cover bg-center flex-shrink-0"
            style={{ backgroundImage: `url(${result.thumbnailUrl ?? result.imageUrl})` }}
          />
        ) : (
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-teal-600 text-lg">🌍</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{result.name}</h3>
          {result.source && (
            <p className="text-sm text-gray-400 truncate capitalize">{result.source}</p>
          )}
        </div>
        {result.category && (
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full whitespace-nowrap flex-shrink-0">
            {result.category}
          </span>
        )}
      </div>

      {result.description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {result.description}
        </p>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
        {locationText && (
          <span className="flex items-center gap-1">
            <span>📍</span>
            <span>{locationText}</span>
          </span>
        )}
        {result.rating !== null && result.rating !== undefined && (
          <span className="flex items-center gap-1">
            <span>⭐</span>
            <span>{result.rating.toFixed(1)}</span>
            {result.ratingCount !== null && result.ratingCount !== undefined && (
              <span>({result.ratingCount})</span>
            )}
          </span>
        )}
        {result.priceLevel !== null && result.priceLevel !== undefined && (
          <span>{'$'.repeat(result.priceLevel)}</span>
        )}
        {result.websiteUrl && (
          <a
            href={result.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-emerald-600 hover:underline"
          >
            Visit site
          </a>
        )}
      </div>

      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
          {result.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({ result }: SearchResultCardProps) {
  if (result.type === 'internal') {
    return <InternalResultCard result={result} />;
  }
  return <ExternalResultCard result={result} />;
}

export function SearchResultsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse">
          <div className="flex gap-3 mb-3">
            <div className="w-10 h-10 bg-gray-200 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
          <div className="space-y-2 mb-3">
            <div className="h-3 bg-gray-200 rounded" />
            <div className="h-3 bg-gray-200 rounded w-4/5" />
          </div>
          <div className="flex gap-3">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  onRetry: () => void;
}

export function SearchResults({
  results,
  isLoading,
  error,
  hasSearched,
  onRetry,
}: SearchResultsProps) {
  if (isLoading) {
    return <SearchResultsSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <span className="text-6xl mb-4 block">⚠️</span>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h3>
        <p className="text-gray-500 mb-6">{error}</p>
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  if (hasSearched && results.length === 0) {
    return (
      <div className="text-center py-16">
        <span className="text-6xl mb-4 block">🔍</span>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No results found</h3>
        <p className="text-gray-500">Try adjusting your search or category filters</p>
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div className="text-center py-16">
        <span className="text-6xl mb-4 block">✨</span>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Search to discover</h3>
        <p className="text-gray-500">Enter a destination, activity, or category above to get started</p>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        layout
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {results.map((result, index) => (
          <motion.div
            key={result.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.04 }}
          >
            <SearchResultCard result={result} />
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

export default SearchResults;
