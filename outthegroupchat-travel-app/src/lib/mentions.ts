/**
 * @module mentions
 * @description Pure, framework-agnostic helpers for parsing and tokenizing `@mention`
 * syntax in free-text (e.g. comment bodies). No React, no Prisma — string logic only.
 *
 * Mentions are matched with `/@(\w{1,40})/g`, i.e. an `@` followed by 1-40 word
 * characters (`[A-Za-z0-9_]`). There is no `username`/`handle` column in the data
 * model, so callers resolve tokens against `User.name` (case-insensitive), optionally
 * also matching the name with whitespace removed.
 */

/** Maximum number of distinct mention tokens extracted from a single body of text. */
export const MAX_MENTION_TOKENS = 10;

/** Regex matching an `@` followed by 1-40 word characters. */
const MENTION_REGEX = /@(\w{1,40})/g;

/**
 * Extract unique, lowercase mention tokens from text.
 *
 * - Matches `@handle` runs via {@link MENTION_REGEX} and strips the leading `@`.
 * - Lowercases each token and de-duplicates while preserving first-seen order.
 * - Caps the result at {@link MAX_MENTION_TOKENS} tokens.
 *
 * @param text - Arbitrary user-supplied text.
 * @returns Ordered array of unique lowercase tokens (without the `@`).
 */
export function extractMentionTokens(text: string): string[] {
  if (!text) return [];

  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const match of Array.from(text.matchAll(MENTION_REGEX))) {
    const token = match[1].toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= MAX_MENTION_TOKENS) break;
  }

  return tokens;
}

/** A run of a tokenized string: either plain text or a mention (value includes the leading `@`). */
export interface MentionToken {
  type: 'text' | 'mention';
  value: string;
}

/**
 * Split text into an ordered list of runs so a renderer can wrap mention runs.
 *
 * Consecutive plain-text segments and mention runs are emitted in document order.
 * A mention run's `value` INCLUDES the leading `@` (e.g. `"@alex"`), so a renderer
 * can display it verbatim.
 *
 * @param text - Arbitrary user-supplied text.
 * @returns Ordered runs covering the entire input string.
 */
export function tokenizeWithMentions(text: string): MentionToken[] {
  if (!text) return [];

  const parts: MentionToken[] = [];
  let lastIndex = 0;

  for (const match of Array.from(text.matchAll(MENTION_REGEX))) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    parts.push({ type: 'mention', value: match[0] });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts;
}
