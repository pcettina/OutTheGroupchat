'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { VenueSearchResult } from '@/types/meetup';

interface SelectedVenue {
  id: string;
  name: string;
  address?: string;
  city: string;
}

interface VenuePickerProps {
  value?: SelectedVenue | null;
  onChange: (venue: SelectedVenue | null) => void;
  className?: string;
}

/**
 * VenuePicker — controlled combobox that searches /api/venues/search.
 *
 * Debounces input by 300 ms before fetching. Shows a dropdown of results,
 * a "No venues found" message when the query returns nothing, and a clear
 * button once a venue is selected.
 */
export function VenuePicker({ value, onChange, className = '' }: VenuePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VenueSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `/api/venues/search?q=${encodeURIComponent(q)}&limit=10`;
      const res = await fetch(url);

      if (!res.ok) {
        setError('Failed to fetch venues');
        setResults([]);
        return;
      }

      const data = (await res.json()) as { success: boolean; venues?: VenueSearchResult[] };
      setResults(data.venues ?? []);
      setOpen(true);
    } catch {
      setError('Failed to fetch venues');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      void search(q);
    }, 300);
  }

  function handleSelect(venue: VenueSearchResult) {
    onChange({
      id: venue.id,
      name: venue.name,
      address: venue.address ?? undefined,
      city: venue.city,
    });
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  // If a venue is selected, show the selected state instead of the input.
  if (value) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 ${className}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{value.name}</p>
          {value.address && (
            <p className="truncate text-xs text-gray-500">{value.address}</p>
          )}
          <p className="truncate text-xs text-gray-400">{value.city}</p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear selected venue"
          className="ml-2 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
        <svg
          className="mr-2 h-4 w-4 shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M16.65 16.65A7.5 7.5 0 1116.65 2a7.5 7.5 0 010 15z" />
        </svg>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="venue-listbox"
          aria-autocomplete="list"
          aria-label="Search venues"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Search venues..."
          className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
        />
        {loading && (
          <svg
            className="ml-2 h-4 w-4 shrink-0 animate-spin text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
      </div>

      {open && (
        <ul
          id="venue-listbox"
          role="listbox"
          aria-label="Venue suggestions"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {error ? (
            <li className="px-4 py-3 text-sm text-red-500">{error}</li>
          ) : results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500">No venues found</li>
          ) : (
            results.map((venue) => (
              <li
                key={venue.id}
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(venue)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(venue); }}
                tabIndex={0}
                className="cursor-pointer px-4 py-3 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
              >
                <p className="text-sm font-medium text-gray-900">{venue.name}</p>
                <p className="text-xs text-gray-500">
                  {[venue.address, venue.city].filter(Boolean).join(' · ')}
                </p>
                <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 capitalize">
                  {venue.category.toLowerCase()}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
