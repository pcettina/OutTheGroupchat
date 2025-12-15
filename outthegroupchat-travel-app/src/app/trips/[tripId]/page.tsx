'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useTrip } from '@/hooks/useTrips';
import { TripChat } from '@/components/ai';
import { Navigation } from '@/components/Navigation';
import type { Destination, TripBudget } from '@/types';

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.tripId as string;
  const { data: trip, isLoading, error } = useTrip(tripId);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-48 bg-gray-200 rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-semibold text-red-700 mb-2">Trip not found</h2>
          <p className="text-red-600 mb-4">The trip you're looking for doesn't exist or you don't have access.</p>
          <Link href="/trips" className="text-primary font-medium hover:underline">
            Back to trips
          </Link>
        </div>
      </div>
    );
  }

  const destination = trip.destination as unknown as Destination;
  const budget = trip.budget as unknown as TripBudget | null;
  const memberCount = trip._count?.members || trip.members?.length || 0;

  // Build context for the AI chat
  const tripContext = {
    tripId: trip.id,
    tripTitle: trip.title,
    destination: `${destination.city}, ${destination.country}`,
    startDate: format(new Date(trip.startDate), 'MMM d, yyyy'),
    endDate: format(new Date(trip.endDate), 'MMM d, yyyy'),
    memberCount,
    budget: budget?.total,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />
      <div className="container mx-auto px-4 py-8 max-w-5xl pt-20">
      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </motion.button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-primary via-primary/90 to-accent rounded-3xl p-8 text-white mb-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[url('/patterns/topography.svg')] opacity-10" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{trip.title}</h1>
              <p className="flex items-center gap-2 text-white/90">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {destination.city}, {destination.country}
              </p>
            </div>
            <span className="px-4 py-2 bg-white/20 rounded-full text-sm font-medium backdrop-blur-sm">
              {trip.status.replace('_', ' ')}
            </span>
          </div>

          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {format(new Date(trip.startDate), 'MMM d')} - {format(new Date(trip.endDate), 'MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {memberCount} members
            </div>
            {budget && (
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ${budget.total.toLocaleString()} {budget.currency}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
      >
        {[
          { label: 'Survey', icon: '📋', href: `/trips/${tripId}/survey`, color: 'from-blue-500 to-blue-600' },
          { label: 'Vote', icon: '🗳️', href: `/trips/${tripId}/vote`, color: 'from-purple-500 to-purple-600' },
          { label: 'Itinerary', icon: '📍', href: `/trips/${tripId}/itinerary`, color: 'from-green-500 to-green-600' },
          { label: 'Chat', icon: '💬', href: `/trips/${tripId}/chat`, color: 'from-orange-500 to-orange-600' },
        ].map((action) => (
          <Link key={action.label} href={action.href}>
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className={`bg-gradient-to-br ${action.color} rounded-xl p-4 text-white text-center shadow-lg cursor-pointer`}
            >
              <span className="text-2xl block mb-1">{action.icon}</span>
              <span className="font-medium">{action.label}</span>
            </motion.div>
          </Link>
        ))}
      </motion.div>

      {/* Description */}
      {trip.description && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-3">About this trip</h2>
          <p className="text-gray-600">{trip.description}</p>
        </motion.div>
      )}

      {/* Members */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Trip Members</h2>
          <button className="text-primary text-sm font-medium hover:underline">
            Invite people
          </button>
        </div>
        <div className="space-y-3">
          {trip.members?.map((member) => (
            <div key={member.userId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-medium">
                {member.user?.name?.charAt(0) || '?'}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{member.user?.name}</p>
                <p className="text-sm text-gray-500 capitalize">{member.role.toLowerCase()}</p>
              </div>
              {member.departureCity && (
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  From {member.departureCity}
                </span>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Activities */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Activities</h2>
          <button className="text-primary text-sm font-medium hover:underline">
            Add activity
          </button>
        </div>
        {trip.activities && trip.activities.length > 0 ? (
          <div className="space-y-3">
            {trip.activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:border-primary/30 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl">
                  {activity.category === 'FOOD' ? '🍽️' : 
                   activity.category === 'ENTERTAINMENT' ? '🎭' :
                   activity.category === 'SPORTS' ? '⚽' :
                   activity.category === 'NIGHTLIFE' ? '🌙' : '📍'}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{activity.name}</p>
                  <p className="text-sm text-gray-500">{activity.description?.slice(0, 100)}...</p>
                </div>
                {activity.cost && (
                  <span className="text-sm font-medium text-gray-600">
                    ${activity.cost}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No activities planned yet.</p>
            <p className="text-sm mt-1">Add activities to start building your itinerary.</p>
          </div>
        )}
      </motion.div>
      </div>

      {/* AI Trip Chat */}
      <TripChat tripContext={tripContext} />
    </div>
  );
}
