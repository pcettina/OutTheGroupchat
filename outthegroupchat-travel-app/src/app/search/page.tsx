'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search as SearchIcon, Users } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { SearchFilters, SearchResults, SearchResultsSkeleton } from '@/components/search';
import { EmptyState, ErrorBanner } from '@/components/ui';
import {
  MIN_QUERY_LENGTH,
  buildSearchUrl,
  flattenSearchResults,
  isQueryTooShort,
  parseSearchResponse,
  type SearchResultItem,
  type SearchType,
} from './searchPageLogic';

const DEBOUNCE_MS = 300;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchType>('all');
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isQueryTooShort(query)) {
      setResults(null);
      setError(null);
      return;
    }

    setError(null);
    setResults(null);
    try {
      const res = await fetch(buildSearchUrl({ q: query, type }));
      const body: unknown = await res.json();
      const data = parseSearchResponse(body);

      if (!data) {
        setError('Search is unavailable right now. Try again.');
        return;
      }

      setResults(flattenSearchResults(data));
    } catch {
      setError('Could not run that search. Check your connection and try again.');
    }
  }, [query, type]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [load]);

  const showPrompt = isQueryTooShort(query) && !error;

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-16 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-otg-text-bright">Search</h1>
          <p className="mt-1 text-sm text-otg-text-muted">
            Find people first — then the meetups and venues around them.
          </p>
        </header>

        <label htmlFor="search-query" className="sr-only">
          Search people, meetups and venues
        </label>
        <div className="relative mb-4">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-otg-text-muted"
            aria-hidden="true"
          />
          <input
            id="search-query"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, meetups, venues…"
            autoComplete="off"
            className="w-full rounded-full border border-otg-border bg-otg-bg py-2.5 pl-9 pr-4 text-sm text-otg-text-bright placeholder:text-otg-text-muted focus:border-otg-sodium focus:outline-none"
          />
        </div>

        <SearchFilters value={type} onChange={setType} className="mb-6" />

        {error && (
          <ErrorBanner
            message={error}
            onRetry={load}
            onDismiss={() => setError(null)}
            className="mb-4"
          />
        )}

        {showPrompt ? (
          <EmptyState
            icon={<SearchIcon className="h-8 w-8" aria-hidden="true" />}
            title="Who are you looking for?"
            description={`Type at least ${MIN_QUERY_LENGTH} characters to search people, meetups and venues.`}
          />
        ) : results === null ? (
          !error && <SearchResultsSkeleton />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" aria-hidden="true" />}
            title="No results found"
            description={`Nothing matched “${query.trim()}”. Try another name, or widen the filter.`}
            action={{ label: 'Search everything', onClick: () => setType('all') }}
          />
        ) : (
          <SearchResults results={results} />
        )}
      </main>
    </>
  );
}
