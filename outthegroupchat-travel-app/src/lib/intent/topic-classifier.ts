/**
 * @module intent/topic-classifier
 * @description Free-text → Topic classifier implementing the **R9 deterministic
 * classifier** contract of the V1 spec (see `docs/PRODUCT_VISION.md`): same input
 * always produces the same Topic + matched-keyword output, with no LLM hop in the
 * critical path of the intent-to-group loop (R1).
 *
 * Each Topic carries a `keywords` array (seeded in
 * `prisma/seed/generators/topics.ts`); the classifier scans the lowercased rawText
 * for word-boundary hits on single-word keywords and substring hits on multi-word
 * phrases, then picks the Topic with the most hits.
 *
 * Phase 1 implementation: queries the `Topic` table on every call (cheap — ~10 rows)
 * and resolves `topicId` plus the matched keywords (useful for UX hints).
 *
 * Upgrade path (v1.5): swap implementation to embedding-based fuzzy matching against
 * a small classifier model. Public API stays stable — R9 still requires determinism
 * (cached embedding scores, fixed-seed nearest-neighbor).
 */

import type { PrismaClient } from '@prisma/client';

/**
 * Result of a single classification pass.
 *
 * Returned by {@link classifyIntentText}. Surfaced to the route layer so that
 * a `topicId: null` outcome can trigger the "needsTopicPicker" UI hint (R9 fallback
 * path when no keyword matches).
 */
export interface ClassifyResult {
  /** ID of the matched Topic, or `null` when no keyword matched. */
  topicId: string | null;
  /** Subset of the Topic's keywords that matched the input — useful for UX hints. */
  matchedKeywords: string[];
}

/**
 * Minimum Prisma client surface needed by the classifier — narrowed to the
 * `topic` delegate so unit tests can pass a stub instead of a full client.
 */
export type ClassifierPrisma = Pick<PrismaClient, 'topic'>;

/**
 * Escape a string for safe embedding in a RegExp literal.
 *
 * @param s Arbitrary user/keyword input that may contain regex metacharacters.
 * @returns The same string with regex metacharacters backslash-escaped.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Test whether a given keyword matches the input text.
 *
 * Deterministic per R9 — pure function of `(text, keyword)`.
 *
 * - Multi-word keywords (e.g. "happy hour") match by case-insensitive substring.
 * - Single-word keywords use word-boundary regex matching to avoid false
 *   positives like "drinks" matching inside "rundrinks".
 *
 * Exported for unit testing — callers should prefer `classifyIntentText`.
 *
 * @param text Free-text user input to scan (will be lowercased internally).
 * @param keyword The keyword to test for (case-insensitive).
 * @returns `true` if the keyword is present in `text` under the rules above.
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
 * Implements the R9 deterministic-classifier contract: identical `rawText` yields
 * identical `(topicId, matchedKeywords)` for the same Topic-table snapshot. No
 * tie-breaker beyond "first topic with the highest match count wins" — keyword
 * dictionaries are curated to keep ties rare.
 *
 * Returns `topicId: null` when no keyword matches — the route layer surfaces a
 * "needsTopicPicker" hint to the UI in this case so the user can pick manually.
 *
 * @param rawText Free-text input from the Intent capture form. Empty/whitespace
 *                inputs short-circuit to a null result.
 * @param prismaClient A Prisma client (or test stub) exposing the `topic` delegate.
 * @returns A {@link ClassifyResult} containing the resolved `topicId` (or `null`)
 *          and the subset of keywords that matched.
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
