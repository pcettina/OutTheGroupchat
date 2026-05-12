/**
 * @module social-validations
 *
 * Zod request-body schemas for the social-graph API surface: Crew, Meetup,
 * CheckIn, Poll, Venue, and Profile routes. Centralizing the schemas keeps the
 * Phase 3–5 routes thin (parse → call service) and gives test fixtures a
 * single source of truth for accepted payload shapes and constraint bounds.
 *
 * Conventions:
 * - All ID fields are validated as CUIDs (Prisma default ID format).
 * - String length caps mirror the Prisma column limits where defined.
 * - Datetime fields accept ISO-8601 strings (z.string().datetime()), not Date
 *   objects — routes coerce via `new Date(...)` after validation.
 * - Enums mirror Prisma enums of the same name; keep them in sync when the
 *   schema changes.
 */
import { z } from 'zod'

// ─── Crew ───────────────────────────────────────────────────

/**
 * Body schema for POST /api/crew (send a Crew request).
 * Validates that the target user's id is a valid CUID. The route layer is
 * responsible for blocking self-requests and duplicate requests — those are
 * not expressible as Zod constraints.
 */
export const CrewRequestSchema = z.object({
  targetUserId: z.string().cuid(),
})

/**
 * Body schema for PATCH /api/crew/[crewId] — Crew request lifecycle action.
 * `action` drives the state machine on CrewMember: accept (PENDING → ACCEPTED),
 * decline (PENDING → DECLINED), or block (any → BLOCKED). The route enforces
 * that only the receiver can accept/decline.
 */
export const CrewStatusUpdateSchema = z.object({
  action: z.enum(['accept', 'decline', 'block']),
})

// ─── Meetups ────────────────────────────────────────────────

/**
 * Body schema for POST /api/meetups — create a meetup.
 *
 * Constraints worth knowing:
 * - `title`: 1–120 chars (matches Prisma column limit).
 * - `description`: 0–500 chars, optional.
 * - `venueId` (CUID, internal venue) and `venueName` (free text, max 120) are
 *   mutually-supportive: either an internal Venue ref or a one-off label.
 *   The route layer requires at least one of them; Zod does not enforce that.
 * - `scheduledAt` is required ISO-8601. `endsAt` is optional; the route layer
 *   validates endsAt > scheduledAt.
 * - `visibility` defaults to 'CREW' (Crew-only feed) to match the privacy-first
 *   product stance — public meetups must be explicit.
 * - `capacity`: 2–500 attendees. 1 is rejected (a "meetup" of one is not a meetup).
 */
export const MeetupCreateSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  venueId: z.string().cuid().optional(),
  venueName: z.string().max(120).optional(),
  scheduledAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  visibility: z.enum(['PUBLIC', 'CREW', 'INVITE_ONLY', 'PRIVATE']).default('CREW'),
  capacity: z.number().int().min(2).max(500).optional(),
})

/**
 * Body schema for PATCH /api/meetups/[id] — partial meetup update.
 * Derived from {@link MeetupCreateSchema} via `.partial()` so all fields become
 * optional. The route layer permits only the meetup owner to edit and locks
 * `scheduledAt` once the meetup has started.
 */
export const MeetupUpdateSchema = MeetupCreateSchema.partial()

/**
 * Body schema for POST /api/meetups/[id]/rsvp — set or change RSVP status.
 * Mirrors the Prisma `RSVPStatus` enum. Note PENDING is not accepted here —
 * a user explicitly choosing GOING / MAYBE / DECLINED leaves the pending
 * state, so the route only accepts terminal-decision values.
 */
export const MeetupRsvpSchema = z.object({
  status: z.enum(['GOING', 'MAYBE', 'DECLINED']),
})

/**
 * Body schema for POST /api/meetups/[id]/invite — invite users to a meetup.
 * Capped at 50 invites per request to keep one POST from triggering a
 * notification storm. Each id must be a CUID. The route deduplicates against
 * existing MeetupInvite rows for idempotency.
 */
export const MeetupInviteSchema = z.object({
  userIds: z.array(z.string().cuid()).min(1).max(50),
})

// ─── Check-ins ──────────────────────────────────────────────

/**
 * Body schema for POST /api/checkins — drop a "I'm out here right now" pin.
 *
 * Constraints worth knowing:
 * - `venueId` and `venueName` are both optional but the route requires one
 *   (cross-field rule enforced post-parse).
 * - `note` is a Twitter-length 280-char cap.
 * - `visibility` defaults to 'CREW' (only accepted Crew sees it). PUBLIC
 *   surfaces it on the city feed; PRIVATE keeps it as a personal record.
 * - `latitude` / `longitude` are accepted unbounded here; the route layer
 *   clamps to [-90, 90] / [-180, 180] and is responsible for any precision
 *   reduction needed for privacy.
 * - The route also clamps `activeUntilOverride` (not in this schema) to
 *   [now+30min, now+12h] with a default of now+6h.
 */
