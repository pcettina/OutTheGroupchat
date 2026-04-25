/**
 * Client-side TypeScript shapes for V1 Phase 2 SubCrew endpoints.
 */

import type { SubCrewJoinMode, WindowPreset } from '@prisma/client';
import type { IntentTopicSummary, IntentUserSummary } from './intent';

export interface SubCrewMemberResponse {
  id: string;
  userId: string;
  joinMode: SubCrewJoinMode;
  joinedAt: string;
  intentId?: string | null;
  user: IntentUserSummary;
}

export interface SubCrewResponse {
  id: string;
  topicId: string;
  windowPreset: WindowPreset;
  startAt: string;
  endAt: string;
  cityArea: string | null;
  venueId?: string | null;
  meetupId?: string | null;
  createdAt: string;
  topic?: IntentTopicSummary;
  members: SubCrewMemberResponse[];
}
