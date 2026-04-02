'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { logger } from '@/lib/logger';

interface FollowButtonProps {
  userId: string;
  initialIsFollowing: boolean;
  followersCount: number;
}

interface FollowResponse {
  success: boolean;
  isFollowing: boolean;
  message?: string;
  error?: string;
}

export default function FollowButton({
  userId,
  initialIsFollowing,
  followersCount,
}: FollowButtonProps) {
  const { data: session, status } = useSession();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [count, setCount] = useState(followersCount);
  const [isLoading, setIsLoading] = useState(false);

  // Hide button for own profile or unauthenticated users
  if (status === 'loading') return null;
  if (!session?.user?.id) return null;
  if (session.user.id === userId) return null;

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'POST' });
      if (!res.ok) {
        const errData: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `Request failed with status ${res.status}`);
      }
      const data: FollowResponse = await res.json();
      if (data.success) {
        setIsFollowing(data.isFollowing);
        setCount((prev) => (data.isFollowing ? prev + 1 : Math.max(0, prev - 1)));
      }
    } catch (err) {
      logger.error({ err }, '[FollowButton] Failed to toggle follow');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`px-5 py-2 rounded-full text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
          isFollowing
            ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-600'
            : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
        }`}
        aria-label={isFollowing ? 'Unfollow user' : 'Follow user'}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin w-4 h-4"
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
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {isFollowing ? 'Unfollowing...' : 'Following...'}
          </span>
        ) : isFollowing ? (
          'Following'
        ) : (
          'Follow'
        )}
      </button>
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {count} {count === 1 ? 'follower' : 'followers'}
      </span>
    </div>
  );
}
