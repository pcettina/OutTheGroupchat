'use client';

/**
 * ProfileStatsTab
 *
 * Displays the "Travel Stats" tab content within the user profile page.
 * Shows a placeholder timeline until the user has completed trips.
 */
export function ProfileStatsTab() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
        <span>📊</span> Your Travel Journey
      </h2>

      {/* Travel Timeline placeholder */}
      <div className="text-center py-12">
        <span className="text-6xl mb-4 block">🗺️</span>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Your travel history will appear here
        </h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Complete trips to see your travel statistics, visited countries, and achievements.
        </p>
        <a
          href="/trips/new"
          className="inline-block mt-6 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-teal-700 transition-all"
        >
          Plan Your First Trip
        </a>
      </div>
    </div>
  );
}
