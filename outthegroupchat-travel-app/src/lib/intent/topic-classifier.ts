/**
 * @module intent/topic-classifier
 * @description Free-text → Topic classifier (R1, R9). Deterministic keyword-dictionary
 * matching for v1: each Topic carries a `keywords` array; classifier tokenizes the user's
 * raw text, scores each Topic by keyword-match count, and returns the highest scorer.
 *
 * Stub for Phase 0 — returns `{ topicId: null }` because the lookup needs the seeded
 * Topic table at runtime. Phase 1 wires the actual DB-backed classifier and keyword
 * matching. The shape of `ClassifyResult` is the contract Phase 1 will fulfill.
 *
 * Upgrade path (v1.5): swap implementation to embedding-based fuzzy matching against
 * a small classifier model. Public API stays stable.
 */

export interface ClassifyResult {
  /** ID of the matched Topic, or `null` when no keyword matched. */
  topicId: string | null;
  /** Subset of the Topic's keywords that matched the input — useful for UX hints. */
  matchedKeywords: string[];
}

/**
 * Classify a raw user-typed Intent string into one of the curated Topics.
 *
 * Phase 0: stub returns null (no DB call). Phase 1 will inject a Prisma client
 * (or pre-loaded Topic list) and perform real matching.
 *
 * @param _rawText Free-text input from the Intent capture form.
 * @returns A ClassifyResult — `topicId` is null when no keyword matches.
 */
export function classifyIntentText(_rawText: string): ClassifyResult {
  // Phase 1 will replace with real keyword matching against the Topic table.
  return { topicId: null, matchedKeywords: [] };
}
