'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface FollowButtonProps {
  userId: string;
  initialIsFollowing?: boolean;
  className?: string;
}

/**
 * FollowButton — toggles follow/unfollow state for a user.
 * Calls POST /api/users/[userId]/follow to follow,
 * DELETE /api/users/[userId]/follow to unfollow.
 */
export function FollowButton({ userId, initialIsFollowing = false, className }: FollowButtonProps) {
  const { data: session } = useSession();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, setIsPending] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!session?.user?.id || session.user.id === userId) return;
    setIsPending(true);
    try {
      const method = isFollowing ? 'DELETE' : 'POST';
      const res = await fetch(`/api/users/${userId}/follow`, { method });
      if (res.ok) {
        setIsFollowing((prev) => !prev);
      }
    } finally {
      setIsPending(false);
    }
  }, [session, userId, isFollowing]);

  // Don't render for own profile or unauthenticated
  if (!session?.user?.id || session.user.id === userId) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
        isFollowing
          ? 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600'
          : 'bg-teal-600 text-white hover:bg-teal-700'
      } disabled:opacity-50 ${className ?? ''}`}
    >
      {isPending ? '...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
