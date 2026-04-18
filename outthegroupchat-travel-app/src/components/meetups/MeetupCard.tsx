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

const VISIBILITY_LABELS: Record<string, { label: string; classes: string }> = {
  PUBLIC: {
    label: 'Public',
    classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  CREW: {
    label: 'Crew',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  INVITE_ONLY: {
    label: 'Invite Only',
    classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  PRIVATE: {
    label: 'Private',
    classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
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
  const vis = VISIBILITY_LABELS[meetup.visibility] ?? {
    label: meetup.visibility,
    classes: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };

  return (
    <Link
      href={`/meetups/${meetup.id}`}
      className="block rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 hover:shadow-md transition hover:border-slate-300 dark:hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white text-base leading-snug truncate">
            {meetup.title}
          </h3>
          {meetup.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
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
            <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              Cancelled
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 shrink-0 text-slate-400" />
          <span>{formatDateTime(meetup.scheduledAt)}</span>
        </div>

        {meetup.venueName && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
            <span className="truncate">{meetup.venueName}</span>
          </div>
        )}

        {typeof meetup._count?.attendees === 'number' && (
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 shrink-0 text-slate-400" />
            <span>
              {meetup._count.attendees}{' '}
              {meetup._count.attendees === 1 ? 'attendee' : 'attendees'}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
          {meetup.host.image ? (
            <Image
              src={meetup.host.image}
              alt={meetup.host.name ?? 'Host'}
              width={28}
              height={28}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs font-semibold text-slate-500">
              {meetup.host.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
          Hosted by{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {meetup.host.name ?? 'Anonymous'}
          </span>
        </span>
        <Eye className="w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-slate-600 ml-auto" />
      </div>
    </Link>
  );
}
