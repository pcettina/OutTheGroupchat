/**
 * Client-side TypeScript shapes for V1 Intent endpoints.
 *
 * The server-side Prisma types (`Intent`, `Topic`) live behind
 * `@prisma/client`; these are the JSON-serialized shapes the UI consumes.
 * Dates arrive as ISO strings — components convert with `new Date(s)` when
 * formatting for display.
 */

import type { IntentState, WindowPreset } from '@prisma/client';

export interface IntentTopicSummary {
  id: string;
  slug: string;
  displayName: string;
}

export interface IntentUserSummary {
  id: string;
  name: string | null;
  image: string | null;
}

export interface IntentResponse {
  id: string;
  userId: string;
  topicId: string;
  windowPreset: WindowPreset;
  startAt: string | null;
  endAt: string | null;
  dayOffset: number;
  state: IntentState;
  cityArea: string | null;
  venueId: string | null;
  rawText?: string | null;
  expiresAt: string;
  createdAt: string;
  topic?: IntentTopicSummary;
  user?: IntentUserSummary;
}

export interface CreateIntentInput {
  rawText?: string;
  topicId?: string;
  windowPreset: WindowPreset;
  dayOffset?: number;
  startAt?: string;
  endAt?: string;
  cityArea?: string;
  venueId?: string;
}

export interface CreateIntentResponse {
  success: boolean;
  data?: IntentResponse;
  matchedKeywords?: string[];
  needsTopicPicker?: boolean;
  message?: string;
  error?: string;
}

/** UI-friendly metadata for each WindowPreset. Mirrors window-preset.ts hours. */
export const WINDOW_PRESET_META: Record<
  WindowPreset,
  { label: string; hint: string }
> = {
  EARLY_MORNING: { label: 'Early morning', hint: '5–8 AM' },
  MORNING: { label: 'Morning', hint: '8–11 AM' },
  BRUNCH: { label: 'Brunch', hint: '11 AM–2 PM' },
  AFTERNOON: { label: 'Afternoon', hint: '12–5 PM' },
  EVENING: { label: 'Evening', hint: '5–9 PM' },
  NIGHT: { label: 'Night', hint: '9 PM–2 AM' },
};

export const WINDOW_PRESET_ORDER: WindowPreset[] = [
  'EARLY_MORNING',
  'MORNING',
  'BRUNCH',
  'AFTERNOON',
  'EVENING',
  'NIGHT',
];

/** UI labels for the dayOffset picker. Index = dayOffset value (0..7). */
export const DAY_OFFSET_LABELS: readonly string[] = [
  'Today',
  'Tomorrow',
  'In 2 days',
  'In 3 days',
  'In 4 days',
  'In 5 days',
  'In 6 days',
  'In 7 days',
];
