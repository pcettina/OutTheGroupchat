'use client';

import Link from 'next/link';
import { sanitizeText, sanitizeRouteSegment } from './sanitize';
import type { CrewPayload } from './types';

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
