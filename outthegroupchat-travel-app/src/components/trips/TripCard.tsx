'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import type { TripWithRelations, Destination } from '@/types';

interface TripCardProps {
  trip: TripWithRelations;
  variant?: 'default' | 'compact';
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-amber-100 text-amber-800',
  INVITING: 'bg-indigo-100 text-indigo-800',
  SURVEYING: 'bg-blue-100 text-blue-800',
  VOTING: 'bg-purple-100 text-purple-800',
  BOOKED: 'bg-green-100 text-green-800',
  IN_PROGRESS: 'bg-teal-100 text-teal-800',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  PLANNING: 'Planning',
  INVITING: 'Inviting Members',
  SURVEYING: 'Gathering Preferences',
  VOTING: 'Voting',
  BOOKED: 'Booked',
  IN_PROGRESS: 'On Trip',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function TripCard({ trip, variant = 'default' }: TripCardProps) {
  const destination = trip.destination as unknown as Destination;
  const memberCount = trip._count?.members || trip.members?.length || 0;

  if (variant === 'compact') {
    return (
      <Link href={`/trips/${trip.id}`}>
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-primary/30 hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-lg font-bold">
            {destination.city.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{trip.title}</h3>
            <p className="text-sm text-gray-500">{destination.city}, {destination.country}</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[trip.status]}`}>
            {statusLabels[trip.status]}
          </span>
        </motion.div>
      </Link>
    );
  }

  return (
    <Link href={`/trips/${trip.id}`}>
      <motion.div
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 300 }}
        className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100"
      >
        {/* Header with gradient */}
        <div className="h-32 bg-gradient-to-br from-primary via-primary/80 to-accent relative">
          <div className="absolute inset-0 bg-black/10" />
          <div className="absolute bottom-4 left-4 right-4">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusColors[trip.status]}`}>
              {statusLabels[trip.status]}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          <h3 className="font-bold text-xl text-gray-900 mb-1 group-hover:text-primary transition-colors">
            {trip.title}
          </h3>
          <p className="text-gray-500 flex items-center gap-1 mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {destination.city}, {destination.country}
          </p>

          {trip.description && (
            <p className="text-gray-600 text-sm mb-4 line-clamp-2">{trip.description}</p>
          )}

          {/* Dates */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              {format(new Date(trip.startDate), 'MMM d')} - {format(new Date(trip.endDate), 'MMM d, yyyy')}
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            {/* Member avatars */}
            <div className="flex items-center">
              <div className="flex -space-x-2">
                {[...Array(Math.min(memberCount, 3))].map((_, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600"
                  >
                    {trip.members?.[i]?.user?.name?.charAt(0) || '?'}
                  </div>
                ))}
                {memberCount > 3 && (
                  <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600">
                    +{memberCount - 3}
                  </div>
                )}
              </div>
              <span className="ml-3 text-sm text-gray-500">{memberCount} members</span>
            </div>

            {/* Arrow */}
            <div className="w-8 h-8 rounded-full bg-gray-50 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

