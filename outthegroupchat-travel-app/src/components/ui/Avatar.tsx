'use client';

import { forwardRef } from 'react';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
};

const statusSizeClasses = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-4 h-4',
};

const statusColors = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  busy: 'bg-red-500',
  away: 'bg-amber-500',
};

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt = '', fallback, size = 'md', status, className = '' }, ref) => {
    const initials = fallback || alt?.charAt(0)?.toUpperCase() || '?';

    return (
      <div ref={ref} className={`relative inline-block ${className}`}>
        <div
          className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold overflow-hidden`}
        >
          {src ? (
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            initials
          )}
        </div>

        {status && (
          <span
            className={`absolute bottom-0 right-0 ${statusSizeClasses[size]} ${statusColors[status]} rounded-full border-2 border-white dark:border-slate-800`}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export default Avatar;
