/**
 * @module types/notification-preference
 * @description Shared request/response types for the V1 Phase 5
 * notification-preferences API (`/api/users/notification-preferences`).
 */
import type { NotificationPreferenceTrigger } from '@prisma/client';

/**
 * A single notification-preference entry as returned to the client.
 * Mirrors a `NotificationPreference` row, but with a defaulted shape so the
 * GET endpoint can always return all three triggers even when no row exists.
 */
export interface NotificationPreferenceResponse {
  trigger: NotificationPreferenceTrigger;
  /** Whether the user has opted in to this trigger. Defaults to false. */
  enabled: boolean;
  /** "HH:mm" 24-hour local time; only meaningful for DAILY_PROMPT. */
  schedule: string | null;
  /** Crew member user IDs; only meaningful for PER_MEMBER_INTENT. */
  perMemberTargets: string[];
}

/**
 * GET /api/users/notification-preferences success payload.
 * Always contains exactly one entry per `NotificationPreferenceTrigger`.
 */
export interface NotificationPreferencesGetResponse {
  success: true;
  data: {
    preferences: NotificationPreferenceResponse[];
  };
}

/**
 * Validated body for PATCH /api/users/notification-preferences.
 * `schedule` is only meaningful for DAILY_PROMPT; `perMemberTargets` is only
 * meaningful for PER_MEMBER_INTENT.
 */
export interface UpdateNotificationPreferenceInput {
  trigger: NotificationPreferenceTrigger;
  enabled: boolean;
  schedule?: string;
  perMemberTargets?: string[];
}

/**
 * PATCH /api/users/notification-preferences success payload.
 */
export interface NotificationPreferencePatchResponse {
  success: true;
  data: NotificationPreferenceResponse;
}
