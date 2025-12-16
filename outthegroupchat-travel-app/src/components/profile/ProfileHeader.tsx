'use client';

import { motion } from 'framer-motion';
import type { UserWithRelations } from '@/types';

interface ProfileHeaderProps {
  user: UserWithRelations;
  isOwnProfile?: boolean;
  onEdit?: () => void;
  onFollow?: () => void;
  isFollowing?: boolean;
}

export function ProfileHeader({
  user,
  isOwnProfile = false,
  onEdit,
  onFollow,
  isFollowing = false,
}: ProfileHeaderProps) {
  const stats = [
    { label: 'Trips', value: user._count?.ownedTrips || 0 },
    { label: 'Followers', value: user._count?.followers || 0 },
    { label: 'Following', value: user._count?.following || 0 },
  ];

  return (
    <div className="relative">
      {/* Cover Photo */}
      <div className="h-48 md:h-64 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 relative overflow-hidden">
        {/* Pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="profile-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="2" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#profile-grid)" />
          </svg>
        </div>

        {/* Edit Cover Button (only for own profile) */}
        {isOwnProfile && (
          <button className="absolute top-4 right-4 p-2 bg-black/20 backdrop-blur-sm rounded-lg text-white hover:bg-black/30 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Profile Content */}
      <div className="max-w-4xl mx-auto px-4 relative -mt-20">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0 -mt-20 md:-mt-24">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative"
              >
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-5xl font-bold border-4 border-white dark:border-slate-800 shadow-xl overflow-hidden">
                  {user.image ? (
                    <img
                      src={user.image}
                      alt={user.name || ''}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    user.name?.charAt(0) || '?'
                  )}
                </div>

                {/* Online Status */}
                <span className="absolute bottom-2 right-2 w-5 h-5 bg-emerald-500 border-3 border-white dark:border-slate-800 rounded-full" />
              </motion.div>
            </div>

            {/* User Info */}
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                    {user.name || 'Anonymous'}
                  </h1>
                  {user.city && (
                    <p className="flex items-center gap-1 text-slate-600 dark:text-slate-400 mt-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      {user.city}
                    </p>
                  )}
                  {user.bio && (
                    <p className="text-slate-600 dark:text-slate-400 mt-3 max-w-lg">
                      {user.bio}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  {isOwnProfile ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={onEdit}
                      className="px-6 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Profile
                    </motion.button>
                  ) : (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onFollow}
                        className={`px-6 py-2.5 font-medium rounded-xl transition-colors flex items-center gap-2 ${
                          isFollowing
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl'
                        }`}
                      >
                        {isFollowing ? (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Following
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                            Follow
                          </>
                        )}
                      </motion.button>
                      <button className="p-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                {stats.map((stat) => (
                  <button
                    key={stat.label}
                    className="text-center hover:bg-slate-50 dark:hover:bg-slate-700/50 px-4 py-2 rounded-lg transition-colors"
                  >
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {stat.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileHeader;
