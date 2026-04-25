/**
 * @module intent/topic-places-map
 * @description Topic → Google Places category mapping (R15). The seed/Topic
 * table is the source of truth (`Topic.placesCategories`); this module is a
 * thin async helper that resolves the categories for a given topicId.
 *
 * Phase 0 stub returned `[]`; Phase 3 wires the actual lookup. Promote to a
 * DB-backed editing surface in v1.5 when ops needs to tune mappings without
 * a code deploy.
 */

import type { PrismaClient } from '@prisma/client';

/** Minimum prisma surface needed by the mapper — supports test mocks. */
export type TopicPlacesMapPrisma = Pick<PrismaClient, 'topic'>;

/**
 * Get the Google Places API category strings for a given Topic.
 *
 * @param topicId The cuid of a row in the Topic table.
 * @param prisma A Prisma client (or test stub) exposing the `topic` delegate.
 * @returns Array of Google Places category strings (e.g. `['bar', 'night_club']`).
 *          Empty array when the topic doesn't exist or has no mapped categories.
 */
export async function getPlacesCategoriesForTopic(
  topicId: string,
  prisma: TopicPlacesMapPrisma,
): Promise<string[]> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { placesCategories: true },
  });
  return topic?.placesCategories ?? [];
}

/**
 * Build a Places text-search query for a given Topic + cityArea.
 *
 * Returns a string like `"bars in East Village"` that's ready for the
 * Google Places Text Search endpoint. Falls back to the topic slug when no
 * categories are mapped, and to a generic location-only query when no
 * categories are present at all.
 */
export function buildPlacesQuery(
  categories: string[],
  cityAreaDisplay: string | null,
): string {
  const subject = categories.length > 0
    ? categories[0].replace(/_/g, ' ') // 'night_club' → 'night club'
    : 'meetup';

  if (cityAreaDisplay && cityAreaDisplay.trim().length > 0) {
    return `${subject} in ${cityAreaDisplay}`;
  }
  return subject;
}
