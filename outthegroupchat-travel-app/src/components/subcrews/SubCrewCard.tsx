'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Clock, Users, MapPin } from 'lucide-react';
import type { SubCrewResponse } from '@/types/subcrew';
import { WINDOW_PRESET_META } from '@/types/intent';

interface SubCrewCardProps {
  subCrew: SubCrewResponse;
  /** Optional CTA slot (e.g. ImInButton for emerging cards). */
  cta?: React.ReactNode;
  /** Wrap whole card in a Link to /subcrews/[id] (default true). */
  linkToDetail?: boolean;
}

export function SubCrewCard({ subCrew, cta, linkToDetail = true }: SubCrewCardProps) {
  const topic = subCrew.topic?.displayName ?? 'Something';
  const window = WINDOW_PRESET_META[subCrew.windowPreset];
  const memberCount = subCrew.members.length;

  const inner = (
    <div
      data-testid="subcrew-card"
      className="rounded-2xl border border-otg-border bg-otg-surface/60 p-5 transition hover:border-otg-sodium/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-otg-text-bright">{topic}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-otg-text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {window.label} <span className="opacity-60">({window.hint})</span>
            </span>
            {subCrew.cityArea && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {subCrew.cityArea.replace(/-/g, ' ')}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden="true" />
              {memberCount}
            </span>
          </div>
        </div>
        {cta && <div className="flex-shrink-0">{cta}</div>}
      </div>

      <ul className="mt-3 flex -space-x-2">
        {subCrew.members.slice(0, 5).map((m) => (
          <li key={m.id} title={m.user.name ?? 'Member'}>
            {m.user.image ? (
              <Image
                src={m.user.image}
                alt={m.user.name ?? 'Member'}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full border-2 border-otg-surface object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-otg-surface bg-otg-bg text-[10px] font-semibold text-otg-text-bright">
                {(m.user.name ?? '?')[0]?.toUpperCase()}
              </span>
            )}
          </li>
        ))}
        {memberCount > 5 && (
          <li className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-otg-surface bg-otg-bg text-[10px] font-medium text-otg-text-muted">
            +{memberCount - 5}
          </li>
        )}
      </ul>
    </div>
  );

  if (!linkToDetail) return inner;

  return (
    <Link href={`/subcrews/${subCrew.id}`} className="block">
      {inner}
    </Link>
  );
}
