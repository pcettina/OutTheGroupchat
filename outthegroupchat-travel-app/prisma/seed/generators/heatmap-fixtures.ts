/**
 * Heatmap test fixtures (V1 Phase 4) — creates 3 users + Crew edges + 4
 * COMMITTED Intents + 1 CheckIn so `/heatmap` has visible data immediately
 * after `npm run db:seed`. Skips the multi-account UI dance.
 *
 * What this seeds (designed to exercise both Crew and FoF tiers):
 *
 *   Users
 *     - heatmap-alice@test.dev — viewer for most tests
 *     - heatmap-bob@test.dev   — Alice's direct Crew + Carol's anchor
 *     - heatmap-carol@test.dev — FoF for Alice via Bob
 *   Crew (status=ACCEPTED)
 *     - Alice ↔ Bob
 *     - Bob   ↔ Carol
 *     - (intentionally NO Alice ↔ Carol — that's what makes Carol a FoF)
 *   Intents (all state=COMMITTED so heatmap has data with no UI clicks)
 *     - Alice — drinks, EVENING, East Village
 *     - Bob   — drinks, EVENING, East Village  (matches Alice → SubCrew)
 *     - Bob   — coffee, BRUNCH,  Williamsburg
 *     - Carol — drinks, NIGHT,   Williamsburg  (FoF-only)
 *   SubCrew
 *     - Alice + Bob on the matching drinks/EVENING/East Village pair
 *   HeatmapContributions (INTEREST type — one per committed Intent)
 *     - 4 total, all FULL_CREW + BLOCK + KNOWN, anchored on the
 *       neighborhood centroid since none of the Intents have venueId
 *   CheckIn + PRESENCE contribution
 *     - Alice checks in at the East Village (40.728, -73.984), CREW visibility
 *
 * Re-run-safe: deletes the three test users first (cascades everything they
 * own — Intents, SubCrewMember rows, HeatmapContributions, CheckIns) before
 * recreating. Existing real users are untouched.
 *
 * Login (after seed):
 *   - heatmap-alice@test.dev / heatmap-test-pw
 *   - heatmap-bob@test.dev   / heatmap-test-pw
 *   - heatmap-carol@test.dev / heatmap-test-pw
 */

import { PrismaClient, type WindowPreset } from '@prisma/client';
import bcrypt from 'bcryptjs';

interface NeighborhoodCentroid {
  slug: string;
  lat: number;
  lng: number;
}

// Mirrors a few entries from prisma/seed/generators/neighborhoods-nyc.ts so
// this file stays standalone (no need to import across the seed boundary).
const NEIGHBORHOOD: Record<string, NeighborhoodCentroid> = {
  'east-village': { slug: 'east-village', lat: 40.728, lng: -73.984 },
  'williamsburg': { slug: 'williamsburg', lat: 40.708, lng: -73.957 },
};

const PASSWORD = 'heatmap-test-pw';

function blockCell(lat: number, lng: number): { cellLat: number; cellLng: number } {
  // BLOCK granularity rounds to 3 decimal places (~110m at NYC latitudes).
  // Mirrors src/lib/subcrew/cell-anonymize.ts.
  return {
    cellLat: Math.round(lat * 1000) / 1000,
    cellLng: Math.round(lng * 1000) / 1000,
  };
}

function intentExpiry(windowPreset: WindowPreset): Date {
  // Window-end-of-day + 2h grace per R12. Exact times don't matter for
  // fixtures; we just need a future date so the heatmap query includes them.
  const now = new Date();
  const endOfWindow = new Date(now);
  switch (windowPreset) {
    case 'EVENING':
      endOfWindow.setHours(21, 0, 0, 0);
      break;
    case 'NIGHT':
      endOfWindow.setHours(26, 0, 0, 0); // 2 AM next day
      break;
    case 'BRUNCH':
      endOfWindow.setHours(14, 0, 0, 0);
      break;
    default:
      endOfWindow.setHours(22, 0, 0, 0);
  }
  // +2h grace
  endOfWindow.setHours(endOfWindow.getHours() + 2);
  // If we've already passed today's window, push to tomorrow.
  if (endOfWindow < now) endOfWindow.setDate(endOfWindow.getDate() + 1);
  return endOfWindow;
}

