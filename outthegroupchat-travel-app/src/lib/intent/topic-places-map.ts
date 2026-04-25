/**
 * @module intent/topic-places-map
 * @description Topic → Google Places category mapping (R15). Static TS config in v1;
 * promote to a DB-backed editable surface in v1.5 when ops needs to tune mappings
 * without deploys. Source of truth is `Topic.placesCategories` in the DB (seeded from
 * `prisma/seed/generators/topics.ts`); this module exposes a typed read-side helper
 * that callers can use instead of querying Topic directly.
 *
 * Phase 0: stub. Phase 3 (recommendations pipeline) wires the actual lookup.
 */

/**
 * Get the Google Places API category strings for a given Topic.
 *
 * Phase 0: stub returns empty array. Phase 3 implementation will read from the
 * Topic table (or an in-memory cache populated at app boot).
 *
 * @param _topicId The cuid of a row in the Topic table.
 * @returns Array of Google Places category strings (e.g. `['bar', 'night_club']`).
 */
export function getPlacesCategoriesForTopic(_topicId: string): string[] {
  // Phase 3 will replace with `prisma.topic.findUnique({ where: { id }, select: { placesCategories: true } })`.
  return [];
}
