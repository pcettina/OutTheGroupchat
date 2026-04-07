'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import { SearchResults } from '@/components/discover/SearchResults';
import type { SearchResult } from '@/components/discover/SearchResults';
import { logger } from '@/lib/logger';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'FOOD', label: 'Food', icon: '🍽️' },
  { id: 'ENTERTAINMENT', label: 'Entertainment', icon: '🎭' },
  { id: 'NIGHTLIFE', label: 'Nightlife', icon: '🌙' },
  { id: 'CULTURE', label: 'Culture', icon: '🏛️' },
  { id: 'NATURE', label: 'Nature', icon: '🏞️' },
  { id: 'SPORTS', label: 'Sports', icon: '⚽' },
  { id: 'SHOPPING', label: 'Shopping', icon: '🛍️' },
  { id: 'ACCOMMODATION', label: 'Accommodation', icon: '🏨' },
  { id: 'TRANSPORTATION', label: 'Transportation', icon: '🚌' },
];

interface DiscoverSearchResponse {
  success: boolean;
  data: {
    internal: SearchResult[];
    external: SearchResult[];
    total: number;
    query: {
      q: string;
      city: string;
      category: string;
      limit: number;
      offset: number;
    };
  };
}

export default function DiscoverPage() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [totalCount, setTotalCount] = useState(0);

  // Track the latest fetch so stale responses don't overwrite newer ones
  const latestFetchRef = useRef<number>(0);

  const fetchResults = useCallback(async () => {
    const fetchId = Date.now();
    latestFetchRef.current = fetchId;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      params.set('limit', '30');

      logger.debug({ query: searchQuery, category: selectedCategory }, '[DISCOVER] Fetching search results');

      const res = await fetch(`/api/discover/search?${params.toString()}`);

      // Ignore stale responses
      if (latestFetchRef.current !== fetchId) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        const message = (body as { error?: string }).error ?? `Request failed with status ${res.status}`;
        logger.error({ status: res.status, message }, '[DISCOVER] Search request failed');
        setError(message);
        setResults([]);
        setHasSearched(true);
        return;
      }

      const data: DiscoverSearchResponse = await res.json();

      if (!data.success) {
        logger.error({ data }, '[DISCOVER] Search returned success=false');
        setError('Search failed. Please try again.');
        setResults([]);
        setHasSearched(true);
        return;
      }

      const combined: SearchResult[] = [
        ...(data.data.internal as SearchResult[]),
        ...(data.data.external as SearchResult[]),
      ];

      logger.debug(
        { total: data.data.total, internal: data.data.internal.length, external: data.data.external.length },
        '[DISCOVER] Search results received'
      );

      setResults(combined);
      setTotalCount(data.data.total);
      setHasSearched(true);
    } catch (err) {
      if (latestFetchRef.current !== fetchId) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch results';
      logger.error({ err }, '[DISCOVER] Unexpected error during search');
      setError(message);
      setResults([]);
      setHasSearched(true);
    } finally {
      if (latestFetchRef.current === fetchId) {
        setIsLoading(false);
      }
    }
  }, [searchQuery, selectedCategory]);

  // Debounce search: fire 400ms after the user stops typing/changing filters
  useEffect(() => {
    // Only trigger if there's a query or a category filter (avoid fetching on empty page load)
    if (!searchQuery.trim() && selectedCategory === 'all') {
      setHasSearched(false);
      setResults([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    const timer = setTimeout(fetchResults, 400);
    return () => clearTimeout(timer);
  }, [fetchResults, searchQuery, selectedCategory]);

  const handleRetry = useCallback(() => {
    fetchResults();
  }, [fetchResults]);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

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
          <p className="text-gray-500">
            Search activities and experiences from travelers and around the world
          </p>
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
              placeholder="Search activities, destinations, cities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-lg"
              aria-label="Search activities and destinations"
            />
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Category filters */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategorySelect(category.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                aria-pressed={selectedCategory === category.id}
              >
                <span>{category.icon}</span>
                <span className="font-medium">{category.label}</span>
              </button>
            ))}
          </div>

          {/* Result count */}
          {hasSearched && !isLoading && !error && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {totalCount} {totalCount === 1 ? 'result' : 'results'} found
              </span>
            </div>
          )}
        </motion.div>

        {/* Results */}
        <SearchResults
          results={results}
          isLoading={isLoading}
          error={error}
          hasSearched={hasSearched}
          onRetry={handleRetry}
        />
      </main>
    </div>
  );
}
