'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import type { Activity } from '@prisma/client';

interface ActivityCardProps {
  activity: Activity & {
    trip?: { title: string; destination: unknown };
    _count?: { savedBy: number; comments: number; ratings: number };
  };
  onSave?: (id: string) => void;
  isSaved?: boolean;
}

export default function ActivityCard({ activity, onSave, isSaved = false }: ActivityCardProps) {
  const [saved, setSaved] = useState(isSaved);
  const [saveCount, setSaveCount] = useState(activity._count?.savedBy || 0);

  const handleSave = () => {
    setSaved(!saved);
    setSaveCount(prev => saved ? prev - 1 : prev + 1);
    onSave?.(activity.id);
  };

  const location = activity.location as { address?: string } | null;
  const destination = activity.trip?.destination as { city: string } | undefined;

  const categoryIcons: Record<string, string> = {
    FOOD: '🍽️',
    ENTERTAINMENT: '🎭',
    SPORTS: '⚽',
    NIGHTLIFE: '🌙',
    CULTURE: '🏛️',
    OUTDOORS: '🏞️',
    SHOPPING: '🛍️',
  };

  const priceRangeLabels: Record<string, string> = {
    BUDGET: '$',
    MODERATE: '$$',
    EXPENSIVE: '$$$',
    LUXURY: '$$$$',
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-all"
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center text-2xl">
            {categoryIcons[activity.category || 'ENTERTAINMENT'] || '📍'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg truncate">{activity.name}</h3>
            {destination && (
              <p className="text-gray-500 text-sm flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {destination.city}
              </p>
            )}
          </div>
          {activity.priceRange && (
            <span className="text-sm font-medium text-gray-600">
              {priceRangeLabels[activity.priceRange] || activity.priceRange}
            </span>
          )}
        </div>

        {/* Description */}
        {activity.description && (
          <p className="mt-3 text-gray-600 line-clamp-2">{activity.description}</p>
        )}

        {/* Details */}
        <div className="flex flex-wrap gap-3 mt-4">
          {activity.duration && (
            <span className="inline-flex items-center gap-1 text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {activity.duration} min
            </span>
          )}
          {activity.cost && (
            <span className="inline-flex items-center gap-1 text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ${activity.cost}
            </span>
          )}
          {location?.address && (
            <span className="inline-flex items-center gap-1 text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full truncate max-w-[200px]">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {location.address}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {activity._count?.comments || 0}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            {activity._count?.ratings || 0}
          </span>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            saved
              ? 'bg-primary text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-primary hover:text-primary'
          }`}
        >
          <svg
            className="w-4 h-4"
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          {saveCount}
        </button>
      </div>
    </motion.div>
  );
}

