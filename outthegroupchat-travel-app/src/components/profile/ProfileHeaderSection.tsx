'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

interface ProfileHeaderSectionProps {
  name: string;
  image?: string;
  city?: string;
  bio?: string;
  followers: number;
  following: number;
}

export function ProfileHeaderSection({
  name,
  image,
  city,
  bio,
  followers,
  following,
}: ProfileHeaderSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-8"
    >
      {/* Cover Gradient */}
      <div className="h-48 rounded-3xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      {/* Profile Info Overlay */}
      <div className="relative -mt-20 px-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4">
          {/* Avatar */}
          <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 p-1 shadow-xl">
            <div className="w-full h-full rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
              {image ? (
                <Image
                  src={image}
                  alt={name}
                  fill
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <span className="text-4xl font-bold text-emerald-500">
                  {name?.charAt(0) || '?'}
                </span>
              )}
            </div>
          </div>

          {/* Name & Location */}
          <div className="flex-1 text-center sm:text-left pb-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {name || 'Anonymous'}
            </h1>
            {city && (
              <p className="text-slate-500 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1 mt-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {city}
              </p>
            )}
            {bio && (
              <p className="text-slate-600 dark:text-slate-300 mt-2 max-w-md">
                {bio}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-6 pb-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-500">{followers}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-500">{following}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Following</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
