'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { StepProps } from '../TripWizard';
import type { Destination } from '@/types';

// Popular destinations for quick selection
const popularDestinations: Destination[] = [
  { city: 'Miami', country: 'USA', coordinates: { lat: 25.7617, lng: -80.1918 } },
  { city: 'Cancun', country: 'Mexico', coordinates: { lat: 21.1619, lng: -86.8515 } },
  { city: 'Las Vegas', country: 'USA', coordinates: { lat: 36.1699, lng: -115.1398 } },
  { city: 'Nashville', country: 'USA', coordinates: { lat: 36.1627, lng: -86.7816 } },
  { city: 'New Orleans', country: 'USA', coordinates: { lat: 29.9511, lng: -90.0715 } },
  { city: 'Austin', country: 'USA', coordinates: { lat: 30.2672, lng: -97.7431 } },
  { city: 'Barcelona', country: 'Spain', coordinates: { lat: 41.3851, lng: 2.1734 } },
  { city: 'Amsterdam', country: 'Netherlands', coordinates: { lat: 52.3676, lng: 4.9041 } },
];

export function DestinationStep({ data, onUpdate, onNext }: StepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Destination[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Handle click outside to close results
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      // Mock search - in production, this would call a geocoding API
      const query = searchQuery.toLowerCase();
      const results = popularDestinations.filter(
        (dest) =>
          dest.city.toLowerCase().includes(query) ||
          dest.country.toLowerCase().includes(query)
      );

      // Add the search query as a custom destination if no exact matches
      if (results.length === 0 && searchQuery.length > 2) {
        results.push({
          city: searchQuery,
          country: 'Custom Location',
        });
      }

      setSearchResults(results);
      setShowResults(true);
      setIsSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelectDestination = (destination: Destination) => {
    onUpdate({
      destination,
      title: `Trip to ${destination.city}`,
    });
    setSearchQuery(`${destination.city}, ${destination.country}`);
    setShowResults(false);
  };

  const canProceed = data.destination !== null;

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div ref={searchRef} className="relative">
        <label
          htmlFor="destination-search"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
        >
          Search for a destination
        </label>
        <div className="relative">
          <input
            id="destination-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            placeholder="e.g., Miami, Barcelona, Tokyo..."
            className="w-full px-4 py-3 pl-12 rounded-xl bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
            aria-label="Search destination"
            autoComplete="off"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            {isSearching ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute z-20 w-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
          >
            {searchResults.map((dest, index) => (
              <button
                key={`${dest.city}-${dest.country}-${index}`}
                onClick={() => handleSelectDestination(dest)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                  {dest.city.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{dest.city}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{dest.country}</p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </div>

      {/* Selected Destination */}
      {data.destination && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-xl font-bold">
              {data.destination.city.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {data.destination.city}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {data.destination.country}
              </p>
            </div>
            <button
              onClick={() => {
                onUpdate({ destination: null });
                setSearchQuery('');
              }}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              aria-label="Remove destination"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}

      {/* Popular Destinations */}
      <div>
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Popular Destinations
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {popularDestinations.slice(0, 8).map((dest) => (
            <motion.button
              key={`${dest.city}-${dest.country}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelectDestination(dest)}
              className={`p-3 rounded-xl border-2 transition-all text-left ${
                data.destination?.city === dest.city
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'
              }`}
            >
              <p className="font-medium text-slate-900 dark:text-white text-sm">{dest.city}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{dest.country}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Trip Title (Optional) */}
      <div>
        <label
          htmlFor="trip-title"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
        >
          Trip Name (optional)
        </label>
        <input
          id="trip-title"
          type="text"
          value={data.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder={data.destination ? `Trip to ${data.destination.city}` : 'Give your trip a name'}
          className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          disabled={!canProceed}
          className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            canProceed
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          Continue
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
