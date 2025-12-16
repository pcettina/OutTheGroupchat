'use client';

import { motion } from 'framer-motion';
import { format } from 'date-fns';
import Link from 'next/link';
import type { TripWithRelations, Destination, TripBudget } from '@/types';

interface TripHeaderProps {
  trip: TripWithRelations;
  onInvite?: () => void;
}

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  PLANNING: { color: 'text-amber-700', bgColor: 'bg-amber-100', label: 'Planning' },
  INVITING: { color: 'text-indigo-700', bgColor: 'bg-indigo-100', label: 'Inviting Members' },
  SURVEYING: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Gathering Preferences' },
  VOTING: { color: 'text-purple-700', bgColor: 'bg-purple-100', label: 'Voting' },
  BOOKED: { color: 'text-green-700', bgColor: 'bg-green-100', label: 'Booked' },
  IN_PROGRESS: { color: 'text-teal-700', bgColor: 'bg-teal-100', label: 'On Trip!' },
  COMPLETED: { color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Completed' },
  CANCELLED: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Cancelled' },
};

export default function TripHeader({ trip, onInvite }: TripHeaderProps) {
  const destination = trip.destination as unknown as Destination;
  const budget = trip.budget as unknown as TripBudget | null;
  const memberCount = trip._count?.members || trip.members?.length || 0;
  const status = statusConfig[trip.status] || statusConfig.PLANNING;

  const tripDuration = Math.ceil(
    (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden"
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600" />
      
      {/* Pattern Overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Content */}
      <div className="relative z-10 px-6 py-8 md:px-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Top Row - Back & Status */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/trips"
              className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Back to trips</span>
            </Link>
            <span className={`px-4 py-1.5 rounded-full text-sm font-medium ${status.bgColor} ${status.color}`}>
              {status.label}
            </span>
          </div>

          {/* Main Content */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            {/* Title & Location */}
            <div className="text-white">
              <h1 className="text-3xl md:text-4xl font-bold mb-3">{trip.title}</h1>
              <div className="flex items-center gap-2 text-white/90 text-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{destination.city}, {destination.country}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onInvite}
                className="px-5 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl font-medium hover:bg-white/30 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Invite
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-5 py-2.5 bg-white text-emerald-600 rounded-xl font-semibold hover:bg-emerald-50 transition-colors flex items-center gap-2 shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Trip
              </motion.button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Dates */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Dates
              </div>
              <p className="text-white font-semibold">
                {format(new Date(trip.startDate), 'MMM d')} - {format(new Date(trip.endDate), 'MMM d')}
              </p>
              <p className="text-white/70 text-sm">{tripDuration} days</p>
            </div>

            {/* Members */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Members
              </div>
              <p className="text-white font-semibold">{memberCount} people</p>
              <div className="flex -space-x-2 mt-2">
                {trip.members?.slice(0, 4).map((member, i) => (
                  <div
                    key={member.userId}
                    className="w-7 h-7 rounded-full bg-white/30 border-2 border-white/50 flex items-center justify-center text-white text-xs font-medium"
                  >
                    {member.user?.name?.charAt(0) || '?'}
                  </div>
                ))}
                {memberCount > 4 && (
                  <div className="w-7 h-7 rounded-full bg-white/30 border-2 border-white/50 flex items-center justify-center text-white text-xs font-medium">
                    +{memberCount - 4}
                  </div>
                )}
              </div>
            </div>

            {/* Budget */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Budget
              </div>
              {budget ? (
                <>
                  <p className="text-white font-semibold">
                    {budget.currency} {budget.total.toLocaleString()}
                  </p>
                  <p className="text-white/70 text-sm">
                    ~{budget.currency} {Math.round(budget.total / (memberCount || 1)).toLocaleString()}/person
                  </p>
                </>
              ) : (
                <p className="text-white/70">Not set</p>
              )}
            </div>

            {/* Activities */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Activities
              </div>
              <p className="text-white font-semibold">{trip.activities?.length || 0} planned</p>
              <p className="text-white/70 text-sm">
                {trip._count?.members || 0} votes cast
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