export async function seedHeatmapFixtures(prisma: PrismaClient): Promise<void> {
  console.log('🗺️  Seeding heatmap test fixtures...');

  const emails = [
    'heatmap-alice@test.dev',
    'heatmap-bob@test.dev',
    'heatmap-carol@test.dev',
  ];

  // Wipe prior fixture state — cascades through Intents, SubCrewMember,
  // HeatmapContribution, CheckIn, Crew via the schema's onDelete: Cascade.
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const [alice, bob, carol] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'heatmap-alice@test.dev',
        name: 'Heatmap Alice',
        password: passwordHash,
        emailVerified: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        email: 'heatmap-bob@test.dev',
        name: 'Heatmap Bob',
        password: passwordHash,
        emailVerified: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        email: 'heatmap-carol@test.dev',
        name: 'Heatmap Carol',
        password: passwordHash,
        emailVerified: new Date(),
      },
    }),
  ]);

  // Crew edges (Alice ↔ Bob, Bob ↔ Carol — NOT Alice ↔ Carol).
  await prisma.crew.createMany({
    data: [
      {
        userAId: alice.id,
        userBId: bob.id,
        status: 'ACCEPTED',
        requestedById: alice.id,
      },
      {
        userAId: bob.id,
        userBId: carol.id,
        status: 'ACCEPTED',
        requestedById: bob.id,
      },
    ],
  });

  // Look up topics seeded by `seedTopics`.
  const drinks = await prisma.topic.findUnique({ where: { slug: 'drinks' } });
  const coffee = await prisma.topic.findUnique({ where: { slug: 'coffee' } });
  if (!drinks || !coffee) {
    console.warn('   ⚠️  Topics missing — run seedTopics first; skipping heatmap fixtures');
    return;
  }

  // Four Intents. State=COMMITTED so HeatmapContribution rows can be written
  // alongside, with the privacy axes a real commit would have selected.
  const intentDefs: Array<{
    user: typeof alice;
    topicId: string;
    windowPreset: WindowPreset;
    cityArea: keyof typeof NEIGHBORHOOD;
  }> = [
    { user: alice, topicId: drinks.id, windowPreset: 'EVENING', cityArea: 'east-village' },
    { user: bob, topicId: drinks.id, windowPreset: 'EVENING', cityArea: 'east-village' },
    { user: bob, topicId: coffee.id, windowPreset: 'BRUNCH', cityArea: 'williamsburg' },
    { user: carol, topicId: drinks.id, windowPreset: 'NIGHT', cityArea: 'williamsburg' },
  ];

  const intents = await Promise.all(
    intentDefs.map((def) =>
      prisma.intent.create({
        data: {
          userId: def.user.id,
          topicId: def.topicId,
          windowPreset: def.windowPreset,
          dayOffset: 0,
          state: 'COMMITTED',
          cityArea: def.cityArea,
          rawText: null,
          expiresAt: intentExpiry(def.windowPreset),
        },
      }),
    ),
  );

  const [aliceIntent, bobIntent /*, bobCoffee, carolIntent */] = intents;

  // SubCrew bonding the matching Alice+Bob drinks/EVENING/East Village pair.
  const subCrew = await prisma.subCrew.create({
    data: {
      topicId: drinks.id,
      windowPreset: 'EVENING',
      startAt: new Date(),
      endAt: intentExpiry('EVENING'),
      cityArea: 'east-village',
      members: {
        create: [
          {
            userId: alice.id,
            intentId: aliceIntent.id,
            joinMode: 'SEED',
            committedAt: new Date(),
          },
          {
            userId: bob.id,
            intentId: bobIntent.id,
            joinMode: 'SEED',
            committedAt: new Date(),
          },
        ],
      },
    },
  });

  // INTEREST contributions — one per committed Intent. Cell = neighborhood
  // centroid (no venueId on these Intents). FULL_CREW + BLOCK + KNOWN per the
  // R20 default direct-Crew picker outcome.
  await prisma.heatmapContribution.createMany({
    data: intents.map((intent, idx) => {
      const def = intentDefs[idx];
      const centroid = NEIGHBORHOOD[def.cityArea];
      const cell = blockCell(centroid.lat, centroid.lng);
      return {
        userId: intent.userId,
        type: 'INTEREST' as const,
        sourceId: intent.id,
        cellLat: cell.cellLat,
        cellLng: cell.cellLng,
        cellPrecision: 'BLOCK' as const,
        topicId: intent.topicId,
        windowPreset: intent.windowPreset,
        socialScope: 'FULL_CREW' as const,
        identityMode: 'KNOWN' as const,
        expiresAt: intent.expiresAt,
      };
    }),
  });

  // PRESENCE: Alice checks in at East Village. Visibility=CREW maps to
  // FULL_CREW socialScope on the contribution (per checkInVisibilityToSocialScope).
  const aliceLat = 40.7281;
  const aliceLng = -73.9836;
  const activeUntil = new Date(Date.now() + 6 * 60 * 60 * 1000); // +6h
  const aliceCheckIn = await prisma.checkIn.create({
    data: {
      userId: alice.id,
      latitude: aliceLat,
      longitude: aliceLng,
      visibility: 'CREW',
      activeUntil,
      note: '[seed fixture]',
    },
  });
  const ciCell = blockCell(aliceLat, aliceLng);
  await prisma.heatmapContribution.create({
    data: {
      userId: alice.id,
      type: 'PRESENCE',
      sourceId: aliceCheckIn.id,
      cellLat: ciCell.cellLat,
      cellLng: ciCell.cellLng,
      cellPrecision: 'BLOCK',
      topicId: null,
      windowPreset: null,
      socialScope: 'FULL_CREW',
      identityMode: 'KNOWN',
      expiresAt: activeUntil,
    },
  });

  console.log(
    `   ✅ 3 users, 2 Crew edges, ${intents.length} Intents, 1 SubCrew, ${intents.length + 1} contributions, 1 CheckIn`,
  );
  console.log(`      🔑 Login as: heatmap-alice@test.dev / ${PASSWORD}`);
  console.log(`      🗺️  /heatmap should show: Crew Interest = East Village (count 2) + Williamsburg (count 1)`);
  console.log(`                     Crew Presence = East Village (count 1)`);
  console.log(`                     FoF Interest @ threshold 1 = Williamsburg via Bob (Carol's intent)`);
  // (kept-bob-coffee referenced via index to silence lint warning)
  void subCrew;
}
