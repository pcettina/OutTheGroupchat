'use client';

import { useState } from 'react';

interface FollowButtonProps {
  userId: string;
  initialIsFollowing?: boolean;
  className?: string;
}

interface FollowResponse {
  success: boolean;
  isFollowing: boolean;
  message: string;
}

export function FollowButton({
  userId,
  initialIsFollowing = false,
  className = '',
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;
    setIsLoading(true);
    const previousState = isFollowing;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'POST' });
      if (res.ok) {
        const data: FollowResponse = await res.json();
        setIsFollowing(data.isFollowing);
      } else {
        // Revert optimistic update on error
        setIsFollowing(previousState);
      }
    } catch {
      setIsFollowing(previousState);
    } finally {
      setIsLoading(false);
    }
  };

  const baseClasses =
    'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed';

  const followingClasses =
    'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400 dark:bg-emerald-600 dark:hover:bg-emerald-700';

  const notFollowingClasses =
    'border border-emerald-500 text-emerald-600 hover:bg-emerald-50 focus:ring-emerald-400 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-900/20';

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`${baseClasses} ${isFollowing ? followingClasses : notFollowingClasses} ${className}`}
      aria-label={isFollowing ? 'Unfollow user' : 'Follow user'}
    >
      {isLoading ? (
        <>
          <svg
            className="w-3 h-3 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>{isFollowing ? 'Following' : 'Follow'}</span>
        </>
      ) : isFollowing ? (
        'Following'
      ) : (
        'Follow'
      )}
    </button>
  );
}

export default FollowButton;
