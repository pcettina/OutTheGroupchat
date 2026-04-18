'use client';

import Image from 'next/image';
import { CheckCircle2, Crown } from 'lucide-react';
import type { AttendeeResponse, AttendeeStatus } from '@/types/meetup';

interface AttendeeListProps {
  attendees: AttendeeResponse[];
  hostId: string;
  className?: string;
}

interface SectionConfig {
  status: AttendeeStatus;
  label: string;
  headerClass: string;
  countBadgeClass: string;
}

const SECTIONS: SectionConfig[] = [
  {
    status: 'GOING',
    label: 'Going',
    headerClass: 'text-emerald-700 dark:text-emerald-300',
    countBadgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  {
    status: 'MAYBE',
    label: 'Maybe',
    headerClass: 'text-amber-700 dark:text-amber-300',
    countBadgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  {
    status: 'DECLINED',
    label: 'Declined',
    headerClass: 'text-slate-600 dark:text-slate-400',
    countBadgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
];

interface AttendeeRowProps {
  attendee: AttendeeResponse;
  isHost: boolean;
}

function AttendeeRow({ attendee, isHost }: AttendeeRowProps) {
  const displayName = attendee.user.name ?? 'Anonymous';
  const initial = attendee.user.name?.[0]?.toUpperCase() ?? '?';
  const isCheckedIn = attendee.checkedInAt !== null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
        {attendee.user.image ? (
          <Image
            src={attendee.user.image}
            alt={displayName}
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
            {initial}
          </span>
        )}
      </div>

      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
        {displayName}
      </span>

      {isHost && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          aria-label="Host"
        >
          <Crown className="w-3 h-3" aria-hidden="true" />
          Host
        </span>
      )}

      {isCheckedIn && (
        <CheckCircle2
          className="w-4 h-4 text-emerald-500 shrink-0"
          aria-label="Checked in at venue"
        />
      )}
    </div>
  );
}

export function AttendeeList({ attendees, hostId, className }: AttendeeListProps) {
  if (attendees.length === 0) {
    return (
      <div
        className={`text-sm text-slate-500 dark:text-slate-400 italic ${className ?? ''}`.trim()}
      >
        No attendees yet — be the first to RSVP!
      </div>
    );
  }

  const grouped: Record<AttendeeStatus, AttendeeResponse[]> = {
    GOING: [],
    MAYBE: [],
    DECLINED: [],
  };

  for (const attendee of attendees) {
    grouped[attendee.status].push(attendee);
  }

  return (
    <div className={`space-y-5 ${className ?? ''}`.trim()}>
      {SECTIONS.map((section) => {
        const sectionAttendees = grouped[section.status];
        if (sectionAttendees.length === 0) return null;

        return (
          <section key={section.status} aria-labelledby={`attendees-${section.status.toLowerCase()}`}>
            <div className="flex items-center gap-2 mb-2">
              <h3
                id={`attendees-${section.status.toLowerCase()}`}
                className={`text-sm font-semibold ${section.headerClass}`}
              >
                {section.label}
              </h3>
              <span
                className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${section.countBadgeClass}`}
                aria-label={`${sectionAttendees.length} ${section.label.toLowerCase()}`}
              >
                {sectionAttendees.length}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {sectionAttendees.map((attendee) => (
                <AttendeeRow
                  key={attendee.id}
                  attendee={attendee}
                  isHost={attendee.userId === hostId}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default AttendeeList;
