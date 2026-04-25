/**
 * @module intent/topic-classifier
 * @description Free-text → Topic classifier (R1, R9). Deterministic keyword-dictionary
 * matching for v1: each Topic carries a `keywords` array (seeded in
 * `prisma/seed/generators/topics.ts`); the classifier scans the lowercased rawText
 * for word-boundary hits on single-word keywords and substring hits on multi-word
 * phrases, then picks the Topic with the most hits.
 *
 * Phase 1 implementation: queries the `Topic` table on every call (cheap — ~10 rows)
 * and resolves `topicId` plus the matched keywords (useful for UX hints).
 *
 * Upgrade path (v1.5): swap implementation to embedding-based fuzzy matching against
 * a small classifier model. Public API stays stable.
 */

import type { PrismaClient } from '@prisma/client';

export interface ClassifyResult {
  /** ID of the matched Topic, or `null` when no keyword matched. */
  topicId: string | null;
  /** Subset of the Topic's keywords that matched the input — useful for UX hints. */
  matchedKeywords: string[];
}

/** Minimum prisma surface needed by the classifier — supports test mocks. */
export type ClassifierPrisma = Pick<PrismaClient, 'topic'>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Test whether a given keyword matches the input text.
 *
 * - Multi-word keywords (e.g. "happy hour") match by case-insensitive substring.
 * - Single-word keywords use word-boundary regex matching to avoid false
 *   positives like "drinks" matching inside "rundrinks".
 *
 * Exported for unit testing — callers should prefer `classifyIntentText`.
 */
export function matchesKeyword(text: string, keyword: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  if (lowerKeyword.includes(' ')) {
    return lowerText.includes(lowerKeyword);
  }

  const pattern = new RegExp(`\\b${escapeRegExp(lowerKeyword)}\\b`, 'i');
  return pattern.test(lowerText);
}

/**
 * Classify a raw user-typed Intent string into one of the curated Topics.
 *
 * Returns `topicId: null` when no keyword matches — the route layer surfaces a
 * "needsTopicPicker" hint to the UI in this case so the user can pick manually.
 *
 * @param rawText Free-text input from the Intent capture form.
 * @param prismaClient A Prisma client (or test stub) exposing the `topic` delegate.
 */
export async function classifyIntentText(
  rawText: string,
  prismaClient: ClassifierPrisma,
): Promise<ClassifyResult> {
  if (!rawText || !rawText.trim()) {
    return { topicId: null, matchedKeywords: [] };
  }

  const topics = await prismaClient.topic.findMany({
    select: { id: true, keywords: true },
  });

  let bestTopicId: string | null = null;
  let bestMatched: string[] = [];

  for (const topic of topics) {
    const matched = topic.keywords.filter((k) => matchesKeyword(rawText, k));
    if (matched.length > bestMatched.length) {
      bestTopicId = topic.id;
      bestMatched = matched;
    }
  }

  return { topicId: bestTopicId, matchedKeywords: bestMatched };
}
