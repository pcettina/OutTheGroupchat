'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { sanitizeText, sanitizeRouteSegment } from './sanitize';
import { ActiveDot } from './ActiveDot';
import type { CheckInPayload } from './types';

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
