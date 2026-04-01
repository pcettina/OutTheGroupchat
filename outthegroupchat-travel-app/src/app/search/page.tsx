'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SearchResults } from '@/components/search/SearchResults';
import type { SearchFilters as SearchFiltersType, SearchType } from '@/components/search/SearchFilters';
import type { AiSearchResults } from '@/components/search/SearchResults';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchApiResponse {
  success: boolean;
  data: AiSearchResults;
  meta: {
    query: string;
    type: string;
    totalResults: number;
  };
  error?: string;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SearchPage() {
  const { data: session, status } = useSession();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [filters, setFilters] = useState<SearchFiltersType>({});
  const [results, setResults] = useState<AiSearchResults>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (query: string, type: SearchType) => {
      if (!query.trim()) {
        setResults({});
        setHasSearched(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q: query, type });
        const res = await fetch(`/api/ai/search?${params.toString()}`);

        if (res.status === 401) {
          setError('You must be signed in to use AI search.');
          setResults({});
          return;
        }

        if (res.status === 429) {
          setError('Too many requests. Please wait a moment and try again.');
          setResults({});
          return;
        }

        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          setError(json.error ?? 'Search failed. Please try again.');
          setResults({});
          return;
        }

        const json = (await res.json()) as SearchApiResponse;

        if (!json.success) {
          setError(json.error ?? 'Search failed. Please try again.');
          setResults({});
          return;
        }

        setResults(json.data);
        setHasSearched(true);
      } catch {
        setError('Network error. Please check your connection and try again.');
        setResults({});
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Debounced search on query/type change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (status === 'authenticated') {
        runSearch(searchQuery, searchType);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchType, runSearch, status]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'authenticated') {
      runSearch(searchQuery, searchType);
    }
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  // ---------------------------------------------------------------------------
  // Auth gate
  // ---------------------------------------------------------------------------

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
        <Navigation />
        <main className="container mx-auto px-4 py-24 max-w-2xl flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <span className="text-6xl">🔍</span>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">AI-Powered Search</h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">
              Sign in to search activities and destinations with semantic AI matching.
            </p>
            <button
              onClick={() => signIn()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
            >
              Sign in to search
            </button>
          </motion.div>
        </main>
      </div>
    );
  }

  // Loading auth state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
        <Navigation />
        <main className="container mx-auto px-4 py-24 max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
            <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Authenticated view
  // ---------------------------------------------------------------------------

  const totalResults = (results.activities?.length ?? 0) + (results.destinations?.length ?? 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />

      <main className="container mx-auto px-4 py-8 max-w-3xl pt-24">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">AI Search</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Semantic search across activities and destinations — powered by AI.
          </p>
        </motion.div>

        {/* Search form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <form onSubmit={handleSubmit} role="search">
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="search"
                placeholder="Search for beach activities, cultural destinations, hiking spots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-lg text-slate-900 dark:text-white placeholder:text-slate-400"
                aria-label="Search query"
                autoFocus
              />
              {isLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <svg
                    className="animate-spin w-5 h-5 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-label="Searching..."
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
            </div>
          </form>
        </motion.div>

        {/* Filters (includes search-type selector) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <SearchFilters
            filters={filters}
            onFiltersChange={setFilters}
            onClear={handleClearFilters}
            searchType={searchType}
            onSearchTypeChange={(type) => {
              setSearchType(type);
            }}
          />
        </motion.div>

        {/* Result count + session user hint */}
        {hasSearched && !isLoading && !error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-slate-500 dark:text-slate-400 mb-4"
          >
            {totalResults === 0
              ? `No results for "${searchQuery}"`
              : `${totalResults} result${totalResults !== 1 ? 's' : ''} for "${searchQuery}"`}
          </motion.p>
        )}

        {/* Error state */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm"
            role="alert"
          >
            {error}
          </motion.div>
        )}

        {/* Results */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <SearchResults
            results={results}
            isLoading={isLoading}
            query={hasSearched ? searchQuery : ''}
          />
        </motion.div>

        {/* Empty / idle state — before first search */}
        {!hasSearched && !isLoading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 text-slate-400"
          >
            <span className="text-5xl mb-4 block">✨</span>
            <p className="text-lg font-medium text-slate-600 dark:text-slate-400">
              Start typing to discover activities and destinations
            </p>
            <p className="text-sm mt-1 text-slate-400">
              Try &quot;beach hiking&quot;, &quot;street food markets&quot;, or &quot;romantic getaway&quot;
            </p>
            {session?.user?.name && (
              <p className="text-xs mt-4 text-slate-400">
                Signed in as {session.user.name}
              </p>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
