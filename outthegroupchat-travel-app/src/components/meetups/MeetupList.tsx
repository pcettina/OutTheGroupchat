'use client';

import { CalendarX } from 'lucide-react';
import MeetupCard, { type MeetupCardMeetup } from './MeetupCard';

interface MeetupListProps {
  meetups: MeetupCardMeetup[];
}

export default function MeetupList({ meetups }: MeetupListProps) {
  if (meetups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center">
        <CalendarX className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">No upcoming meetups</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Create the first one and get your Crew together.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {meetups.map((meetup) => (
        <li key={meetup.id}>
          <MeetupCard meetup={meetup} />
        </li>
      ))}
    </ul>
  );
}
