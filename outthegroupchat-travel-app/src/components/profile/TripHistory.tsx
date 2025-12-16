'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { format } from 'date-fns';
import type { Trip } from '@prisma/client';
import type { Destination } from '@/types';

interface TripHistoryProps {
  trips: (Trip & { destination: Destination; _count?: { members: number } })[];
  showAll?: boolean;
}

export function TripHistory({ trips, showAll = false }: TripHistoryProps) {
  const displayTrips = showAll ? trips : trips.slice(0, 6);

  // Group trips by year
  const tripsByYear = displayTrips.reduce((groups, trip) => {
    const year = new Date(trip.startDate).getFullYear();
    if (!groups[year]) {
      groups[year] = [];
    }
    groups[year].push(trip);
    return groups;
  }, {} as Record<number, typeof trips>);

  if (trips.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mb-1">No trips yet</p>
        <p className="text-sm text-slate-500 dark:text-slate-500">
          Start planning your first adventure!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {Object.entries(tripsByYear)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([year, yearTrips]) => (
          <div key={year}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <span>{year}</span>
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                ({yearTrips.length} {yearTrips.length === 1 ? 'trip' : 'trips'})
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {yearTrips.map((trip, index) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link href={`/trips/${trip.id}`}>
                    <motion.div
                      whileHover={{ y: -4 }}
                      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-all"
                    >
                      {/* Cover */}
                      <div className="h-32 bg-gradient-to-br from-emerald-400 to-teal-500 relative">
                        {/* Status Badge */}
                        <span className={`absolute top-3 right-3 px-2 py-1 text-xs font-medium rounded-full ${
                          trip.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-700'
                            : trip.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-700'
                            : trip.status === 'CANCELLED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {trip.status.replace('_', ' ')}
                        </span>

                        {/* Destination Icon */}
                        <div className="absolute bottom-3 left-3">
                          <span className="text-4xl">✈️</span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        <h4 className="font-semibold text-slate-900 dark:text-white truncate mb-1">
                          {trip.title}
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          {trip.destination.city}, {trip.destination.country}
                        </p>

                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>{format(new Date(trip.startDate), 'MMM d')} - {format(new Date(trip.endDate), 'MMM d')}</span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {trip._count?.members || 0}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        ))}

      {!showAll && trips.length > 6 && (
        <div className="text-center">
          <Link
            href="/profile/trips"
            className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
          >
            View all trips ({trips.length})
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

export default TripHistory;
