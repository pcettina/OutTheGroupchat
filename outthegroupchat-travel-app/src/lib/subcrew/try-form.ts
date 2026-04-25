/**
 * @module subcrew/try-form
 * @description V1 Phase 2 — auto-formation of SubCrews (R2, R8, R17).
 *
 * Called from POST /api/intents (and on PATCH state transitions). Scans for
 * other live INTERESTED Intents that:
 *   - belong to one of the focal user's ACCEPTED Crew partners
 *   - share the focal Intent's `topicId`
 *   - have a matching `windowPreset` (exact or adjacent — R11/R17)
 *   - are not yet expired
 *   - share the focal `cityArea` if both supply one (else: any)
 *   - belong to a Crew partner who isn't already in an active SubCrew with
 *     the focal user for the same (topic, window) — prevents duplicates
 *
 * For each candidate user, only one Intent is selected (the closest preset
 * match) — this is the R17 "adjacent-window collapse" safeguard against a
 * single user spawning two SubCrews from a hedge like EVENING + NIGHT.
 *
 * If at least one candidate exists, a SubCrew is created with the focal Intent
 * + the closest match as seed members, and SUBCREW_FORMED notifications are
 * sent to both. Returns the created SubCrew or `null` if no match.
 */

import type { PrismaClient, Prisma, Intent, WindowPreset } from '@prisma/client';
import { adjacentPresets, presetDistance } from './window-adjacency';

/** Subset of Prisma client surface needed for formation. */
export type FormSubCrewPrisma = Pick<
  PrismaClient,
  'crew' | 'intent' | 'subCrew' | 'subCrewMember' | 'notification'
>;

export interface FormationResult {
  subCrewId: string;
  seedUserIds: string[];
}

interface FormationCandidate {
  intent: Pick<Intent, 'id' | 'userId' | 'windowPreset' | 'startAt' | 'endAt' | 'cityArea'>;
  distance: number;
}

/**
 * Attempt to form a SubCrew around the given focal Intent. Idempotent in
 * practice — if a matching SubCrew already exists for the (focalUser, partner,
 * topic, window) tuple, no new row is created.
 *
 * @param focal The Intent that just got created or transitioned.
 * @param prisma Prisma client (or test stub) with the `crew/intent/subCrew/subCrewMember/notification` delegates.
 * @returns The created SubCrew + seed userIds, or `null` if no eligible match.
 */
export async function tryFormSubCrew(
  focal: Intent,
  prisma: FormSubCrewPrisma,
): Promise<FormationResult | null> {
  // Only INTERESTED Intents trigger formation. COMMITTED transitions are
  // handled separately in Phase 3.
  if (focal.state !== 'INTERESTED') return null;
  if (focal.expiresAt.getTime() <= Date.now()) return null;

  // 1. Resolve the focal user's accepted Crew partners.
  const crewRows = await prisma.crew.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userAId: focal.userId }, { userBId: focal.userId }],
    },
    select: { userAId: true, userBId: true },
  });

  const crewPartnerIds = crewRows.map((row) =>
    row.userAId === focal.userId ? row.userBId : row.userAId,
  );

  if (crewPartnerIds.length === 0) return null;

  // 2. Find live INTERESTED Intents from those partners on the same topic +
  //    a matching preset (exact or adjacent — R17).
  const matchablePresets = adjacentPresets(focal.windowPreset);

  const candidates = await prisma.intent.findMany({
    where: {
      userId: { in: crewPartnerIds },
      topicId: focal.topicId,
      state: 'INTERESTED',
      windowPreset: { in: matchablePresets },
      expiresAt: { gt: new Date() },
      ...(focal.cityArea
        ? { OR: [{ cityArea: focal.cityArea }, { cityArea: null }] }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      windowPreset: true,
      startAt: true,
      endAt: true,
      cityArea: true,
    },
  });

  if (candidates.length === 0) return null;

  // 3. R17 adjacent-window collapse: per partner, pick the Intent whose
  //    preset is closest to the focal preset.
  const bestPerUser = new Map<string, FormationCandidate>();
  for (const c of candidates) {
    const distance = presetDistance(focal.windowPreset, c.windowPreset);
    if (distance === Infinity) continue;
    const incumbent = bestPerUser.get(c.userId);
    if (!incumbent || distance < incumbent.distance) {
      bestPerUser.set(c.userId, { intent: c, distance });
    }
  }

  if (bestPerUser.size === 0) return null;

  // 4. Pick the single best partner (closest match) to seed with. Future:
  //    multi-seed formation (3+ users meeting at once); v1 sticks to pairs
  //    per R2 minimum threshold.
  const [bestPartner] = Array.from(bestPerUser.values()).sort(
    (a, b) => a.distance - b.distance,
  );

  // 5. Dedup: skip if a SubCrew already exists for this (focalUser, partner,
  //    topic) pair within the last 24h. Cheap guard — doesn't enforce true
  //    uniqueness on (members, topic, window) which would require a join.
  const existingSubCrew = await prisma.subCrew.findFirst({
    where: {
      topicId: focal.topicId,
      windowPreset: { in: matchablePresets },
      members: {
        every: {
          userId: { in: [focal.userId, bestPartner.intent.userId] },
        },
      },
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });

  if (existingSubCrew) return null;

  // 6. Create the SubCrew + seed members.
  const focalStart = focal.startAt ?? bestPartner.intent.startAt;
  const focalEnd = focal.endAt ?? bestPartner.intent.endAt;
  const partnerStart = bestPartner.intent.startAt ?? focalStart;
  const partnerEnd = bestPartner.intent.endAt ?? focalEnd;

  // SubCrew window = broadest of the two (earliest start, latest end).
  const startAt = pickEarliest(focalStart, partnerStart) ?? focal.expiresAt;
  const endAt = pickLatest(focalEnd, partnerEnd) ?? focal.expiresAt;

  const subCrew = await prisma.subCrew.create({
    data: {
      topicId: focal.topicId,
      windowPreset: focal.windowPreset,
      startAt,
      endAt,
      cityArea: focal.cityArea ?? bestPartner.intent.cityArea ?? null,
      members: {
        create: [
          {
            userId: focal.userId,
            intentId: focal.id,
            joinMode: 'SEED',
          },
          {
            userId: bestPartner.intent.userId,
            intentId: bestPartner.intent.id,
            joinMode: 'SEED',
          },
        ],
      },
    },
    select: { id: true },
  });

  // 7. Fire SUBCREW_FORMED notifications to both seed members.
  await prisma.notification.createMany({
    data: [
      {
        userId: focal.userId,
        type: 'SUBCREW_FORMED',
        title: 'A SubCrew is forming',
        message: 'You and a Crew member just aligned on something — go check.',
        data: { subCrewId: subCrew.id, partnerUserId: bestPartner.intent.userId } as Prisma.InputJsonValue,
      },
      {
        userId: bestPartner.intent.userId,
        type: 'SUBCREW_FORMED',
        title: 'A SubCrew is forming',
        message: 'You and a Crew member just aligned on something — go check.',
        data: { subCrewId: subCrew.id, partnerUserId: focal.userId } as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });

  return {
    subCrewId: subCrew.id,
    seedUserIds: [focal.userId, bestPartner.intent.userId],
  };
}

function pickEarliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() < b.getTime() ? a : b;
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() > b.getTime() ? a : b;
}
