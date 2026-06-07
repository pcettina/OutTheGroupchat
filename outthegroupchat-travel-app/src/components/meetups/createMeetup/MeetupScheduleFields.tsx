'use client';

import type { MeetupVisibility } from '@/types/meetup';
import { inputClass, VISIBILITY_OPTIONS } from './types';

interface MeetupScheduleFieldsProps {
  scheduledAt: string;
  endsAt: string;
  visibility: MeetupVisibility;
  capacity: string;
  submitting: boolean;
  onScheduledAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onVisibilityChange: (value: MeetupVisibility) => void;
  onCapacityChange: (value: string) => void;
}

export function MeetupScheduleFields({
  scheduledAt,
  endsAt,
  visibility,
  capacity,
  submitting,
  onScheduledAtChange,
  onEndsAtChange,
  onVisibilityChange,
  onCapacityChange,
}: MeetupScheduleFieldsProps) {
  return (
    <>
      {/* Date & Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="meetup-scheduled-at"
            className="mb-1.5 block text-sm font-medium text-otg-text-bright"
          >
            Date &amp; time <span className="text-otg-sodium" aria-hidden="true">*</span>
          </label>
          <input
            id="meetup-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            disabled={submitting}
            required
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>
        <div>
          <label
            htmlFor="meetup-ends-at"
            className="mb-1.5 block text-sm font-medium text-otg-text-bright"
          >
            End time
          </label>
          <input
            id="meetup-ends-at"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => onEndsAtChange(e.target.value)}
            disabled={submitting}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </div>
      </div>

      {/* Visibility */}
      <div>
        <label
          htmlFor="meetup-visibility"
          className="mb-1.5 block text-sm font-medium text-otg-text-bright"
        >
          Visibility
        </label>
        <select
          id="meetup-visibility"
          value={visibility}
          onChange={(e) => onVisibilityChange(e.target.value as MeetupVisibility)}
          disabled={submitting}
          className={inputClass}
        >
          {VISIBILITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Capacity */}
      <div>
        <label
          htmlFor="meetup-capacity"
          className="mb-1.5 block text-sm font-medium text-otg-text-bright"
        >
          Capacity <span className="text-otg-text-dim font-normal">(2–500)</span>
        </label>
        <input
          id="meetup-capacity"
          type="number"
          value={capacity}
          onChange={(e) => onCapacityChange(e.target.value)}
          min={2}
          max={500}
          placeholder="No limit"
          disabled={submitting}
          className={inputClass}
        />
      </div>
    </>
  );
}
