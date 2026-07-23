/**
 * Unit tests for src/lib/mentions.ts — pure string helpers for `@mention` syntax.
 *
 * These are framework-agnostic pure functions: no Prisma, no NextAuth, no React.
 * They are imported and exercised directly with plain string inputs. No mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  extractMentionTokens,
  tokenizeWithMentions,
  MAX_MENTION_TOKENS,
} from '@/lib/mentions';

// ===========================================================================
// extractMentionTokens
// ===========================================================================
describe('extractMentionTokens', () => {
  it('extracts a single mention token (without the @)', () => {
    expect(extractMentionTokens('@alice')).toEqual(['alice']);
  });

  it('extracts a mention embedded in surrounding text', () => {
    expect(extractMentionTokens('hey @alice how are you')).toEqual(['alice']);
  });

  it('extracts multiple mentions in first-seen order', () => {
    expect(extractMentionTokens('@alice and @bob and @carol')).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });

  it('lowercases every token', () => {
    expect(extractMentionTokens('@Alice @BOB @CaRoL')).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });

  it('de-duplicates case-insensitively while preserving first-seen order', () => {
    // Bob appears first, so it must come before alice, and only once.
    expect(extractMentionTokens('@Bob @alice @BOB @Alice')).toEqual([
      'bob',
      'alice',
    ]);
  });

  it('returns [] for text with no @mention', () => {
    expect(extractMentionTokens('hello world, no mentions here')).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(extractMentionTokens('')).toEqual([]);
  });

  it('caps the result at MAX_MENTION_TOKENS distinct tokens', () => {
    // Build 12 distinct mentions; only the first MAX_MENTION_TOKENS survive.
    const parts = Array.from({ length: 12 }, (_, i) => `@user${i + 1}`);
    const result = extractMentionTokens(parts.join(' '));

    expect(MAX_MENTION_TOKENS).toBe(10);
    expect(result).toHaveLength(MAX_MENTION_TOKENS);
    expect(result[0]).toBe('user1');
    expect(result[MAX_MENTION_TOKENS - 1]).toBe('user10');
    // The 11th and 12th mentions must be dropped.
    expect(result).not.toContain('user11');
    expect(result).not.toContain('user12');
  });

  it('bounds each token to at most 40 word characters', () => {
    const long = 'a'.repeat(45);
    const result = extractMentionTokens(`@${long}`);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('a'.repeat(40));
    expect(result[0]).toHaveLength(40);
  });

  it('stops the token at trailing punctuation (@alice, -> alice)', () => {
    expect(extractMentionTokens('@alice,')).toEqual(['alice']);
  });

  it('handles multiple punctuation-adjacent mentions', () => {
    expect(extractMentionTokens('hi @alice, meet @bob!')).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('treats a non-word char after @ as no token (@ alone)', () => {
    expect(extractMentionTokens('email me @ home')).toEqual([]);
  });
});

// ===========================================================================
// tokenizeWithMentions
// ===========================================================================
describe('tokenizeWithMentions', () => {
  it('returns a single text run for plain text', () => {
    expect(tokenizeWithMentions('hello world')).toEqual([
      { type: 'text', value: 'hello world' },
    ]);
  });

  it('returns a single mention run keeping the leading @', () => {
    expect(tokenizeWithMentions('@alice')).toEqual([
      { type: 'mention', value: '@alice' },
    ]);
  });

  it('preserves text / mention / text ordering', () => {
    expect(tokenizeWithMentions('hi @alice bye')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@alice' },
      { type: 'text', value: ' bye' },
    ]);
  });

  it('emits consecutive mentions with the text between them', () => {
    expect(tokenizeWithMentions('@alice @bob')).toEqual([
      { type: 'mention', value: '@alice' },
      { type: 'text', value: ' ' },
      { type: 'mention', value: '@bob' },
    ]);
  });

  it('returns [] for empty string', () => {
    expect(tokenizeWithMentions('')).toEqual([]);
  });

  it('reconstructs the original string when run values are concatenated', () => {
    const input = 'ping @alice, then @bob — done';
    const rejoined = tokenizeWithMentions(input)
      .map((run) => run.value)
      .join('');
    expect(rejoined).toBe(input);
  });
});
