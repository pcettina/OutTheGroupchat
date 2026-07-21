'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Calendar, ChevronRight, MapPin, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  searchResultHref,
  type SearchResultItem,
  type SearchResultKind,
} from '@/app/search/searchPageLogic';

interface SearchResultsProps {
  results: SearchResultItem[];
  onResultClick?: (result: SearchResultItem) => void;
}

const KIND_ORDER: readonly SearchResultKind[] = ['user', 'meetup', 'venue'];

const KIND_LABELS: Record<SearchResultKind, string> = {
  user: 'People',
  meetup: 'Meetups',
  venue: 'Venues',
};

function kindIcon(kind: SearchResultKind): ReactNode {
  switch (kind) {
    case 'user':
      return <Users className="h-4 w-4" aria-hidden="true" />;
    case 'meetup':
      return <Calendar className="h-4 w-4" aria-hidden="true" />;
    case 'venue':
    default:
      return <MapPin className="h-4 w-4" aria-hidden="true" />;
  }
}

export function SearchResultsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-otg-border p-4">
          <div className="flex items-center gap-4">
            <Skeleton variant="rounded" width={56} height={56} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchResults({ results, onResultClick }: SearchResultsProps) {
  return (
    <div className="space-y-6">
      {KIND_ORDER.map((kind) => {
        const group = results.filter((result) => result.kind === kind);
        if (group.length === 0) return null;

        return (
          <section key={kind}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-otg-text-muted">
              {kindIcon(kind)}
              <span>{KIND_LABELS[kind]}</span>
              <span className="text-xs font-normal">({group.length})</span>
            </h2>

            <ul className="space-y-2">
              <AnimatePresence>
                {group.map((result, index) => (
                  <motion.li
                    key={`${result.kind}-${result.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.04 }}
                  >
                    <SearchResultRow result={result} onClick={() => onResultClick?.(result)} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SearchResultRow({
  result,
  onClick,
}: {
  result: SearchResultItem;
  onClick?: () => void;
}) {
  const href = searchResultHref(result);

  const body = (
    <div className="flex items-center gap-4 rounded-xl border border-otg-border p-4 transition-colors hover:border-otg-sodium">
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-otg-bg text-otg-text-muted">
        {result.image ? (
          <Image
            src={result.image}
            alt=""
            width={56}
            height={56}
            className="h-full w-full object-cover"
          />
        ) : result.kind === 'user' ? (
          <span className="text-xl text-otg-text-bright">{result.title.charAt(0)}</span>
        ) : (
          kindIcon(result.kind)
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-otg-text-bright">{result.title}</h3>
        {result.subtitle && (
          <p className="truncate text-sm text-otg-text-muted">{result.subtitle}</p>
        )}
      </div>

      {href && <ChevronRight className="h-5 w-5 text-otg-text-muted" aria-hidden="true" />}
    </div>
  );

  if (!href) {
    return body;
  }

  return (
    <Link href={href} onClick={onClick} className="block">
      {body}
    </Link>
  );
}

export default SearchResults;
