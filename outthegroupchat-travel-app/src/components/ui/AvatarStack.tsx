'use client';

import { Avatar } from './Avatar';

interface AvatarStackProps {
  avatars: {
    src?: string | null;
    alt?: string;
    fallback?: string;
  }[];
  max?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showCount?: boolean;
  className?: string;
}

const overlapClasses = {
  xs: '-space-x-1.5',
  sm: '-space-x-2',
  md: '-space-x-2.5',
  lg: '-space-x-3',
};

const borderClasses = {
  xs: 'ring-1',
  sm: 'ring-2',
  md: 'ring-2',
  lg: 'ring-2',
};

export function AvatarStack({
  avatars,
  max = 4,
  size = 'md',
  showCount = true,
  className = '',
}: AvatarStackProps) {
  const displayAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div className={`flex items-center ${overlapClasses[size]} ${className}`}>
      {displayAvatars.map((avatar, index) => (
        <div
          key={index}
          className={`${borderClasses[size]} ring-white dark:ring-slate-800 rounded-full`}
        >
          <Avatar
            src={avatar.src}
            alt={avatar.alt}
            fallback={avatar.fallback}
            size={size}
          />
        </div>
      ))}

      {showCount && remainingCount > 0 && (
        <div
          className={`${borderClasses[size]} ring-white dark:ring-slate-800 rounded-full`}
        >
          <div
            className={`${
              size === 'xs' ? 'w-6 h-6 text-[10px]' :
              size === 'sm' ? 'w-8 h-8 text-xs' :
              size === 'md' ? 'w-10 h-10 text-sm' :
              'w-12 h-12 text-base'
            } rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium`}
          >
            +{remainingCount}
          </div>
        </div>
      )}
    </div>
  );
}

export default AvatarStack;
