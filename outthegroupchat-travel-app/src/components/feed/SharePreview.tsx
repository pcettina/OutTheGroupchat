'use client';

import { motion } from 'framer-motion';

interface SharePreviewProps {
  title: string;
  description?: string;
  image?: string;
  url: string;
  type: 'trip' | 'activity' | 'profile';
  metadata?: {
    destination?: string;
    dates?: string;
    memberCount?: number;
    price?: string;
  };
}

export function SharePreview({
  title,
  description,
  image,
  url,
  type,
  metadata,
}: SharePreviewProps) {
  const typeConfig = {
    trip: {
      icon: '✈️',
      label: 'Trip',
      gradient: 'from-emerald-500 to-teal-500',
    },
    activity: {
      icon: '📍',
      label: 'Activity',
      gradient: 'from-amber-500 to-orange-500',
    },
    profile: {
      icon: '👤',
      label: 'Profile',
      gradient: 'from-purple-500 to-pink-500',
    },
  };

  const config = typeConfig[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow max-w-md"
    >
      {/* Header Image */}
      {image ? (
        <div className="relative h-40 overflow-hidden">
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className={`absolute top-3 left-3 px-2 py-1 rounded-full bg-gradient-to-r ${config.gradient} text-white text-xs font-medium flex items-center gap-1`}>
            <span>{config.icon}</span>
            <span>{config.label}</span>
          </div>
        </div>
      ) : (
        <div className={`h-32 bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
          <span className="text-4xl">{config.icon}</span>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-slate-900 dark:text-white text-lg mb-1 line-clamp-1">
          {title}
        </h3>

        {/* Description */}
        {description && (
          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
            {description}
          </p>
        )}

        {/* Metadata */}
        {metadata && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {metadata.destination && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {metadata.destination}
              </span>
            )}
            {metadata.dates && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {metadata.dates}
              </span>
            )}
            {metadata.memberCount && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {metadata.memberCount} people
              </span>
            )}
            {metadata.price && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {metadata.price}
              </span>
            )}
          </div>
        )}

        {/* URL Footer */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">OTG</span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            outthegroupchat.com
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Preview Card for Social Media Sharing
export function SocialShareCard({
  title,
  description,
  image,
  destination,
  dates,
  memberCount,
}: {
  title: string;
  description?: string;
  image?: string;
  destination?: string;
  dates?: string;
  memberCount?: number;
}) {
  return (
    <div className="w-full aspect-[1.91/1] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 rounded-xl overflow-hidden relative">
      {/* Background Image */}
      {image && (
        <div className="absolute inset-0">
          <img src={image} alt="" className="w-full h-full object-cover opacity-30" />
        </div>
      )}

      {/* Overlay Pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-share" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="16" cy="16" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-share)" />
        </svg>
      </div>

      {/* Content */}
      <div className="absolute inset-0 p-6 flex flex-col justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <span className="text-white font-bold text-sm">OTG</span>
          </div>
          <span className="text-white/80 text-sm font-medium">OutTheGroupchat</span>
        </div>

        {/* Main Content */}
        <div className="text-white">
          <h2 className="text-2xl font-bold mb-2 line-clamp-2">{title}</h2>
          {description && (
            <p className="text-white/80 text-sm line-clamp-2 mb-3">{description}</p>
          )}
          
          {/* Metadata */}
          <div className="flex items-center gap-4 text-sm text-white/90">
            {destination && (
              <span className="flex items-center gap-1">
                <span>📍</span>
                {destination}
              </span>
            )}
            {dates && (
              <span className="flex items-center gap-1">
                <span>📅</span>
                {dates}
              </span>
            )}
            {memberCount && (
              <span className="flex items-center gap-1">
                <span>👥</span>
                {memberCount} travelers
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SharePreview;
