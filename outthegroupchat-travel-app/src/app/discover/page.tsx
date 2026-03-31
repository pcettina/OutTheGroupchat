'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import { ActivityCard } from '@/components/social';
import type { Activity } from '@prisma/client';
import { useAiSearch } from '@/hooks/useAiSearch';
import type { AiSearchActivity, AiSearchDestination } from '@/hooks/useAiSearch';

type ActivityWithRelations = Activity & {
  trip?: { title: string; destination: unknown };
  _count?: { savedBy: number; comments: number; ratings: number };
};

const categories = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'FOOD', label: 'Food', icon: '🍽️' },
  { id: 'ENTERTAINMENT', label: 'Entertainment', icon: '🎭' },
  { id: 'NIGHTLIFE', label: 'Nightlife', icon: '🌙' },
  { id: 'CULTURE', label: 'Culture', icon: '🏛️' },
  { id: 'OUTDOORS', label: 'Outdoors', icon: '🏞️' },
  { id: 'SPORTS', label: 'Sports', icon: '⚽' },
];

const categoryIcons: Record<string, string> = {
  FOOD: '🍽️',
  ENTERTAINMENT: '🎭',
  SPORTS: '⚽',
  NIGHTLIFE: '🌙',
  CULTURE: '🏛️',
  OUTDOORS: '🏞️',
  SHOPPING: '🛍️',
  NATURE: '🌿',
  TRANSPORTATION: '🚌',
  ACCOMMODATION: '🏨',
  OTHER: '📍',
};

const priceRangeLabels: Record<string, string> = {
  BUDGET: '$',
  MODERATE: '$$',
  EXPENSIVE: '$$$',
  LUXURY: '$$$$',
};

