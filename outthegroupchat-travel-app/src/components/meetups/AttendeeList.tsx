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

// Last Call palette — brief §3. Section roles mirror RSVPButton so a meetup's
// attendee roster reads with the same color grammar as the RSVP action:
// GOING=sodium (primary affirmative), MAYBE=bourbon (warm hedge), DECLINED=tile
// (teal-neutral, Crew-scope; intentionally softer than a "danger" refusal).
const SECTIONS: SectionConfig[] = [
  {
    status: 'GOING',
    label: 'Going',
    headerClass: 'text-otg-sodium',
    countBadgeClass:
      'bg-otg-sodium/15 text-otg-sodium ring-1 ring-inset ring-otg-sodium/30',
  },
  {
    status: 'MAYBE',
    label: 'Maybe',
    headerClass: 'text-otg-bourbon',
    countBadgeClass:
      'bg-otg-bourbon/15 text-otg-bourbon ring-1 ring-inset ring-otg-bourbon/30',
  },
  {
    status: 'DECLINED',
    label: 'Declined',
    headerClass: 'text-otg-text-dim',
    countBadgeClass:
      'bg-otg-bg-dark text-otg-text-dim ring-1 ring-inset ring-otg-border',
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
    <div className="inline-flex items-center gap-2 rounded-full bg-otg-bg-dark/60 border border-otg-border px-3 py-1.5 hover:border-otg-sodium/40 transition-colors">
      <div className="w-8 h-8 rounded-full overflow-hidden bg-otg-maraschino border border-otg-border flex items-center justify-center shrink-0">
        {attendee.user.image ? (
          <Image
            src={attendee.user.image}
            alt={displayName}
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs font-semibold text-otg-text-dim">
            {initial}
          </span>
        )}
      </div>

      <span className="text-sm font-medium text-otg-text-bright truncate max-w-[140px]">
        {displayName}
      </span>

      {isHost && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-otg-bourbon/15 text-otg-bourbon ring-1 ring-inset ring-otg-bourbon/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          aria-label="Host"
        >
          <Crown className="w-3 h-3" aria-hidden="true" />
          Host
        </span>
      )}

      {isCheckedIn && (
        <CheckCircle2
          className="w-4 h-4 text-otg-tile shrink-0"
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
        className={`text-sm text-otg-text-dim font-serif italic ${className ?? ''}`.trim()}
      >
        Nobody has RSVP&apos;d yet. Be the first.
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
