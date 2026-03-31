'use client';

import { useState, useCallback } from 'react';
import { ActivityCategory, PriceRange } from '@prisma/client';

export interface AiSearchActivity {
  id: string;
  name: string;
  score: number;
  metadata: {
    description: string | null;
    category: ActivityCategory | null;
    cost: number | null;
    priceRange: PriceRange | null;
    location: unknown;
    ratingCount: number;
  };
}

export interface AiSearchDestination {
  id: string;
  city: string;
  country: string;
  score: number;
  metadata: {
    description: string | null;
    highlights: unknown;
    topCategories: string[];
    activityCount: number;
    averageRating: number | null;
    bestTimeToVisit: string | null;
    averageBudget: number | null;
  };
}

export interface AiSearchResults {
  activities: AiSearchActivity[];
  destinations: AiSearchDestination[];
}

export interface AiSearchFilters {
  category?: ActivityCategory;
  priceRange?: PriceRange;
  minRating?: number;
}

export type AiSearchType = 'activities' | 'destinations' | 'all';

interface UseAiSearchReturn {
  results: AiSearchResults;
  isLoading: boolean;
  error: string | null;
  totalResults: number;
  search: (query: string, type?: AiSearchType, filters?: AiSearchFilters, limit?: number) => Promise<void>;
  reset: () => void;
}

const EMPTY_RESULTS: AiSearchResults = { activities: [], destinations: [] };

export function useAiSearch(): UseAiSearchReturn {
  const [results, setResults] = useState<AiSearchResults>(EMPTY_RESULTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);

  const search = useCallback(
    async (
      query: string,
      type: AiSearchType = 'all',
      filters?: AiSearchFilters,
      limit = 10,
    ) => {
      if (!query.trim()) {
        setResults(EMPTY_RESULTS);
        setTotalResults(0);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim(), type, limit, filters }),
        });

        if (res.status === 401) {
          setError('Please sign in to use AI search.');
          setResults(EMPTY_RESULTS);
          setTotalResults(0);
          return;
        }

        if (res.status === 429) {
          setError('Too many requests. Please wait a moment before searching again.');
          setResults(EMPTY_RESULTS);
          setTotalResults(0);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Search failed' }));
          setError((body as { error?: string }).error ?? 'Search failed');
          setResults(EMPTY_RESULTS);
          setTotalResults(0);
          return;
        }

        const body = await res.json() as {
          success: boolean;
          data: {
            activities?: AiSearchActivity[];
            destinations?: AiSearchDestination[];
          };
          meta: { totalResults: number };
        };

        if (!body.success) {
          setError('Search returned an unexpected response.');
          setResults(EMPTY_RESULTS);
          setTotalResults(0);
          return;
        }

        setResults({
          activities: body.data.activities ?? [],
          destinations: body.data.destinations ?? [],
        });
        setTotalResults(body.meta.totalResults);
      } catch {
        setError('Failed to connect to search service.');
        setResults(EMPTY_RESULTS);
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setResults(EMPTY_RESULTS);
    setTotalResults(0);
    setError(null);
    setIsLoading(false);
  }, []);

  return { results, isLoading, error, totalResults, search, reset };
}
