'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { sanitizeText, sanitizeRouteSegment } from './sanitize';
import type { MeetupPayload } from './types';

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