function AiActivityCard({ item }: { item: AiSearchActivity }) {
  const icon = item.metadata.category ? (categoryIcons[item.metadata.category] ?? '📍') : '📍';
  const price = item.metadata.priceRange ? priceRangeLabels[item.metadata.priceRange] : null;
  const location = item.metadata.location as { address?: string; city?: string } | null;
  const relevance = Math.round(item.score * 100);

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all"
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center text-2xl">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg truncate">{item.name}</h3>
            {(location?.city || location?.address) && (
              <p className="text-sm text-gray-500 truncate">
                {location.city ?? location.address}
              </p>
            )}
          </div>
        </div>

        {item.metadata.description && (
          <p className="mt-3 text-gray-600 text-sm line-clamp-2">{item.metadata.description}</p>
        )}

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {item.metadata.category && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
              {item.metadata.category.toLowerCase()}
            </span>
          )}
          {price && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {price}
            </span>
          )}
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full ml-auto">
            {relevance}% match
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function AiDestinationCard({ item }: { item: AiSearchDestination }) {
  const relevance = Math.round(item.score * 100);
  const highlights = item.metadata.highlights as string[] | null;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl border border-blue-100 overflow-hidden shadow-sm hover:shadow-md transition-all"
    >
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-2xl">
            🌍
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg truncate">
              {item.city}, {item.country}
            </h3>
            {item.metadata.activityCount > 0 && (
              <p className="text-sm text-gray-500">{item.metadata.activityCount} activities</p>
            )}
          </div>
        </div>

        {item.metadata.description && (
          <p className="mt-3 text-gray-600 text-sm line-clamp-2">{item.metadata.description}</p>
        )}

        {highlights && highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {highlights.slice(0, 3).map((h, i) => (
              <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                {h}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          {item.metadata.bestTimeToVisit && (
            <span className="text-xs text-gray-500">Best: {item.metadata.bestTimeToVisit}</span>
          )}
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full ml-auto">
            {relevance}% match
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function DiscoverPage() {
  const [activities, setActivities] = useState<ActivityWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'popular'>('recent');

  const { results: aiResults, isLoading: aiIsLoading, error: aiError, totalResults: aiTotal, search: aiSearch, reset: aiReset } = useAiSearch();

  const isAiSearch = searchQuery.trim().length > 0;

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (searchQuery) params.set('q', searchQuery);
      params.set('sort', sortBy);

      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error('Failed to fetch activities');
      const data = await res.json();
      setActivities(data.data || []);
    } catch {
      // silently handle fetch error
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, searchQuery, sortBy]);

  // Feed fetch — only when not using AI search
  useEffect(() => {
    if (isAiSearch) return;
    const debounce = setTimeout(fetchActivities, 300);
    return () => clearTimeout(debounce);
  }, [fetchActivities, isAiSearch]);

  // AI search — debounced when query is present
  useEffect(() => {
    if (!isAiSearch) {
      aiReset();
      return;
    }
    const debounce = setTimeout(() => {
      void aiSearch(searchQuery, 'all', undefined, 12);
    }, 500);
    return () => clearTimeout(debounce);
  }, [searchQuery, isAiSearch, aiSearch, aiReset]);

  const handleSave = async (activityId: string) => {
    try {
      await fetch(`/api/activities/${activityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save' }),
      });
    } catch {
      // silently handle save error
    }
  };

  const displayLoading = isAiSearch ? aiIsLoading : isLoading;
  const feedActivityCount = isAiSearch ? aiTotal : activities.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />

      <main className="container mx-auto px-4 py-8 max-w-6xl pt-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Discover</h1>
        <p className="text-gray-500">Find activities and experiences from other travelers</p>
      </motion.div>

      {/* Search and filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8 space-y-4"
      >
        {/* Search bar */}
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search activities, destinations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-lg"
          />
          {isAiSearch && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">
              AI
            </span>
          )}
        </div>

        {/* Category filters — shown only when not in AI search mode */}
        {!isAiSearch && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{category.icon}</span>
                <span className="font-medium">{category.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Sort — shown only when not in AI search mode */}
        {!isAiSearch && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {activities.length} {activities.length === 1 ? 'activity' : 'activities'} found
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('recent')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === 'recent'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Recent
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === 'popular'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Popular
              </button>
            </div>
          </div>
        )}

        {/* AI search results count */}
        {isAiSearch && !aiIsLoading && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {aiTotal} {aiTotal === 1 ? 'result' : 'results'} found via AI search
            </span>
          </div>
        )}
      </motion.div>

      {/* AI search error */}
      {isAiSearch && aiError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm"
        >
          {aiError}
        </motion.div>
      )}

      {/* Content */}
      {displayLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-5 animate-pulse">
              <div className="flex gap-4 mb-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isAiSearch ? (
        /* AI search results */
        feedActivityCount === 0 ? (
          <div className="text-center py-16">
            <span className="text-6xl mb-4 block">🔍</span>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No AI results found</h3>
            <p className="text-gray-500">Try a different search term or check your connection</p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-8">
              {/* Destination results */}
              {aiResults.destinations.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h2 className="text-lg font-semibold text-gray-700 mb-4">Destinations</h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {aiResults.destinations.map((dest, index) => (
                      <motion.div
                        key={dest.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: index * 0.04 }}
                      >
                        <AiDestinationCard item={dest} />
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              )}

              {/* Activity results */}
              {aiResults.activities.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h2 className="text-lg font-semibold text-gray-700 mb-4">Activities</h2>
                  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                    {aiResults.activities.map((activity, index) => (
                      <motion.div
                        key={activity.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: index * 0.04 }}
                        className="break-inside-avoid"
                      >
                        <AiActivityCard item={activity} />
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              )}
            </div>
          </AnimatePresence>
        )
      ) : activities.length === 0 ? (
        /* Feed empty state */
        <div className="text-center py-16">
          <span className="text-6xl mb-4 block">🔍</span>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No activities found</h3>
          <p className="text-gray-500">Try adjusting your search or filters</p>
        </div>
      ) : (
        /* Feed results */
        <AnimatePresence>
          <motion.div
            layout
            className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4"
          >
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                className="break-inside-avoid"
              >
                <ActivityCard
                  activity={activity}
                  onSave={handleSave}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
      </main>
    </div>
  );
}
