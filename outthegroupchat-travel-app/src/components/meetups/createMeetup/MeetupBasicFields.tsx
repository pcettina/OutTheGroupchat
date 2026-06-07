'use client';

import { inputClass } from './types';

interface MeetupBasicFieldsProps {
  title: string;
  description: string;
  submitting: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

export function MeetupBasicFields({
  title,
  description,
  submitting,
  onTitleChange,
  onDescriptionChange,
}: MeetupBasicFieldsProps) {
  return (
    <>
      {/* Title */}
      <div>
        <label
          htmlFor="meetup-title"
          className="mb-1.5 block text-sm font-medium text-otg-text-bright"
        >
          Title <span className="text-otg-sodium" aria-hidden="true">*</span>
        </label>
        <input
          id="meetup-title"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Rooftop hangout"
          disabled={submitting}
          required
          className={inputClass}
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="meetup-description"
          className="mb-1.5 block text-sm font-medium text-otg-text-bright"
        >
          Description
        </label>
        <textarea
          id="meetup-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="What’s the vibe?"
          rows={3}
          disabled={submitting}
          className={`${inputClass} resize-none`}
        />
      </div>
    </>
  );
}
