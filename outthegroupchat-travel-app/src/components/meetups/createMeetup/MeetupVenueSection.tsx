'use client';

import { VenuePicker } from '../VenuePicker';
import { inputClass, type SelectedVenue } from './types';

interface MeetupVenueSectionProps {
  selectedVenue: SelectedVenue | null;
  freeTextVenue: string;
  paramVenueId: string;
  submitting: boolean;
  onSelectedVenueChange: (venue: SelectedVenue | null) => void;
  onFreeTextVenueChange: (value: string) => void;
}

export function MeetupVenueSection({
  selectedVenue,
  freeTextVenue,
  paramVenueId,
  submitting,
  onSelectedVenueChange,
  onFreeTextVenueChange,
}: MeetupVenueSectionProps) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-otg-text-bright">
        Venue
      </span>
      <VenuePicker
        value={selectedVenue}
        onChange={onSelectedVenueChange}
        className="mb-2"
      />
      {!selectedVenue && (
        <>
          {paramVenueId && !freeTextVenue && (
            <p className="mb-1.5 text-xs text-otg-text-dim">
              Venue from your check-in will be used. Type below to override.
            </p>
          )}
          <input
            type="text"
            value={freeTextVenue}
            onChange={(e) => onFreeTextVenueChange(e.target.value)}
            placeholder={
              paramVenueId ? 'Override venue name (optional)' : 'Or type a venue name'
            }
            disabled={submitting}
            className={inputClass}
          />
        </>
      )}
    </div>
  );
}
