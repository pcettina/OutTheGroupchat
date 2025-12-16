'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useTrip } from '@/hooks/useTrips';
import { TripChat } from '@/components/ai';
import { Navigation } from '@/components/Navigation';
import { TripHeader, TripOverview, MemberList, ItineraryTimeline } from '@/components/trips';
import type { Destination, TripBudget } from '@/types';

export default function TripDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.tripId as string;
  const { data: trip, isLoading, error } = useTrip(tripId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Navigation />
        <div className="pt-16">
          {/* Header Skeleton */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-12">
            <div className="max-w-7xl mx-auto animate-pulse">
              <div className="h-8 bg-white/20 rounded w-1/4 mb-4" />
              <div className="h-12 bg-white/20 rounded w-1/2 mb-3" />
              <div className="h-6 bg-white/20 rounded w-1/3" />
            </div>
          </div>

          {/* Content Skeleton */}
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl h-96 animate-pulse" />
              </div>
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-800 rounded-2xl h-64 animate-pulse" />
                <div className="bg-white dark:bg-slate-800 rounded-2xl h-48 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Navigation />
        <div className="pt-24 px-4">
          <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Trip not found</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              The trip you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
            </p>
            <Link
              href="/trips"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to trips
            </Link>
          </div>
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

  const handleInvite = () => {
    // TODO: Open invite modal
    console.log('Open invite modal');
  };

  const handleAddActivity = (dayNumber: number) => {
    // TODO: Open add activity modal for specific day
    console.log('Add activity for day', dayNumber);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Navigation />
      
      <div className="pt-16">
        {/* Trip Header */}
        <TripHeader trip={trip} onInvite={handleInvite} />

        {/* Quick Actions */}
        <div className="max-w-7xl mx-auto px-4 -mt-6 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Survey', icon: '📋', href: `/trips/${tripId}/survey`, description: 'Collect preferences' },
              { label: 'Vote', icon: '🗳️', href: `/trips/${tripId}/vote`, description: 'Decide together' },
              { label: 'Flights', icon: '✈️', href: `/trips/${tripId}/flights`, description: 'Search flights' },
              { label: 'Share', icon: '📤', href: '#', description: 'Invite friends' },
            ].map((action) => (
              <Link key={action.label} href={action.href}>
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
                >
                  <span className="text-2xl block mb-2">{action.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white block">{action.label}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{action.description}</span>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Itinerary Timeline */}
              <ItineraryTimeline
                tripId={tripId}
                startDate={new Date(trip.startDate)}
                endDate={new Date(trip.endDate)}
                activities={trip.activities}
                onAddActivity={handleAddActivity}
              />

              {/* Activities Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    All Activities ({trip.activities?.length || 0})
                  </h3>
                  <button className="text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:underline flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Activity
                  </button>
                </div>

                <div className="p-5">
                  {trip.activities && trip.activities.length > 0 ? (
                    <div className="grid gap-3">
                      {trip.activities.map((activity) => (
                        <motion.div
                          key={activity.id}
                          whileHover={{ scale: 1.01 }}
                          className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/50 flex items-center justify-center text-xl">
                            {activity.category === 'FOOD' ? '🍽️' : 
                             activity.category === 'ENTERTAINMENT' ? '🎭' :
                             activity.category === 'SPORTS' ? '⚽' :
                             activity.category === 'NIGHTLIFE' ? '🌙' : '📍'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white">{activity.name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                              {activity.description || 'No description'}
                            </p>
                          </div>
                          {activity.cost && (
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                              ${activity.cost}
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mb-1">No activities planned yet</p>
                      <p className="text-sm text-slate-500 dark:text-slate-500">
                        Add activities to build your itinerary
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Trip Overview */}
              <TripOverview trip={trip} />

              {/* Member List */}
              <MemberList
                members={trip.members || []}
                onInvite={handleInvite}
                isOwner={true} // TODO: Check actual ownership
              />
            </div>
          </div>
        </div>
      </div>

      {/* AI Trip Chat */}
      <TripChat tripContext={tripContext} />
    </div>
  );
}
