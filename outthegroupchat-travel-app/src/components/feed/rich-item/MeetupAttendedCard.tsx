'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { sanitizeText, sanitizeRouteSegment } from './sanitize';
import type { MeetupPayload } from './types';

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
