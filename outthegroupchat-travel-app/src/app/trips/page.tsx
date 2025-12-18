'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTrips } from '@/hooks/useTrips';
import { TripList } from '@/components/trips';
import { TripChat } from '@/components/ai';
import { Navigation } from '@/components/Navigation';

export default function TripsPage() {
  const { data: trips = [], isLoading, error } = useTrips();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <Navigation />
      <div className="container mx-auto px-4 py-8 max-w-7xl pt-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Trips</h1>
          <p className="text-gray-500 mt-1">Plan, organize, and experience adventures together</p>
        </div>
        <Link href="/trips/new">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Trip
          </motion.button>
        </Link>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
      >
        {[
          { label: 'Total Trips', value: trips.length, icon: '🧳' },
          { 
            label: 'Active', 
            value: trips.filter(t => ['PLANNING', 'SURVEYING', 'VOTING', 'BOOKED'].includes(t.status)).length,
            icon: '🚀' 
          },
          { 
            label: 'Completed', 
            value: trips.filter(t => t.status === 'COMPLETED').length,
            icon: '✅' 
          },
          { 
            label: 'Friends', 
            value: new Set(trips.flatMap(t => t.members?.map(m => m.userId) || [])).size,
            icon: '👥' 
          },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{stat.icon}</span>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-700">Failed to load trips. Please try again.</p>
        </div>
      )}

      {/* Trip list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <TripList trips={trips} isLoading={isLoading} />
      </motion.div>
      </div>

      {/* AI Assistant Chat - General planning help */}
      <TripChat />
    </div>
  );
}
