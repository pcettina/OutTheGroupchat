'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation } from '@/components/Navigation';
import { ActivityCard } from '@/components/social';
import type { Activity } from '@prisma/client';

type ActivityWithRelations = Activity & {
  trip?: { title: string; destination: unknown };
  _count?: { savedBy: number; comments: number; ratings: number };
};

const categories = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'FOOD', label: 'Food', icon: '🍽️' },
  { id: 'ENTERTAINMENT', label: 'Entertainment', icon: '🎭' },
  { id: 'NIGHTLIFE', label: 'Nightlife', icon: '🌙' },
  { id: 'CULTURE', label: 'Culture', icon: '🏛️' },
  { id: 'OUTDOORS', label: 'Outdoors', icon: '🏞️' },
  { id: 'SPORTS', label: 'Sports', icon: '⚽' },
];

export default function DiscoverPage() {
  const [activities, setActivities] = useState<ActivityWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'popular'>('recent');

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (searchQuery) params.set('q', searchQuery);
      params.set('sort', sortBy);
      
      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error('Failed to fetch activities');
      const data = await res.json();
      setActivities(data.data || []);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, searchQuery, sortBy]);

  useEffect(() => {
    const debounce = setTimeout(fetchActivities, 300);
    return () => clearTimeout(debounce);
  }, [fetchActivities]);

  const handleSave = async (activityId: string) => {
    try {
      await fetch(`/api/activities/${activityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save' }),
      });
    } catch (err) {
      console.error('Failed to save activity:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8 max-w-6xl pt-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Discover</h1>
        <p className="text-gray-500">Find activities and experiences from other travelers</p>
      </motion.div>

      {/* Search and filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8 space-y-4"
      >
        {/* Search bar */}
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search activities, destinations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-lg"
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === category.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{category.icon}</span>
              <span className="font-medium">{category.label}</span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {activities.length} {activities.length === 1 ? 'activity' : 'activities'} found
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('recent')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'recent'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortBy('popular')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                sortBy === 'popular'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Popular
            </button>
          </div>
        </div>
      </motion.div>

      {/* Activities grid */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-5 animate-pulse">
              <div className="flex gap-4 mb-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-6xl mb-4 block">🔍</span>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No activities found</h3>
          <p className="text-gray-500">Try adjusting your search or filters</p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            layout
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
              >
                <ActivityCard
                  activity={activity}
                  onSave={handleSave}
                />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
      </main>
    </div>
  );
}

