'use client';

import { motion } from 'framer-motion';
import type { Destination, TripType } from './types';

interface SearchBarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

export function SearchBar({
  searchQuery,
  setSearchQuery,
  hasActiveFilters,
  clearFilters,
}: SearchBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="max-w-2xl mx-auto mb-8"
    >
      <div className="relative">
        <input
          type="text"
          placeholder="Search destinations, trip types, activities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-6 py-4 pl-14 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <svg
          className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Clear
          </button>
        )}
      </div>
    </motion.div>
  );
}

interface DestinationFilterProps {
  destinations: Destination[];
  selectedDestination: string | null;
  setSelectedDestination: (value: string | null) => void;
}

export function DestinationFilter({
  destinations,
  selectedDestination,
  setSelectedDestination,
}: DestinationFilterProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-12"
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span>📍</span> Popular Destinations
      </h2>
      <div className="flex flex-wrap gap-3">
        {destinations.map((dest) => (
          <button
            key={dest.city}
            onClick={() => setSelectedDestination(selectedDestination === dest.city ? null : dest.city)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              selectedDestination === dest.city
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow hover:shadow-md border border-slate-200 dark:border-slate-700'
            }`}
          >
            {dest.city}
            <span className="ml-2 text-xs opacity-70">{dest.tripCount}+ trips</span>
          </button>
        ))}
      </div>
    </motion.section>
  );
}

interface TripTypeFilterProps {
  tripTypes: TripType[];
  selectedType: string | null;
  setSelectedType: (value: string | null) => void;
}

export function TripTypeFilter({
  tripTypes,
  selectedType,
  setSelectedType,
}: TripTypeFilterProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mb-12"
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <span>🏷️</span> Trip Types
      </h2>
      <div className="flex flex-wrap gap-3">
        {tripTypes.map((type) => (
          <button
            key={type.value}
            onClick={() => setSelectedType(selectedType === type.value ? null : type.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              selectedType === type.value
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow hover:shadow-md border border-slate-200 dark:border-slate-700'
            }`}
          >
            <span>{type.emoji}</span>
            {type.label}
          </button>
        ))}
      </div>
    </motion.section>
  );
}
