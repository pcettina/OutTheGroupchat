'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FilterChip } from './FilterChip';

export interface SearchFilters {
  destination?: string;
  dateRange?: { start: string; end: string };
  budgetRange?: { min: number; max: number };
  tripType?: string[];
  groupSize?: { min: number; max: number };
  activities?: string[];
}

interface SearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onClear: () => void;
  className?: string;
}

const tripTypes = [
  { id: 'adventure', label: 'Adventure', icon: '🏔️' },
  { id: 'relaxation', label: 'Relaxation', icon: '🏖️' },
  { id: 'cultural', label: 'Cultural', icon: '🏛️' },
  { id: 'party', label: 'Party', icon: '🎉' },
  { id: 'food', label: 'Food & Wine', icon: '🍷' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
];

const activityOptions = [
  'Hiking', 'Beaches', 'Nightlife', 'Museums', 'Food Tours',
  'Water Sports', 'Shopping', 'Nature', 'Photography', 'Spa',
];

export function SearchFilters({
  filters,
  onFiltersChange,
  onClear,
  className = '',
}: SearchFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const removeFilter = (key: keyof SearchFilters) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onFiltersChange(newFilters);
  };

  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof SearchFilters] !== undefined
  ).length;

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 ${className}`}>
      {/* Filter Header */}
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={onClear}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Clear all
            </button>
          )}
          <motion.svg
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="w-5 h-5 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </div>

      {/* Active Filters */}
      {activeFilterCount > 0 && !isExpanded && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {filters.destination && (
            <FilterChip
              label={filters.destination}
              icon="📍"
              onRemove={() => removeFilter('destination')}
            />
          )}
          {filters.tripType?.map((type) => (
            <FilterChip
              key={type}
              label={tripTypes.find((t) => t.id === type)?.label || type}
              icon={tripTypes.find((t) => t.id === type)?.icon}
              onRemove={() => updateFilter('tripType', filters.tripType?.filter((t) => t !== type))}
            />
          ))}
          {filters.budgetRange && (
            <FilterChip
              label={`$${filters.budgetRange.min} - $${filters.budgetRange.max}`}
              icon="💰"
              onRemove={() => removeFilter('budgetRange')}
            />
          )}
          {filters.activities?.map((activity) => (
            <FilterChip
              key={activity}
              label={activity}
              onRemove={() => updateFilter('activities', filters.activities?.filter((a) => a !== activity))}
            />
          ))}
        </div>
      )}

      {/* Expanded Filters */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-6 border-t border-slate-200 dark:border-slate-700 pt-4">
              {/* Trip Types */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Trip Type
                </h4>
                <div className="flex flex-wrap gap-2">
                  {tripTypes.map((type) => {
                    const isSelected = filters.tripType?.includes(type.id);
                    return (
                      <button
                        key={type.id}
                        onClick={() => {
                          const current = filters.tripType || [];
                          updateFilter(
                            'tripType',
                            isSelected
                              ? current.filter((t) => t !== type.id)
                              : [...current, type.id]
                          );
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-500'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <span>{type.icon}</span>
                        <span>{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Budget Range */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Budget per Person
                </h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Min</label>
                    <input
                      type="number"
                      value={filters.budgetRange?.min || ''}
                      onChange={(e) => updateFilter('budgetRange', {
                        min: Number(e.target.value),
                        max: filters.budgetRange?.max || 10000,
                      })}
                      placeholder="$0"
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm"
                    />
                  </div>
                  <span className="text-slate-400 mt-5">—</span>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Max</label>
                    <input
                      type="number"
                      value={filters.budgetRange?.max || ''}
                      onChange={(e) => updateFilter('budgetRange', {
                        min: filters.budgetRange?.min || 0,
                        max: Number(e.target.value),
                      })}
                      placeholder="$10,000"
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Group Size */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Group Size
                </h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Min</label>
                    <input
                      type="number"
                      value={filters.groupSize?.min || ''}
                      onChange={(e) => updateFilter('groupSize', {
                        min: Number(e.target.value),
                        max: filters.groupSize?.max || 20,
                      })}
                      placeholder="2"
                      min={1}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm"
                    />
                  </div>
                  <span className="text-slate-400 mt-5">—</span>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">Max</label>
                    <input
                      type="number"
                      value={filters.groupSize?.max || ''}
                      onChange={(e) => updateFilter('groupSize', {
                        min: filters.groupSize?.min || 1,
                        max: Number(e.target.value),
                      })}
                      placeholder="20"
                      max={50}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Activities */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Activities
                </h4>
                <div className="flex flex-wrap gap-2">
                  {activityOptions.map((activity) => {
                    const isSelected = filters.activities?.includes(activity);
                    return (
                      <button
                        key={activity}
                        onClick={() => {
                          const current = filters.activities || [];
                          updateFilter(
                            'activities',
                            isSelected
                              ? current.filter((a) => a !== activity)
                              : [...current, activity]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          isSelected
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {activity}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SearchFilters;
