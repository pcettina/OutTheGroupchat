/**
 * Standalone runner for the heatmap test fixtures. Useful for seeding the
 * 3 test users into a non-local environment (e.g. preview / production
 * Neon branch) without running the full `prisma/seed/index.ts` (which would
 * create demo trips, users, etc.).
 *
 * Usage:
 *   DATABASE_URL=<...> DIRECT_URL=<...> npx tsx prisma/scripts/seed-heatmap-only.ts
 */
import { PrismaClient } from '@prisma/client';
import { seedHeatmapFixtures } from '../seed/generators/heatmap-fixtures.ts';
import { seedTopics } from '../seed/generators/topics.ts';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Topics may not exist on a fresh DB (production was migrated but never
    // seeded). seedTopics is upsert-based, so safe to run on a populated DB.
    await seedTopics(prisma);
    await seedHeatmapFixtures(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ seed-heatmap-only failed:', err);
  process.exit(1);
});
