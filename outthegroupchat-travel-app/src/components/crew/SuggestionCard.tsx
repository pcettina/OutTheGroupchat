'use client';

import Image from 'next/image';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';

export interface CrewSuggestion {
  id: string;
  name: string | null;
  image: string | null;
  city: string | null;
  mutualCount: number;
}

interface SuggestionCardProps {
  suggestion: CrewSuggestion;
  onAdd: (id: string) => void;
  pending?: boolean;
}

/**
 * One "People you may know" suggestion — avatar, name, city, mutual-Crew count,
 * and an "Add" button that fires a Crew request via `onAdd`.
 */
export default function SuggestionCard({ suggestion, onAdd, pending }: SuggestionCardProps) {
  const displayName = suggestion.name ?? 'Anonymous';

  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
      <Link href={`/profile/${suggestion.id}`} className="shrink-0">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          {suggestion.image ? (
            <Image
              src={suggestion.image}
              alt={displayName}
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-slate-500 font-semibold text-lg">
              {suggestion.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <Link
          href={`/profile/${suggestion.id}`}
          className="block font-semibold text-slate-900 dark:text-white truncate"
        >
          {displayName}
        </Link>
        {suggestion.city && (
          <p className="text-sm text-slate-500 truncate">{suggestion.city}</p>
        )}
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
          {suggestion.mutualCount} mutual
        </p>
      </div>

      <button
        type="button"
        onClick={() => onAdd(suggestion.id)}
        disabled={pending}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
        aria-label={`Add ${displayName} to Crew`}
      >
        <UserPlus className="w-4 h-4" />
        {pending ? 'Adding…' : 'Add'}
      </button>
    </li>
  );
}
