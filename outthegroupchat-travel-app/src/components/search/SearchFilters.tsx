'use client';

import { FilterChip } from './FilterChip';
import {
  SEARCH_TYPES,
  SEARCH_TYPE_LABELS,
  type SearchType,
} from '@/app/search/searchPageLogic';

interface SearchFiltersProps {
  /** Currently selected result type. */
  value: SearchType;
  onChange: (value: SearchType) => void;
  className?: string;
}

/**
 * Result-type selector for `/search`. Mirrors the `type` enum accepted by
 * `GET /api/search` (`all | people | meetups | venues`).
 */
export function SearchFilters({ value, onChange, className = '' }: SearchFiltersProps) {
  return (
    <div
      role="group"
      aria-label="Filter results by type"
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {SEARCH_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          aria-pressed={value === type}
          onClick={() => onChange(type)}
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-otg-sodium"
        >
          <FilterChip label={SEARCH_TYPE_LABELS[type]} active={value === type} />
        </button>
      ))}
    </div>
  );
}

export default SearchFilters;
