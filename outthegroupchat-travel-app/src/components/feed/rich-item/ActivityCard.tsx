'use client';

import { categoryEmojis } from './types';
import type { ActivityPayload } from './types';

interface ActivityCardProps {
  activity: ActivityPayload;
  safeActivityName: string;
  safeActivityDescription: string;
}

export function ActivityCard({ activity, safeActivityName, safeActivityDescription }: ActivityCardProps) {
  return (
    <div className="mx-4 mb-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xl">
          {categoryEmojis[activity.category] || '✨'}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 dark:text-white">
            {safeActivityName}
          </h4>
          {safeActivityDescription && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
              {safeActivityDescription}
            </p>
          )}
          {activity.cost && (
            <span className="inline-block mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              ${activity.cost}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
