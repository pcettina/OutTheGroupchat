'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  sanitizeRouteSegment,
  sanitizeText,
  type CheckInPayload,
  type CrewPayload,
  type MeetupPayload,
  type PostPayload,
} from './FeedItemTypes';

// ─── Small helper: active indicator dot ──────────────────────────────────────

export function ActiveDot({ activeUntil }: { activeUntil: string | null | undefined }) {
  if (!activeUntil) return null;
  const isActive = new Date(activeUntil).getTime() > Date.now();
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
      }`}
      aria-label={isActive ? 'Active now' : 'Expired'}
    />
  );
}

// ─── Card sub-components for new types ───────────────────────────────────────

export function MeetupCreatedCard({ meetup }: { meetup: MeetupPayload }) {
  const safeTitle = sanitizeText(meetup.title);
  const safeVenue = sanitizeText(meetup.venue);
  const safeMeetupId = sanitizeRouteSegment(meetup.id);

  return (
    <Link href={`/meetups/${safeMeetupId}`} className="block mx-4 mb-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="bg-teal-50 dark:bg-teal-900/20 rounded-xl border border-teal-100 dark:border-teal-800 p-4"
      >
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{safeTitle}</h3>
        {safeVenue && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>📍</span>
            {safeVenue}
          </p>
        )}
        {meetup.scheduledFor && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <span>📅</span>
            {new Date(meetup.scheduledFor).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        )}
      </motion.div>
    </Link>
  );
}

export function CheckInPostedCard({ checkIn }: { checkIn: CheckInPayload }) {
  const safeVenue = sanitizeText(checkIn.venue);
  const safeCity = sanitizeText(checkIn.city);
  const safeCheckInId = sanitizeRouteSegment(checkIn.id);

  return (
    <Link href={`/checkins/${safeCheckInId}`} className="block mx-4 mb-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800 p-4"
      >
        <div className="flex items-center gap-2">
          <ActiveDot activeUntil={checkIn.activeUntil} />
          <div className="min-w-0">
            {safeVenue && (
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {safeVenue}
              </p>
            )}
            {safeCity && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                <span>🏙️</span>
                {safeCity}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

export function CrewFormedCard({ crew }: { crew: CrewPayload }) {
  const nameA = sanitizeText(crew.userA.name) || 'Someone';
  const nameB = sanitizeText(crew.userB.name) || 'Someone';
  const safeIdA = sanitizeRouteSegment(crew.userA.id);
  const safeIdB = sanitizeRouteSegment(crew.userB.id);

  return (
    <div className="mx-4 mb-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 p-4">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        <Link
          href={`/profile/${safeIdA}`}
          className="font-semibold text-slate-900 dark:text-white hover:underline"
        >
          {nameA}
        </Link>
        {' '}and{' '}
        <Link
          href={`/profile/${safeIdB}`}
          className="font-semibold text-slate-900 dark:text-white hover:underline"
        >
          {nameB}
        </Link>
        {' '}are now Crew 🤝
      </p>
    </div>
  );
}

export function MeetupAttendedCard({ meetup }: { meetup: MeetupPayload }) {
  const safeTitle = sanitizeText(meetup.title);
  const safeMeetupId = sanitizeRouteSegment(meetup.id);

  return (
    <Link href={`/meetups/${safeMeetupId}`} className="block mx-4 mb-3">
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800 p-4"
      >
        <p className="text-sm font-medium text-slate-900 dark:text-white">{safeTitle}</p>
      </motion.div>
    </Link>
  );
}

export function PostCreatedCard({ post }: { post: PostPayload }) {
  const safeContent = sanitizeText(post.content);

  return (
    <div className="mx-4 mb-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800 p-4">
      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">
        {safeContent}
      </p>
    </div>
  );
}
