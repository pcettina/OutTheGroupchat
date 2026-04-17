/**
 * @module social-validations
 * Zod schemas for the social domain — crews, meetups, check-ins, polls, venues.
 * Used by Phase 3–5 API routes for request validation.
 */
import { z } from 'zod'

// ─── Crew ───────────────────────────────────────────────────
export const CrewRequestSchema = z.object({
  targetUserId: z.string().cuid(),
})

export const CrewStatusUpdateSchema = z.object({
  action: z.enum(['accept', 'decline', 'block']),
})

// ─── Meetups ────────────────────────────────────────────────
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

export const MeetupUpdateSchema = MeetupCreateSchema.partial()

export const MeetupRsvpSchema = z.object({
  status: z.enum(['GOING', 'MAYBE', 'DECLINED']),
})

export const MeetupInviteSchema = z.object({
  userIds: z.array(z.string().cuid()).min(1).max(50),
})

// ─── Check-ins ──────────────────────────────────────────────
export const CheckInCreateSchema = z.object({
  venueId: z.string().cuid().optional(),
  venueName: z.string().max(120).optional(),
  note: z.string().max(280).optional(),
  visibility: z.enum(['PUBLIC', 'CREW', 'PRIVATE']).default('CREW'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

// ─── Polls ──────────────────────────────────────────────────
export const PollCreateSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['SURVEY', 'VOTE', 'RSVP_POLL']),
  options: z.array(z.object({ text: z.string().min(1).max(100) })).min(2).max(10),
  meetupId: z.string().cuid().optional(),
  expiresAt: z.string().datetime().optional(),
})

export const PollResponseSchema = z.object({
  optionIds: z.array(z.string().cuid()).min(1),
})

// ─── Venues ─────────────────────────────────────────────────
export const VenueSearchSchema = z.object({
  query: z.string().min(1).max(100),
  city: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  radius: z.number().min(0.1).max(50).default(5),
  category: z.enum(['BAR', 'COFFEE', 'RESTAURANT', 'PARK', 'GYM', 'COWORKING', 'OTHER']).optional(),
})

// ─── Users ──────────────────────────────────────────────────
export const ProfileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  image: z.string().url().optional(),
})

// ─── Crew label (user customization) ─────────────────────────
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
