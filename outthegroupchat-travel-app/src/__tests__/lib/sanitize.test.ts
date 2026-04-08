/**
 * Unit tests for src/lib/sanitize.ts
 *
 * Strategy
 * --------
 * All functions in sanitize.ts are pure utilities with no external service
 * dependencies (isomorphic-dompurify ships a JSDOM environment under Node).
 * No mocking is required — functions are imported statically and called directly.
 *
 * Coverage:
 *   sanitizeInput         — plain-text strip (7 tests)
 *   sanitizeHtml          — allow-list HTML (6 tests)
 *   sanitizeMarkdown      — HTML strip, keep markdown (4 tests)
 *   sanitizeUrl           — protocol validation (7 tests)
 *   sanitizeJson          — recursive object sanitization (6 tests)
 *   sanitizeEmail         — email validation + sanitization (5 tests)
 *   sanitizeSearchQuery   — query sanitization + length cap (5 tests)
 *   createBodySanitizer   — factory / middleware (4 tests)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeInput,
  sanitizeHtml,
  sanitizeMarkdown,
  sanitizeUrl,
  sanitizeJson,
  sanitizeEmail,
  sanitizeSearchQuery,
  createBodySanitizer,
} from '@/lib/sanitize';

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// sanitizeInput
// ===========================================================================
describe('sanitizeInput', () => {
  it('returns a clean plain-text string unchanged', () => {
    expect(sanitizeInput('Hello World')).toBe('Hello World');
  });

  it('strips all HTML tags from input', () => {
    expect(sanitizeInput('<b>bold</b> text')).toBe('bold text');
  });

  it('strips script tags and their content to prevent XSS', () => {
    const result = sanitizeInput('<script>alert("xss")</script>Safe');
    expect(result).toBe('Safe');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('<script');
  });

  it('strips inline event handlers', () => {
    const result = sanitizeInput('<img onerror="evil()" src="x">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('evil');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('returns empty string for non-string input (null cast)', () => {
    // The function signature expects string; coerce to test the runtime guard
    expect(sanitizeInput(null as unknown as string)).toBe('');
  });

  it('handles very long strings without throwing', () => {
    const long = 'A'.repeat(100_000);
    const result = sanitizeInput(long);
    expect(result).toBe(long);
  });

  it('preserves unicode and emoji characters', () => {
    const input = 'Tokyo 東京 🗼';
    expect(sanitizeInput(input)).toBe('Tokyo 東京 🗼');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });
});

// ===========================================================================
// sanitizeHtml
// ===========================================================================
describe('sanitizeHtml', () => {
  it('preserves safe formatting tags', () => {
    const input = '<b>Bold</b> and <em>italic</em>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<b>Bold</b>');
    expect(result).toContain('<em>italic</em>');
  });

  it('strips script tags while keeping surrounding text', () => {
    const result = sanitizeHtml('<p>Hello</p><script>evil()</script>');
    expect(result).toContain('<p>Hello</p>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('evil');
  });

  it('strips javascript: href attributes', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('preserves legitimate anchor hrefs', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('href="https://example.com"');
  });

  it('strips data: attributes', () => {
    const result = sanitizeHtml('<div data-secret="value">text</div>');
    expect(result).not.toContain('data-secret');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
  });
});

// ===========================================================================
// sanitizeMarkdown
// ===========================================================================
describe('sanitizeMarkdown', () => {
  it('keeps plain markdown syntax intact', () => {
    const md = '# Heading\n\n**bold** and _italic_ text';
    const result = sanitizeMarkdown(md);
    expect(result).toContain('# Heading');
    expect(result).toContain('**bold**');
    expect(result).toContain('_italic_');
  });

  it('strips injected HTML tags from markdown', () => {
    const result = sanitizeMarkdown('## Title\n<script>evil()</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('evil');
    expect(result).toContain('## Title');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeMarkdown('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeMarkdown(undefined as unknown as string)).toBe('');
  });
});

// ===========================================================================
// sanitizeUrl
// ===========================================================================
describe('sanitizeUrl', () => {
  it('allows https URLs through unchanged', () => {
    expect(sanitizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });

  it('allows http URLs through unchanged', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative URLs starting with /', () => {
    expect(sanitizeUrl('/trips/123')).toBe('/trips/123');
  });

  it('blocks javascript: protocol URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks data: protocol URLs', () => {
    expect(sanitizeUrl('data:text/html,<h1>XSS</h1>')).toBe('');
  });

  it('blocks vbscript: protocol URLs', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeUrl(null as unknown as string)).toBe('');
  });

  it('rejects bare protocol-less strings that are not relative paths', () => {
    // No https:// or leading / — should be rejected
    expect(sanitizeUrl('evil.com/xss')).toBe('');
  });
});

// ===========================================================================
// sanitizeJson
// ===========================================================================
describe('sanitizeJson', () => {
  it('sanitizes string values in a flat object', () => {
    const input = { name: '<script>evil()</script>Alice', age: 30 };
    const result = sanitizeJson<{ name: string; age: number }>(input);
    expect(result).not.toBeNull();
    expect(result!.name).not.toContain('<script');
    expect(result!.name).toContain('Alice');
    expect(result!.age).toBe(30);
  });

  it('recursively sanitizes nested objects', () => {
    const input = { user: { bio: '<img onerror="x">Clean bio' } };
    const result = sanitizeJson<{ user: { bio: string } }>(input);
    expect(result).not.toBeNull();
    expect(result!.user).not.toBeNull();
    const user = result!.user as { bio: string };
    expect(user.bio).not.toContain('onerror');
    expect(user.bio).toContain('Clean bio');
  });

  it('sanitizes string items inside arrays', () => {
    const input = { tags: ['<b>tag1</b>', 'tag2'] };
    const result = sanitizeJson<{ tags: string[] }>(input);
    expect(result).not.toBeNull();
    const tags = result!.tags as string[];
    expect(tags[0]).not.toContain('<b>');
    expect(tags[0]).toContain('tag1');
    expect(tags[1]).toBe('tag2');
  });

  it('filters keys not in the allowedKeys list', () => {
    const input = { name: 'Alice', secret: 'password123' };
    const result = sanitizeJson<{ name: string }>(input, ['name']);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Alice');
    expect((result as Record<string, unknown>).secret).toBeUndefined();
  });

  it('returns null for non-object inputs', () => {
    expect(sanitizeJson(null)).toBeNull();
    expect(sanitizeJson('a string')).toBeNull();
    expect(sanitizeJson(42)).toBeNull();
  });

  it('preserves non-string primitive values (numbers, booleans)', () => {
    const input = { count: 5, active: true };
    const result = sanitizeJson<{ count: number; active: boolean }>(input);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(5);
    expect(result!.active).toBe(true);
  });
});

// ===========================================================================
// sanitizeEmail
// ===========================================================================
describe('sanitizeEmail', () => {
  it('returns a valid email in lowercase', () => {
    expect(sanitizeEmail('Alice@Example.COM')).toBe('alice@example.com');
  });

  it('returns empty string for an invalid email format', () => {
    expect(sanitizeEmail('not-an-email')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeEmail('')).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeEmail(null as unknown as string)).toBe('');
  });

  it('strips HTML injected into an email address', () => {
    // After stripping HTML the result won't match email format → empty string
    const result = sanitizeEmail('<script>evil()</script>user@example.com');
    // The tag text gets stripped, leaving "user@example.com" which should pass
    expect(result).toBe('user@example.com');
  });
});

// ===========================================================================
// sanitizeSearchQuery
// ===========================================================================
describe('sanitizeSearchQuery', () => {
  it('returns a plain search term unchanged', () => {
    expect(sanitizeSearchQuery('Paris restaurants')).toBe('Paris restaurants');
  });

  it('strips HTML tags from search queries', () => {
    const result = sanitizeSearchQuery('<b>Paris</b>');
    expect(result).not.toContain('<b>');
    expect(result).toContain('Paris');
  });

  it('removes angle brackets and quotes for extra XSS protection', () => {
    const result = sanitizeSearchQuery(`trip's "best" <places>`);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain("'");
    expect(result).not.toContain('"');
  });

  it('truncates queries to maxLength (default 100)', () => {
    const long = 'A'.repeat(200);
    expect(sanitizeSearchQuery(long).length).toBe(100);
  });

  it('respects a custom maxLength', () => {
    const input = 'Hello World';
    expect(sanitizeSearchQuery(input, 5).length).toBe(5);
  });

  it('returns empty string for empty or non-string input', () => {
    expect(sanitizeSearchQuery('')).toBe('');
    expect(sanitizeSearchQuery(null as unknown as string)).toBe('');
  });
});

// ===========================================================================
// createBodySanitizer
// ===========================================================================
describe('createBodySanitizer', () => {
  it('sanitizes configured text fields', () => {
    const sanitize = createBodySanitizer({ text: ['title'] });
    const result = sanitize({ title: '<script>evil()</script>My Trip', count: 3 });
    expect((result as Record<string, unknown>).title).not.toContain('<script');
    expect((result as Record<string, unknown>).title).toContain('My Trip');
    expect((result as Record<string, unknown>).count).toBe(3);
  });

  it('sanitizes configured html fields', () => {
    const sanitize = createBodySanitizer({ html: ['description'] });
    const result = sanitize({ description: '<b>Nice</b><script>evil()</script>' });
    const desc = (result as Record<string, unknown>).description as string;
    expect(desc).toContain('<b>Nice</b>');
    expect(desc).not.toContain('<script');
  });

  it('sanitizes configured url fields', () => {
    const sanitize = createBodySanitizer({ url: ['link'] });
    const safe = sanitize({ link: 'https://example.com' });
    const dangerous = sanitize({ link: 'javascript:alert(1)' });
    expect((safe as Record<string, unknown>).link).toBe('https://example.com');
    expect((dangerous as Record<string, unknown>).link).toBe('');
  });

  it('sanitizes configured email fields', () => {
    const sanitize = createBodySanitizer({ email: ['contactEmail'] });
    const result = sanitize({ contactEmail: 'USER@EXAMPLE.COM' });
    expect((result as Record<string, unknown>).contactEmail).toBe('user@example.com');
  });

  it('handles multiple field types in one call', () => {
    const sanitize = createBodySanitizer({
      text: ['name'],
      url: ['website'],
      email: ['email'],
    });
    const result = sanitize({
      name: '<b>Alice</b>',
      website: 'https://alice.com',
      email: 'Alice@Example.com',
    }) as Record<string, unknown>;
    expect(result.name).toBe('Alice');
    expect(result.website).toBe('https://alice.com');
    expect(result.email).toBe('alice@example.com');
  });
});
