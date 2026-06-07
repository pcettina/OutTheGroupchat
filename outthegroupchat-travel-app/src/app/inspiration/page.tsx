'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import {
  SearchBar,
  DestinationFilter,
  TripTypeFilter,
} from '@/components/inspiration/InspirationFilters';
import { InspirationGrid } from '@/components/inspiration/InspirationGrid';
import { TrendingActivities } from '@/components/inspiration/TrendingActivities';
import {
  tripTypes,
  type Template,
  type Destination,
  type TrendingActivity,
} from '@/components/inspiration/types';

export default function InspirationPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [trendingActivities, setTrendingActivities] = useState<TrendingActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInspiration = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (selectedType) params.set('tripType', selectedType);
      if (selectedDestination) params.set('destination', selectedDestination);

      const response = await fetch(`/api/inspiration?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setTemplates(data.data.templates);
        setDestinations(data.data.destinations);
        setTrendingActivities(data.data.trending);
      }
    } catch (error) {
      // silently handle fetch error
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedType, selectedDestination]);

  useEffect(() => {
    fetchInspiration();
  }, [fetchInspiration]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedType(null);
    setSelectedDestination(null);
  };

  const hasActiveFilters = Boolean(searchQuery || selectedType || selectedDestination);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />

      <main className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Get Inspired
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Browse trip templates, discover trending activities, and find your next group adventure
            </p>
          </motion.div>

          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            hasActiveFilters={hasActiveFilters}
            clearFilters={clearFilters}
          />

          <DestinationFilter
            destinations={destinations}
            selectedDestination={selectedDestination}
            setSelectedDestination={setSelectedDestination}
          />

          <TripTypeFilter
            tripTypes={tripTypes}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
          />

          <InspirationGrid
            templates={templates}
            isLoading={isLoading}
            clearFilters={clearFilters}
          />

          <TrendingActivities activities={trendingActivities} />

          {/* CTA Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-16 text-center bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-12"
          >
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to plan your trip?
            </h2>
            <p className="text-emerald-100 mb-8 max-w-xl mx-auto">
              Use one of our templates or start from scratch. Either way, your group is going to have an amazing time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/trips/new"
                className="px-8 py-3 bg-white text-emerald-600 rounded-xl font-semibold hover:bg-emerald-50 transition-colors"
              >
                Start Planning
              </a>
              <a
                href="/feed"
                className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors border border-emerald-400"
              >
                Browse Feed
              </a>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
