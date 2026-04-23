'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripPayload {
  id: string;
  title: string;
  destination: { city: string; country: string };
  status: string;
  coverImage?: string;
  startDate?: string;
  endDate?: string;
}

export interface ActivityPayload {
  id: string;
  name: string;
  category: string;
  description: string | null;
  cost?: number;
}

export interface LegacyTripCardProps {
  safeTripId: string;
  safeTripCoverImage: string;
  safeTripTitle: string;
  safeTripCity: string;
  safeTripCountry: string;
  trip: TripPayload;
}

export interface LegacyActivityCardProps {
  safeActivityName: string;
  safeActivityDescription: string;
  activity: ActivityPayload;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const categoryEmojis: Record<string, string> = {
  FOOD: '🍽️',
  CULTURE: '🎭',
  NATURE: '🌲',
  ENTERTAINMENT: '🎪',
  NIGHTLIFE: '🌙',
  SPORTS: '⚽',
  SHOPPING: '🛍️',
  OTHER: '✨',
};

// ─── Legacy Trip Card ─────────────────────────────────────────────────────────

export function LegacyTripCard({
  safeTripId,
  safeTripCoverImage,
  safeTripTitle,
  safeTripCity,
  safeTripCountry,
  trip,
}: LegacyTripCardProps) {
  return (
    <Link href={`/trips/${safeTripId}`} className="block mx-4 mb-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="bg-slate-50 dark:bg-slate-700/50 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-600"
      >
        {/* Cover Image */}
        {safeTripCoverImage && (
          <div className="h-36 relative">
            <Image
              src={safeTripCoverImage}
              alt={safeTripTitle}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 600px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 right-3">
              <h3 className="font-semibold text-white text-lg">{safeTripTitle}</h3>
              <p className="text-white/80 text-sm flex items-center gap-1">
                <span>📍</span>
                {safeTripCity}, {safeTripCountry}
              </p>
            </div>
          </div>
        )}

        {/* No Cover Image */}
        {!safeTripCoverImage && (
          <div className="p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {safeTripTitle}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <span>📍</span>
              {safeTripCity}, {safeTripCountry}
            </p>
          </div>
        )}

        {/* Trip Meta */}
        {(trip.startDate || trip.status) && (
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-600 flex items-center justify-between text-sm">
            {trip.startDate && (
              <span className="text-slate-500 dark:text-slate-400">
                {new Date(trip.startDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
                {trip.endDate &&
                  ` - ${new Date(trip.endDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}`}
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                trip.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : trip.status === 'IN_PROGRESS'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
              }`}
            >
              {trip.status.replace('_', ' ')}
            </span>
          </div>
        )}
      </motion.div>
    </Link>
  );
}

// ─── Legacy Activity Card ─────────────────────────────────────────────────────

export function LegacyActivityCard({
  safeActivityName,
  safeActivityDescription,
  activity,
}: LegacyActivityCardProps) {
  return (
    <div className="mx-4 mb-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xl">
          {categoryEmojis[activity.category] || '✨'}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 dark:text-white">
            {safeActivityName}
          </h4>
          {safeActivityDescription && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
              {safeActivityDescription}
            </p>
          )}
          {activity.cost && (
            <span className="inline-block mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              ${activity.cost}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
