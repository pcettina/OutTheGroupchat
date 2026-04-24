'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Calendar, MapPin, Users, Eye } from 'lucide-react';

export interface MeetupCardMeetup {
  id: string;
  title: string;
  description?: string | null;
  scheduledAt: string;
  endsAt?: string | null;
  venueName?: string | null;
  visibility: string;
  cancelled: boolean;
  host: {
    name: string | null;
    image: string | null;
  };
  _count?: {
    attendees: number;
  };
}

interface MeetupCardProps {
  meetup: MeetupCardMeetup;
}

// Last Call palette — brief §3. Visibility maps to the same role colors the rest of the
// app uses so a Crew-only meetup reads the same here as in the Crew inbox.
const VISIBILITY_LABELS: Record<string, { label: string; classes: string }> = {
  PUBLIC: {
    label: 'Public',
    classes: 'bg-otg-sodium/15 text-otg-sodium ring-1 ring-inset ring-otg-sodium/30',
  },
  CREW: {
    label: 'Crew',
    classes: 'bg-otg-tile/15 text-otg-tile ring-1 ring-inset ring-otg-tile/30',
  },
  INVITE_ONLY: {
    label: 'Invite only',
    classes: 'bg-otg-bourbon/15 text-otg-bourbon ring-1 ring-inset ring-otg-bourbon/30',
  },
  PRIVATE: {
    label: 'Private',
    classes: 'bg-otg-bg-dark text-otg-text-dim ring-1 ring-inset ring-otg-border',
  },
};

const FALLBACK_VIS = {
  label: 'Private',
  classes: 'bg-otg-bg-dark text-otg-text-dim ring-1 ring-inset ring-otg-border',
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MeetupCard({ meetup }: MeetupCardProps) {
  const vis = VISIBILITY_LABELS[meetup.visibility] ?? FALLBACK_VIS;

  return (
    <Link
      href={`/meetups/${meetup.id}`}
      className="block rounded-2xl border border-otg-border bg-otg-maraschino p-5 shadow-md transition hover:border-otg-sodium hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-otg-text-bright text-base leading-snug truncate">
            {meetup.title}
          </h3>
          {meetup.description && (
            <p className="text-sm text-otg-text-dim mt-0.5 line-clamp-2">
              {meetup.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${vis.classes}`}
          >
            {vis.label}
          </span>
          {meetup.cancelled && (
            <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-otg-danger/15 text-otg-danger ring-1 ring-inset ring-otg-danger/30">
              Cancelled
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5 text-sm text-otg-text-dim">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 shrink-0 text-otg-text-dim" aria-hidden="true" />
          <span>{formatDateTime(meetup.scheduledAt)}</span>
        </div>

        {meetup.venueName && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 shrink-0 text-otg-text-dim" aria-hidden="true" />
            <span className="truncate">{meetup.venueName}</span>
          </div>
        )}

        {typeof meetup._count?.attendees === 'number' && (
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 shrink-0 text-otg-text-dim" aria-hidden="true" />
            <span>
              {meetup._count.attendees}{' '}
              {meetup._count.attendees === 1 ? 'attendee' : 'attendees'}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-otg-border flex items-center gap-2">
        <div className="w-7 h-7 rounded-full overflow-hidden bg-otg-bg-dark border border-otg-border flex items-center justify-center shrink-0">
          {meetup.host.image ? (
            <Image
              src={meetup.host.image}
              alt={meetup.host.name ?? 'Host'}
              width={28}
              height={28}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs font-semibold text-otg-text-dim">
              {meetup.host.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </div>
        <span className="text-xs text-otg-text-dim truncate">
          Hosted by{' '}
          <span className="font-medium text-otg-text-bright">
            {meetup.host.name ?? 'Anonymous'}
          </span>
        </span>
        <Eye className="w-3.5 h-3.5 shrink-0 text-otg-text-dim/60 ml-auto" aria-hidden="true" />
      </div>
    </Link>
  );
}
