import type { PrismaClient } from '@prisma/client';

/**
 * Topic seed (R1, R9, R15) — the curated taxonomy that backs free-text Intent
 * bucketing in v1. Each Topic carries:
 * - keywords: deterministic dictionary the classifier matches against
 *   (`src/lib/intent/topic-classifier.ts`)
 * - placesCategories: Google Places API category filters used by the
 *   recommendations pipeline (`src/lib/intent/topic-places-map.ts`)
 *
 * Mappings are starting points; v1 expects the dictionary to grow iteratively
 * based on real "no-match" misses logged from production. Promote to a DB-backed
 * editing surface in v1.5 (per R15).
 */
export const TOPIC_SEED = [
  {
    slug: 'drinks',
    displayName: 'Drinks',
    keywords: ['drinks', 'drink', 'beer', 'wine', 'cocktail', 'cocktails', 'bar', 'bars', 'happy hour', 'pint', 'whiskey', 'tequila', 'mezcal'],
    placesCategories: ['bar', 'night_club'],
  },
  {
    slug: 'coffee',
    displayName: 'Coffee',
    keywords: ['coffee', 'espresso', 'latte', 'cappuccino', 'cafe', 'caf\u00e9', 'matcha', 'pour over'],
    placesCategories: ['cafe'],
  },
  {
    slug: 'brunch',
    displayName: 'Brunch',
    keywords: ['brunch', 'mimosa', 'bottomless', 'bagels', 'eggs benedict', 'pancakes'],
    placesCategories: ['restaurant', 'cafe', 'breakfast_restaurant'],
  },
  {
    slug: 'dinner',
    displayName: 'Dinner',
    keywords: ['dinner', 'eat', 'meal', 'restaurant', 'food', 'sushi', 'pasta', 'pizza', 'tacos', 'ramen', 'omakase'],
    placesCategories: ['restaurant'],
  },
  {
    slug: 'live_music',
    displayName: 'Live music',
    keywords: ['concert', 'show', 'gig', 'live music', 'band', 'dj', 'set', 'venue'],
    placesCategories: ['night_club', 'performing_arts_theater'],
  },
  {
    slug: 'run',
    displayName: 'Run',
    keywords: ['run', 'running', 'jog', 'jogging', 'miles', '5k', '10k', 'marathon', 'pace'],
    placesCategories: ['park'],
  },
  {
    slug: 'gym',
    displayName: 'Gym',
    keywords: ['gym', 'workout', 'lift', 'lifting', 'class', 'yoga', 'pilates', 'crossfit', 'spin'],
    placesCategories: ['gym'],
  },
  {
    slug: 'casual_meet',
    displayName: 'Casual meet',
    keywords: ['hang', 'hangout', 'chill', 'catch up', 'park hang', 'meet up', 'meetup'],
    placesCategories: ['park', 'cafe'],
  },
  {
    slug: 'gallery',
    displayName: 'Gallery / museum',
    keywords: ['gallery', 'museum', 'art', 'exhibit', 'exhibition', 'opening'],
    placesCategories: ['art_gallery', 'museum'],
  },
  {
    slug: 'outdoor',
    displayName: 'Outdoor activity',
    keywords: ['hike', 'hiking', 'climb', 'climbing', 'bike', 'biking', 'cycle', 'cycling', 'kayak', 'paddle', 'outdoor'],
    placesCategories: ['park', 'tourist_attraction'],
  },
] as const;

export async function seedTopics(prisma: PrismaClient): Promise<void> {
  console.log('\ud83d\udd16 Seeding topics...');
  for (const topic of TOPIC_SEED) {
    await prisma.topic.upsert({
      where: { slug: topic.slug },
      update: {
        displayName: topic.displayName,
        keywords: [...topic.keywords],
        placesCategories: [...topic.placesCategories],
      },
      create: {
        slug: topic.slug,
        displayName: topic.displayName,
        keywords: [...topic.keywords],
        placesCategories: [...topic.placesCategories],
      },
    });
  }
  console.log(`   \u2705 ${TOPIC_SEED.length} topics upserted`);
}
