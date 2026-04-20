/**
 * @module checkin-types
 * TypeScript interfaces and enum constants for the CheckIn domain (Phase 5 — Check-ins & live presence).
 * Frontend-safe — does not import from @prisma/client so these can be used
 * in 'use client' components without a server-side Prisma dependency.
 */

// ─── Enum constants (mirror Prisma enums) ──────────────────────────────────

export const CheckInVisibility = {
  PUBLIC: 'PUBLIC',
  CREW: 'CREW',
  PRIVATE: 'PRIVATE',
} as const;
export type CheckInVisibility = (typeof CheckInVisibility)[keyof typeof CheckInVisibility];

// ─── User preview (minimal, safe for client) ────────────────────────────────

export interface CheckInUserPreview {
  id: string;
  name: string | null;
  image: string | null;
}

// ─── Venue preview (minimal shape for embedded venue data) ──────────────────

export interface CheckInVenuePreview {
  id: string;
  name: string;
  address: string | null;
}

// ─── CheckIn responses ───────────────────────────────────────────────────────

/**
 * Full check-in payload returned by GET /api/checkins/[checkInId]
 * and POST /api/checkins.
 */
export interface CheckInResponse {
  id: string;
  userId: string;
  venueId: string | null;
  venueName: string | null;
  cityId: string | null;
  note: string | null;
  visibility: CheckInVisibility;
  activeUntil: string; // ISO 8601 datetime
  latitude: number | null;
  longitude: number | null;
  createdAt: string; // ISO 8601 datetime
  // Prisma-joined relations
  user?: CheckInUserPreview;
  venue?: CheckInVenuePreview | null;
}

/**
 * Check-in feed item — same as CheckInResponse but with `user` required,
 * since feed items always include the author's profile.
 */
export interface CheckInFeedItem extends CheckInResponse {
  user: CheckInUserPreview;
}

// ─── Input types ─────────────────────────────────────────────────────────────

/** Body for POST /api/checkins. */
export interface CreateCheckInInput {
  venueId?: string;
  venueName?: string;
  cityId?: string;
  note?: string; // max 200 chars
  visibility?: CheckInVisibility;
  latitude?: number;
  longitude?: number;
  /** ISO 8601 datetime. Clamped server-side to now+30min through now+12h. */
  activeUntilOverride?: string;
}

// ─── Feed response ────────────────────────────────────────────────────────────

/** Response shape for GET /api/checkins/feed. */
export interface CheckInFeedResponse {
  checkIns: CheckInFeedItem[];
  total: number;
}
