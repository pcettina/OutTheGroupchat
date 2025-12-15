'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Navigation } from '@/components/Navigation';

interface Template {
  id: string;
  title: string;
  description: string;
  destination: { city: string; country: string };
  duration: number;
  estimatedBudget: { min: number; max: number; currency: string };
  tags: string[];
  highlights: string[];
  image: string;
  rating: number;
  usageCount: number;
}

interface Destination {
  city: string;
  country: string;
  tripCount: number;
  topType: string;
}

interface TrendingActivity {
  id: string;
  name: string;
  description: string;
  category: string;
  destination: string;
  avgRating: number | null;
  saveCount: number;
  commentCount: number;
}

const tripTypes = [
  { value: 'bachelor', label: 'Bachelor Party', emoji: '🎉' },
  { value: 'bachelorette', label: 'Bachelorette', emoji: '👰' },
  { value: 'girls-trip', label: 'Girls Trip', emoji: '💅' },
  { value: 'adventure', label: 'Adventure', emoji: '🏔️' },
  { value: 'relaxation', label: 'Relaxation', emoji: '🧘' },
  { value: 'cultural', label: 'Cultural', emoji: '🎭' },
  { value: 'food', label: 'Food & Drink', emoji: '🍽️' },
  { value: 'nightlife', label: 'Nightlife', emoji: '🌙' },
];

export default function InspirationPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [trendingActivities, setTrendingActivities] = useState<TrendingActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInspiration();
  }, [searchQuery, selectedType, selectedDestination]);

  const fetchInspiration = async () => {
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
      console.error('Failed to fetch inspiration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedType(null);
    setSelectedDestination(null);
  };

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

          {/* Search Bar */}
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
              {(searchQuery || selectedType || selectedDestination) && (
                <button
                  onClick={clearFilters}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
          </motion.div>

          {/* Popular Destinations */}
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

          {/* Trip Types */}
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

          {/* Trip Templates */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-16"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🔥</span> Trip Templates
              </h2>
              <span className="text-sm text-slate-500">
                {templates.length} template{templates.length !== 1 ? 's' : ''}
              </span>
            </div>

            {isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-lg animate-pulse">
                    <div className="h-48 bg-slate-200 dark:bg-slate-700" />
                    <div className="p-5">
                      <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : templates.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template, index) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 group cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    {/* Image */}
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={template.image}
                        alt={template.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-3 right-3">
                        <div className="flex items-center gap-2 text-white/90 text-sm">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {template.rating}
                          </span>
                          <span>•</span>
                          <span>{template.usageCount} trips</span>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                        {template.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
                        {template.description}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {template.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                        <span>{template.duration} days</span>
                        <span>
                          ${template.estimatedBudget.min}-${template.estimatedBudget.max}/person
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-500 dark:text-slate-400">
                  No templates match your filters. Try adjusting your search.
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-4 text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </motion.section>

          {/* Trending Activities */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <span>⭐</span> Trending Activities
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {trendingActivities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + index * 0.05 }}
                  className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow hover:shadow-lg transition-shadow border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                      {activity.category}
                    </span>
                    {activity.avgRating && (
                      <span className="flex items-center gap-1 text-sm text-amber-500">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {activity.avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <h4 className="font-medium text-slate-900 dark:text-white mb-1">
                    {activity.name}
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
                    {activity.description}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      {activity.saveCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {activity.commentCount}
                    </span>
                    <span className="ml-auto">{activity.destination}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

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

