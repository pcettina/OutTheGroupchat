'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock } from 'lucide-react';

interface LiveActivityCardCheckIn {
  id: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  venue?: { id: string; name: string } | null;
  venueId?: string | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activeUntil: string; // ISO datetime
  createdAt: string;   // ISO datetime
}

interface LiveActivityCardProps {
  checkIn: LiveActivityCardCheckIn;
  /** The current user's id — used to hide "Join me" on the user's own check-in. */
  currentUserId?: string | null;
  onJoinMe?: () => void;
  className?: string;
}

/**
 * Returns a human-readable "time ago" string, e.g. "2m ago", "1h ago".
 */
function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/**
 * Returns a human-readable remaining active time string,
 * e.g. "Active for 5h 30m" or "Expired" if activeUntil is in the past.
 */
function remainingActiveTime(isoString: string): string {
  const remainingMs = new Date(isoString).getTime() - Date.now();
  if (remainingMs <= 0) return 'Expired';

  const remainingSec = Math.floor(remainingMs / 1000);
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingHr = Math.floor(remainingMin / 60);
  const mins = remainingMin % 60;

  if (remainingHr > 0 && mins > 0) return `Active for ${remainingHr}h ${mins}m`;
  if (remainingHr > 0) return `Active for ${remainingHr}h`;
  return `Active for ${remainingMin}m`;
}

export function LiveActivityCard({ checkIn, currentUserId, onJoinMe, className = '' }: LiveActivityCardProps) {
  const { user, venue, note, activeUntil, createdAt } = checkIn;

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const activeStatus = remainingActiveTime(activeUntil);
  const isExpired = activeStatus === 'Expired';

  // Hide "Join me" if this is the current user's own check-in.
  const isOwn = currentUserId != null && currentUserId === user.id;

  // Build "Join me" href: /meetups/new pre-filled with venueId, checkInId, and title.
  const venueId = checkIn.venueId ?? venue?.id ?? '';
  const meetupTitle = encodeURIComponent(
    (user.name ?? 'Someone') +
      "'s meetup" +
      (venue?.name ? ' at ' + venue.name : ''),
  );
  const joinHref =
    `/meetups/new` +
    `?checkInId=${encodeURIComponent(checkIn.id)}` +
    `&venueId=${encodeURIComponent(venueId)}` +
    `&title=${meetupTitle}`;

  const handleJoinMe = () => {
    if (onJoinMe) {
      onJoinMe();
    }
  };

  return (
    <div
      className={`relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-4 flex flex-col gap-3 ${className}`}
    >
      {/* Active status badge */}
      <div className="absolute top-3 right-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            isExpired
              ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              : 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
          }`}
        >
          {!isExpired && (
            <span className="block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" aria-hidden="true" />
          )}
          {activeStatus}
        </span>
      </div>

      {/* User info */}
      <div className="flex items-center gap-3 pr-28">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? 'User'}
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {initials}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">
            {user.name ?? 'Someone'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
            {timeAgo(createdAt)}
          </p>
        </div>
      </div>

      {/* Venue */}
      {venue && (
        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <MapPin className="w-4 h-4 shrink-0 text-teal-500" aria-hidden="true" />
          <span className="truncate font-medium">{venue.name}</span>
        </div>
      )}

      {/* Note */}
      {note && (
        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 italic">
          &ldquo;{note}&rdquo;
        </p>
      )}

      {/* Join me CTA — hidden when expired or viewing own check-in */}
      {!isExpired && !isOwn && (
        <div className="pt-1">
          {onJoinMe ? (
            <button
              type="button"
              onClick={handleJoinMe}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold px-4 py-2 transition-colors duration-150"
            >
              Join me &rarr;
            </button>
          ) : (
            <Link
              href={joinHref}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold px-4 py-2 transition-colors duration-150"
            >
              Join me &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default LiveActivityCard;
