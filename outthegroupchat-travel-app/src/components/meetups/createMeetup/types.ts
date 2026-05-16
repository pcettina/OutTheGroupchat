import type { MeetupVisibility } from '@/types/meetup';

export interface SelectedVenue {
  id: string;
  name: string;
  address?: string;
  city: string;
}

export const VISIBILITY_OPTIONS: { value: MeetupVisibility; label: string }[] = [
  { value: 'CREW', label: 'Crew only' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INVITE_ONLY', label: 'Invite only' },
  { value: 'PRIVATE', label: 'Private' },
];

// Last Call palette — brief §3. Inputs live on the dark app background, not a white card
// surface: `bg-otg-bg-dark` keeps them readable inside the `bg-otg-maraschino` modal
// without competing with the form labels. Focus rings use sodium.
export const inputClass =
  'w-full rounded-lg border border-otg-border bg-otg-bg-dark px-3 py-2 text-sm text-otg-text-bright placeholder:text-otg-text-dim/70 focus:border-otg-sodium focus:outline-none focus:ring-1 focus:ring-otg-sodium disabled:opacity-60';
