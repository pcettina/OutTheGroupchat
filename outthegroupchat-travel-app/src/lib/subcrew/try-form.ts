/**
 * @module subcrew/try-form
 * @description V1 Phase 2 — auto-formation of SubCrews (the **R17 SubCrew formation**
 * core, satisfying the **R2 two-member threshold** for the intent-to-group loop).
 *
 * V1 spec requirements (see `docs/PRODUCT_VISION.md`):
 *   - **R2**: A SubCrew forms the moment ≥2 Crew members carry compatible Intents
 *     on the same Topic — this module is where that threshold is checked.
 *   - **R8**: Only ACCEPTED Crew partners are eligible to seed a SubCrew.
 *   - **R11**: Adjacent WindowPresets count as compatible (e.g. EVENING+NIGHT).
 *   - **R17**: SubCrew formation rules — exact/adjacent window collapse, dedupe,
 *     SEED join-mode for the originating pair.
 *
 * Called from POST /api/intents (and on PATCH state transitions). Scans for
 * other live INTERESTED Intents that:
 *   - belong to one of the focal user's ACCEPTED Crew partners (R8)
 *   - share the focal Intent's `topicId`
 *   - have a matching `windowPreset` (exact or adjacent — R11/R17)
 *   - are not yet expired (R12)
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
import { broadcastToUser } from '@/lib/pusher';
import { apiLogger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

/**
 * Subset of Prisma client surface needed for formation. Narrowed so tests can
 * provide minimal stubs without satisfying the full PrismaClient type.
 */
export type FormSubCrewPrisma = Pick<
  PrismaClient,
  'crew' | 'intent' | 'subCrew' | 'subCrewMember' | 'notification' | 'notificationPreference'
>;

/**
 * Successful R17 formation outcome — returned to the route layer so it can
 * include the new SubCrew id in the API response.
 */
export interface FormationResult {
  /** ID of the newly-created SubCrew row. */
  subCrewId: string;
  /** User IDs of the SEED members (focal user + matched Crew partner). */
  seedUserIds: string[];
}

/**
 * Internal: one Crew partner's best candidate Intent and its R11/R17 preset
 * distance from the focal Intent. Used to collapse hedged Intents per user
 * before seeding a SubCrew.
 */
interface FormationCandidate {
  intent: Pick<Intent, 'id' | 'userId' | 'windowPreset' | 'startAt' | 'endAt' | 'cityArea'>;
  distance: number;
}

/**
 * Attempt to form a SubCrew around the given focal Intent.
 *
 * Implements the R17 formation algorithm and enforces the R2 two-member
 * threshold (focal + best Crew partner = 2 SEED members). Idempotent in
 * practice — if a matching SubCrew already exists for the (focalUser, partner,
 * topic, window) tuple within the last 24h, no new row is created.
 *
 * Side effects:
 *   - Creates a `SubCrew` + two `SubCrewMember` rows on success.
 *   - Fires two `SUBCREW_FORMED` notifications (one per seed member).
 *
 * @param focal The Intent that just got created or transitioned. Must be in
 *              `INTERESTED` state and not yet expired, else this returns `null`.
 * @param prisma Prisma client (or test stub) with the
 *               `crew/intent/subCrew/subCrewMember/notification` delegates.
 * @returns The created SubCrew + seed userIds, or `null` if no eligible match
 *          (R2 threshold not met) or a duplicate would result.
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

  // 8. Additive real-time push (V1 Phase 5). The in-app notifications above are
  //    always written; the Pusher push is opt-in per user via their
  //    GROUP_FORMATION NotificationPreference toggle. `broadcastToUser` already
  //    no-ops when Pusher env is absent and swallows transport errors, but the
  //    preference query + broadcast loop is wrapped here so any failure
  //    (e.g. an unmocked/undefined delegate) never aborts a successful
  //    formation — the SubCrew has already been created and persisted.
  try {
    const prefs = await prisma.notificationPreference.findMany({
      where: {
        trigger: 'GROUP_FORMATION',
        enabled: true,
        userId: { in: [focal.userId, bestPartner.intent.userId] },
      },
      select: { userId: true },
    });

    await Promise.all(
      prefs.map((pref) =>
        broadcastToUser(pref.userId, 'subcrew:formed', { subCrewId: subCrew.id }),
      ),
    );
  } catch (error) {
    captureException(error, { scope: 'subcrew.tryFormSubCrew.push', subCrewId: subCrew.id });
    apiLogger.error(
      { err: error, subCrewId: subCrew.id },
      'SubCrew formation push notification failed (non-fatal)',
    );
  }

  return {
    subCrewId: subCrew.id,
    seedUserIds: [focal.userId, bestPartner.intent.userId],
  };
}

/**
 * Pick the earlier of two nullable `Date` values, treating `null` as
 * "no constraint" rather than "before everything".
 *
 * @param a First candidate (may be `null`).
 * @param b Second candidate (may be `null`).
 * @returns The earlier non-null value, or `null` if both are `null`.
 */
function pickEarliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() < b.getTime() ? a : b;
}

/**
 * Pick the later of two nullable `Date` values, treating `null` as
 * "no constraint" rather than "after everything".
 *
 * @param a First candidate (may be `null`).
 * @param b Second candidate (may be `null`).
 * @returns The later non-null value, or `null` if both are `null`.
 */
function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() > b.getTime() ? a : b;
}
