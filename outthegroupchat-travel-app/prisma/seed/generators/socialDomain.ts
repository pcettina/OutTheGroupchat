import { PrismaClient } from '@prisma/client';

/**
 * Seeds social domain data: cities, venues, crews, meetups, and check-ins.
 * Designed to run after core user seed data is available.
 * Gracefully no-ops if insufficient users exist.
 */
export async function seedSocialDomain(prisma: PrismaClient): Promise<void> {
  console.log('\n📦 Phase 3: Social Domain (Cities, Venues, Crews, Meetups, Check-ins)\n');

  // ── 1. Cities ────────────────────────────────────────────────────────
  console.log('🌆 Creating cities...');

  const nyc = await prisma.city.upsert({
    where: { name_country: { name: 'New York', country: 'US' } },
    update: {},
    create: {
      name: 'New York',
      state: 'NY',
      country: 'US',
      timezone: 'America/New_York',
      latitude: 40.7128,
      longitude: -74.006,
    },
  });

  const la = await prisma.city.upsert({
    where: { name_country: { name: 'Los Angeles', country: 'US' } },
    update: {},
    create: {
      name: 'Los Angeles',
      state: 'CA',
      country: 'US',
      timezone: 'America/Los_Angeles',
      latitude: 34.0522,
      longitude: -118.2437,
    },
  });

  console.log(`   ✅ Created/found cities: ${nyc.name}, ${la.name}`);

  // ── 2. Venues (NYC) ──────────────────────────────────────────────────
  console.log('📍 Creating venues...');

  const blankStreet = await prisma.venue.create({
    data: {
      name: 'Blank Street Coffee',
      city: 'New York',
      country: 'US',
      category: 'COFFEE',
      latitude: 40.7185,
      longitude: -74.0059,
      cityId: nyc.id,
    },
  });

  const juliusBar = await prisma.venue.create({
    data: {
      name: 'Julius Bar',
      city: 'New York',
      country: 'US',
      category: 'BAR',
      latitude: 40.734,
      longitude: -74.0023,
      cityId: nyc.id,
    },
  });

  const washingtonSquare = await prisma.venue.create({
    data: {
      name: 'Washington Square Park',
      city: 'New York',
      country: 'US',
      category: 'PARK',
      latitude: 40.7308,
      longitude: -73.9973,
      cityId: nyc.id,
    },
  });

  console.log(
    `   ✅ Created venues: ${blankStreet.name}, ${juliusBar.name}, ${washingtonSquare.name}`
  );

  // ── 3. Crew (between first two seeded users) ─────────────────────────
  console.log('🤝 Creating crew relationship...');

  const users = await prisma.user.findMany({ take: 2, select: { id: true } });

  if (users.length < 2) {
    console.log('   ⚠️  Fewer than 2 users found — skipping crew, meetup, and check-in seed');
    return;
  }

  const [userA, userB] = users;

  // Use upsert-like pattern: try create, skip if unique constraint hit
  try {
    await prisma.crew.create({
      data: {
        userAId: userA.id,
        userBId: userB.id,
        status: 'ACCEPTED',
        requestedById: userA.id,
      },
    });
    console.log('   ✅ Created crew between first two users');

    // Demo: userA personalizes their crew label to "Squad"
    await prisma.user.update({
      where: { id: userA.id },
      data: { crewLabel: 'Squad' },
    });
    console.log('   ✅ Set userA.crewLabel = "Squad" (demo of personalization)');
  } catch {
    console.log('   ℹ️  Crew already exists — skipping');
  }

  // ── 4. Meetup ────────────────────────────────────────────────────────
  console.log('📅 Creating meetup...');

  const meetup = await prisma.meetup.create({
    data: {
      title: 'Coffee & Code',
      hostId: userA.id,
      venueId: blankStreet.id,
      cityId: nyc.id,
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      visibility: 'CREW',
      capacity: 10,
    },
  });

  console.log(`   ✅ Created meetup: "${meetup.title}"`);

  // ── 5. Check-in ──────────────────────────────────────────────────────
  console.log('📌 Creating check-in...');

  const checkIn = await prisma.checkIn.create({
    data: {
      userId: userA.id,
      venueId: blankStreet.id,
      cityId: nyc.id,
      note: 'Working remotely today!',
      visibility: 'CREW',
    },
  });

  console.log(`   ✅ Created check-in (note: "${checkIn.note}")`);
}
