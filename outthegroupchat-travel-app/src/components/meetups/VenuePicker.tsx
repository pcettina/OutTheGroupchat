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
 *
 * Palette: Last Call (brief §3). Sits on `bg-otg-bg-dark` inside the meetup modal,
 * focus ring uses sodium so the picker reads as part of the same form as the
 * sodium-primary Create CTA. Dropdown surface is `bg-otg-maraschino` to separate
 * it visually from the bg-otg-bg-dark input.
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
        setError('Couldn’t load venues.');
        setResults([]);
        return;
      }

      const data = (await res.json()) as { success: boolean; venues?: VenueSearchResult[] };
      setResults(data.venues ?? []);
      setOpen(true);
    } catch {
      setError('Couldn’t load venues.');
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
      <div
        className={`flex items-center gap-2 rounded-lg border border-otg-border bg-otg-bg-dark px-3 py-2 ${className}`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-otg-text-bright">{value.name}</p>
          {value.address && (
            <p className="truncate text-xs text-otg-text-dim">{value.address}</p>
          )}
          <p className="truncate text-xs text-otg-text-dim/80">{value.city}</p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear selected venue"
          className="ml-2 shrink-0 rounded p-1 text-otg-text-dim hover:bg-otg-maraschino hover:text-otg-text-bright focus:outline-none focus:ring-2 focus:ring-otg-sodium transition-colors"
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
      <div className="flex items-center rounded-lg border border-otg-border bg-otg-bg-dark px-3 py-2 focus-within:border-otg-sodium focus-within:ring-1 focus-within:ring-otg-sodium transition-colors">
        <svg
          className="mr-2 h-4 w-4 shrink-0 text-otg-text-dim"
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
          placeholder="Search venues"
          className="w-full bg-transparent text-sm text-otg-text-bright placeholder:text-otg-text-dim/70 focus:outline-none"
        />
        {loading && (
          <svg
            className="ml-2 h-4 w-4 shrink-0 animate-spin text-otg-text-dim"
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
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-otg-border bg-otg-maraschino shadow-lg"
        >
          {error ? (
            <li className="px-4 py-3 text-sm text-otg-danger">{error}</li>
          ) : results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-otg-text-dim">No venues found.</li>
          ) : (
            results.map((venue) => (
              <li
                key={venue.id}
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(venue)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(venue); }}
                tabIndex={0}
                className="cursor-pointer px-4 py-3 hover:bg-otg-bg-dark/60 focus:bg-otg-bg-dark/60 focus:outline-none transition-colors"
              >
                <p className="text-sm font-medium text-otg-text-bright">{venue.name}</p>
                <p className="text-xs text-otg-text-dim">
                  {[venue.address, venue.city].filter(Boolean).join(' · ')}
                </p>
                <span className="mt-1 inline-block rounded-full bg-otg-bg-dark px-2 py-0.5 text-xs text-otg-text-dim ring-1 ring-inset ring-otg-border capitalize">
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
