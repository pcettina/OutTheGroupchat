/**
 * @module lib/subcrews/graduate-to-meetup
 * @description Graduate a coordinated SubCrew into a durable Meetup.
 *
 * A SubCrew "graduates" once it has BOTH a frozen time (`startAt`) AND a bound
 * venue (`venueId`). Graduation is a one-way, idempotent transition:
 *   - Create a Meetup from the SubCrew's time/venue.
 *   - Attach every SubCrewMember as a MeetupAttendee.
 *   - Set `SubCrew.meetupId` to the new Meetup (single source of truth).
 *
 * Idempotency: the whole operation runs inside a transaction that (1) re-reads
 * `SubCrew.meetupId` and returns the existing Meetup if already set, and
 * (2) claims the SubCrew with a guarded `updateMany` on `meetupId: null`. If a
 * concurrent freeze already claimed it, the guard's count is 0, the transaction
 * rolls back (discarding the just-created Meetup), and we return the existing
 * Meetup. `SubCrew.meetupId` is also `@unique`, providing a DB-level backstop.
 */

import { MeetupVisibility } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/** Fields returned for a graduated Meetup. */
const graduatedMeetupSelect = {
  id: true,
  title: true,
  hostId: true,
  venueId: true,
  scheduledAt: true,
  endsAt: true,
  visibility: true,
  createdAt: true,
} as const;

export interface GraduatedMeetup {
  id: string;
  title: string;
  hostId: string;
  venueId: string | null;
  scheduledAt: Date;
  endsAt: Date | null;
  visibility: MeetupVisibility;
  createdAt: Date;
}

export type GraduateResult =
  | { status: 'not_eligible' }
  | { status: 'already_graduated'; meetup: GraduatedMeetup; memberCount: number }
  | { status: 'created'; meetup: GraduatedMeetup; memberCount: number };

export interface GraduateArgs {
  subCrewId: string;
  /** User who becomes the Meetup host — must be a SEED member (verified by caller). */
  hostId: string;
}

/** Thrown inside the transaction when a concurrent freeze won the claim race. */
class ConcurrentGraduationError extends Error {
  constructor() {
    super('SubCrew was graduated concurrently');
    this.name = 'ConcurrentGraduationError';
  }
}

/** Build a Meetup title from the SubCrew's topic (clamped to the 100-char column). */
function buildTitle(topicDisplayName: string | null | undefined): string {
  const base = topicDisplayName?.trim();
  const title = base ? `${base} meetup` : 'SubCrew meetup';
  return title.length > 100 ? title.slice(0, 100) : title;
}

/**
 * Graduate a SubCrew into a Meetup. Safe to call after any freeze/PATCH:
 * returns `not_eligible` when time or venue is missing, `already_graduated`
 * when a Meetup already exists (no-op), or `created` on first graduation.
 */
export async function graduateSubCrewToMeetup(
  prisma: PrismaClient,
  { subCrewId, hostId }: GraduateArgs,
): Promise<GraduateResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const subCrew = await tx.subCrew.findUnique({
        where: { id: subCrewId },
        select: {
          meetupId: true,
          startAt: true,
          endAt: true,
          venueId: true,
          topic: { select: { displayName: true } },
          members: { select: { userId: true } },
        },
      });

      // Missing SubCrew, or not both time + venue frozen → skip silently.
      if (!subCrew || !subCrew.startAt || !subCrew.venueId) {
        return { status: 'not_eligible' } as const;
      }

      const memberCount = subCrew.members.length;

      // Already graduated → return the existing Meetup unchanged (no double-create).
      if (subCrew.meetupId) {
        const existing = await tx.meetup.findUnique({
          where: { id: subCrew.meetupId },
          select: graduatedMeetupSelect,
        });
        if (existing) {
          return { status: 'already_graduated', meetup: existing, memberCount } as const;
        }
      }

      const meetup = await tx.meetup.create({
        data: {
          title: buildTitle(subCrew.topic?.displayName),
          hostId,
          venueId: subCrew.venueId,
          scheduledAt: subCrew.startAt,
          endsAt: subCrew.endAt ?? undefined,
          visibility: MeetupVisibility.CREW,
        },
        select: graduatedMeetupSelect,
      });

      // Guarded claim: only succeeds while meetupId is still null. A concurrent
      // freeze that already claimed the SubCrew makes count 0 → roll back.
      const claim = await tx.subCrew.updateMany({
        where: { id: subCrewId, meetupId: null },
        data: { meetupId: meetup.id },
      });
      if (claim.count === 0) {
        throw new ConcurrentGraduationError();
      }

      // Every member becomes an attendee (GOING by default). Dedupe defensively.
      if (memberCount > 0) {
        await tx.meetupAttendee.createMany({
          data: subCrew.members.map((m) => ({ meetupId: meetup.id, userId: m.userId })),
          skipDuplicates: true,
        });
      }

      return { status: 'created', meetup, memberCount } as const;
    });
  } catch (error) {
    if (error instanceof ConcurrentGraduationError) {
      // Lost the race: the winner has set meetupId. Return their Meetup.
      const subCrew = await prisma.subCrew.findUnique({
        where: { id: subCrewId },
        select: { meetupId: true, members: { select: { userId: true } } },
      });
      if (subCrew?.meetupId) {
        const meetup = await prisma.meetup.findUnique({
          where: { id: subCrew.meetupId },
          select: graduatedMeetupSelect,
        });
        if (meetup) {
          return {
            status: 'already_graduated',
            meetup,
            memberCount: subCrew.members.length,
          };
        }
      }
    }
    throw error;
  }
}