export const CheckInCreateSchema = z.object({
  venueId: z.string().cuid().optional(),
  venueName: z.string().max(120).optional(),
  note: z.string().max(280).optional(),
  visibility: z.enum(['PUBLIC', 'CREW', 'PRIVATE']).default('CREW'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

// ─── Polls ──────────────────────────────────────────────────

/**
 * Body schema for POST /api/polls — create a poll attached (optionally) to a
 * meetup. Used for "where should we go?" / RSVP-style coordination.
 *
 * Constraints:
 * - `title`: 1–200 chars.
 * - `type`: SURVEY (multi-question Likert-style), VOTE (single-choice), or
 *   RSVP_POLL (specialized going/maybe/decline poll, usually tied to a meetup).
 * - `options`: 2–10 entries; each `text` is 1–100 chars.
 * - `meetupId` optional — when present, the poll is scoped to that meetup's
 *   attendees and the route verifies the caller is the meetup owner.
 * - `expiresAt` optional ISO-8601; route auto-closes polling after this time.
 */
export const PollCreateSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['SURVEY', 'VOTE', 'RSVP_POLL']),
  options: z.array(z.object({ text: z.string().min(1).max(100) })).min(2).max(10),
  meetupId: z.string().cuid().optional(),
  expiresAt: z.string().datetime().optional(),
})

/**
 * Body schema for POST /api/polls/[id]/responses — submit a poll response.
 * `optionIds` is a non-empty array of PollOption CUIDs. For single-choice
 * polls the route validates length === 1; multi-choice polls accept up to the
 * number of options. Duplicate responses from the same user are upserted.
 */
export const PollResponseSchema = z.object({
  optionIds: z.array(z.string().cuid()).min(1),
})

// ─── Venues ─────────────────────────────────────────────────

/**
 * Query/body schema for GET /api/venues/search — find venues by name + locale.
 *
 * Constraints:
 * - `query`: 1–100 chars (free-text venue name fragment).
 * - `city`: optional textual filter, complements lat/lng radius search.
 * - `latitude`/`longitude`: optional geo-anchor for distance ranking.
 *   Bounds are NOT enforced here — the route normalizes to [-90, 90] /
 *   [-180, 180] before querying Prisma + Google Places.
 * - `radius`: search radius in km, 0.1–50, default 5. Wider radii are
 *   refused to keep result sets bounded.
 * - `category`: optional Venue category filter mirroring the Prisma enum.
 */
export const VenueSearchSchema = z.object({
  query: z.string().min(1).max(100),
  city: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  radius: z.number().min(0.1).max(50).default(5),
  category: z.enum(['BAR', 'COFFEE', 'RESTAURANT', 'PARK', 'GYM', 'COWORKING', 'OTHER']).optional(),
})

// ─── Users ──────────────────────────────────────────────────

/**
 * Body schema for PATCH /api/users/me — profile self-edit.
 * All fields optional so the client can send a partial patch.
 *
 * Constraints:
 * - `name`: 1–100 chars (empty string rejected; clients should omit the field
 *   rather than send "" to leave name unchanged).
 * - `bio`: 0–300 chars, optional. Empty string allowed to clear the bio.
 * - `city`: 0–100 chars, optional.
 * - `image`: must be a valid URL — sanitization and image-host allowlisting
 *   live in the route layer.
 */
export const ProfileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  image: z.string().url().optional(),
})

// ─── Crew label (user customization) ─────────────────────────

/**
 * Body schema for PATCH /api/users/me/crew-label — rename what this user
 * calls their "Crew" (e.g. "Squad", "Crew", "The Gang"). Surfaces as the
 * label on CrewList / CrewButton.
 *
 * Constraints:
 * - 1–20 chars when set.
 * - Whitelist regex: `[A-Za-z0-9 ]+` — letters, numbers, spaces only.
 *   Emoji, punctuation, and unicode are rejected to keep the label readable
 *   in dense UI (button labels, navigation chips, push notifications).
 * - `null` is accepted explicitly to reset to the default ("Crew").
 */
export const CrewLabelUpdateSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9 ]+$/, 'Letters, numbers, and spaces only')
    .nullable(),
})

// ─── Inferred types ─────────────────────────────────────────
export type CrewRequest = z.infer<typeof CrewRequestSchema>
export type MeetupCreate = z.infer<typeof MeetupCreateSchema>
export type MeetupRsvp = z.infer<typeof MeetupRsvpSchema>
export type CheckInCreate = z.infer<typeof CheckInCreateSchema>
export type PollCreate = z.infer<typeof PollCreateSchema>
export type VenueSearch = z.infer<typeof VenueSearchSchema>
export type CrewLabelUpdate = z.infer<typeof CrewLabelUpdateSchema>
