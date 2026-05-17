/**
 * Unit tests for src/lib/sanitize.ts.
 *
 * Covers every exported function:
 *   - sanitizeInput: strips all HTML, trims whitespace
 *   - sanitizeHtml: allows safe formatting tags only
 *   - sanitizeMarkdown: strips HTML but preserves markdown syntax
 *   - sanitizeUrl: rejects dangerous protocols (javascript:, data:, vbscript:)
 *   - sanitizeJson: recursively sanitizes object string values, supports allowlist
 *   - sanitizeEmail: lowercases + format-validates
 *   - sanitizeSearchQuery: strips HTML + truncates + removes <>'"
 *   - createBodySanitizer: factory producing field-aware sanitizer
 *
 * Edge cases include: empty/null/undefined inputs, XSS payloads, HTML entities,
 * Unicode/emoji, very long inputs, SQL-injection-style strings, and nested structures.
 */

import { describe, it, expect } from 'vitest';
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

describe('sanitizeInput', () => {
  it('returns plain text unchanged (trimmed)', () => {
    expect(sanitizeInput('Hello world')).toBe('Hello world');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeInput('   padded   ')).toBe('padded');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeInput(null as unknown as string)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeInput(12345 as unknown as string)).toBe('');
  });

  it('strips <script> tags and their content', () => {
    const result = sanitizeInput('<script>alert("xss")</script>Hello');
    expect(result).toBe('Hello');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('strips <img onerror=> payloads', () => {
    const result = sanitizeInput('<img src=x onerror="alert(1)">safe');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('onerror');
    expect(result).toContain('safe');
  });

  it('strips all formatting tags (no allowlist)', () => {
    const result = sanitizeInput('<b>bold</b> <i>italic</i>');
    expect(result).toBe('bold italic');
  });

  it('handles unicode and emoji', () => {
    expect(sanitizeInput('Hello 🌍 世界')).toBe('Hello 🌍 世界');
  });

  it('handles very long input', () => {
    const long = 'a'.repeat(10000);
    expect(sanitizeInput(long)).toBe(long);
  });

  it('preserves SQL-injection-style strings as plain text (not its job to block)', () => {
    const sqli = "'; DROP TABLE users; --";
    expect(sanitizeInput(sqli)).toBe(sqli);
  });

  it('strips iframe tags', () => {
    const result = sanitizeInput('<iframe src="evil.com"></iframe>visible');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('visible');
  });
});

describe('sanitizeHtml', () => {
  it('preserves allowed formatting tags', () => {
    const result = sanitizeHtml('<b>Hello</b>');
    expect(result).toContain('<b>');
    expect(result).toContain('Hello');
  });

  it('strips <script> tags', () => {
    const result = sanitizeHtml('<b>Hello</b><script>evil()</script>');
    expect(result).toContain('<b>Hello</b>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('evil()');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeHtml(42 as unknown as string)).toBe('');
  });

  it('allows links with href attribute', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('<a');
    expect(result).toContain('href="https://example.com"');
  });

  it('strips onclick and other on* attributes', () => {
    const result = sanitizeHtml('<a href="#" onclick="alert(1)">click</a>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('<a');
  });

  it('strips <img onerror=> payloads', () => {
    const result = sanitizeHtml('<img src=x onerror="alert(1)">');
    // img is not in allow list; should be stripped entirely
    expect(result).not.toContain('<img');
    expect(result).not.toContain('onerror');
  });

  it('strips javascript: in href (DOMPurify default)', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(result).not.toContain('javascript:');
  });

  it('preserves list structure', () => {
    const result = sanitizeHtml('<ul><li>one</li><li>two</li></ul>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });

  it('preserves blockquote, code, pre', () => {
    const result = sanitizeHtml('<blockquote><pre><code>x</code></pre></blockquote>');
    expect(result).toContain('<blockquote>');
    expect(result).toContain('<pre>');
    expect(result).toContain('<code>');
  });

  it('preserves heading tags h1-h6', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const result = sanitizeHtml(`<${tag}>title</${tag}>`);
      expect(result).toContain(`<${tag}>`);
    }
  });

  it('strips <style> tags', () => {
    const result = sanitizeHtml('<style>body{display:none}</style><b>ok</b>');
    expect(result).not.toContain('<style>');
    expect(result).toContain('<b>ok</b>');
  });

  it('preserves unicode and emoji inside allowed tags', () => {
    const result = sanitizeHtml('<b>Hello 🌍 世界</b>');
    expect(result).toContain('Hello 🌍 世界');
  });

  it('handles HTML entities (&lt;, &amp;)', () => {
    const result = sanitizeHtml('&lt;b&gt;not bold&lt;/b&gt; &amp; safe');
    // Entities should be preserved as-is or decoded; either way no actual <b> tag
    expect(result).toContain('not bold');
    expect(result).toContain('safe');
  });
});

describe('sanitizeMarkdown', () => {
  it('strips HTML tags', () => {
    const result = sanitizeMarkdown('**bold** and <script>evil()</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('evil()');
    expect(result).toContain('**bold**');
  });

  it('preserves markdown syntax characters', () => {
    const md = '# Heading\n\n- item 1\n- item 2\n\n[link](https://example.com)';
    expect(sanitizeMarkdown(md)).toContain('# Heading');
    expect(sanitizeMarkdown(md)).toContain('[link](https://example.com)');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeMarkdown('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeMarkdown(null as unknown as string)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeMarkdown({} as unknown as string)).toBe('');
  });

  it('strips <img onerror=> payloads from markdown', () => {
    const result = sanitizeMarkdown('safe text <img src=x onerror=alert(1)>');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('onerror');
    expect(result).toContain('safe text');
  });

  it('preserves unicode', () => {
    expect(sanitizeMarkdown('# 你好 🌍')).toContain('你好 🌍');
  });
});

describe('sanitizeUrl', () => {
  it('allows valid https URL', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows valid http URL', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative URL beginning with /', () => {
    expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
  });

  it('rejects javascript: URL', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects JavaScript: URL (case-insensitive)', () => {
    expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBe('');
  });

  it('rejects data: URL', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('rejects vbscript: URL', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('rejects URLs without scheme that are not relative', () => {
    expect(sanitizeUrl('example.com')).toBe('');
  });

  it('rejects ftp protocol (not in allow list)', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeUrl(null as unknown as string)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(sanitizeUrl(undefined as unknown as string)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeUrl(123 as unknown as string)).toBe('');
  });

  it('trims surrounding whitespace before validation', () => {
    expect(sanitizeUrl('   https://example.com   ')).toBe('https://example.com');
  });

  it('preserves query strings and fragments', () => {
    expect(sanitizeUrl('https://example.com/path?q=1#frag'))
      .toBe('https://example.com/path?q=1#frag');
  });
});

describe('sanitizeJson', () => {
  it('sanitizes string values in flat object', () => {
    const result = sanitizeJson({ name: '<script>x</script>Alice', age: 30 });
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns null for null input', () => {
    expect(sanitizeJson(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(sanitizeJson(undefined)).toBeNull();
  });

  it('returns null for non-object input (string)', () => {
    expect(sanitizeJson('hello')).toBeNull();
  });

  it('returns null for non-object input (number)', () => {
    expect(sanitizeJson(42)).toBeNull();
  });

  it('respects allowedKeys whitelist', () => {
    const result = sanitizeJson(
      { name: 'Alice', secret: 'leak', age: 30 },
      ['name', 'age']
    );
    expect(result).toEqual({ name: 'Alice', age: 30 });
    expect(result).not.toHaveProperty('secret');
  });

  it('recursively sanitizes nested objects', () => {
    const result = sanitizeJson({
      user: { bio: '<script>alert(1)</script>cool' },
    });
    expect(result).toEqual({ user: { bio: 'cool' } });
  });

  it('sanitizes string items in arrays', () => {
    const result = sanitizeJson({ tags: ['<b>safe</b>', '<script>x</script>ok'] });
    expect(result).toEqual({ tags: ['safe', 'ok'] });
  });

  it('sanitizes nested objects within arrays', () => {
    const result = sanitizeJson({
      items: [{ title: '<script>x</script>good' }],
    });
    expect(result).toEqual({ items: [{ title: 'good' }] });
  });

  it('preserves primitive values (boolean, number, null inside object)', () => {
    const result = sanitizeJson({
      active: true,
      count: 5,
      ratio: 1.5,
      missing: null,
    });
    expect(result).toEqual({
      active: true,
      count: 5,
      ratio: 1.5,
      missing: null,
    });
  });

  it('preserves non-string primitives in arrays', () => {
    const result = sanitizeJson({ nums: [1, 2, true, null] });
    expect(result).toEqual({ nums: [1, 2, true, null] });
  });

  it('handles empty object', () => {
    expect(sanitizeJson({})).toEqual({});
  });

  it('handles deeply nested structures', () => {
    const result = sanitizeJson({
      a: { b: { c: { d: '<script>x</script>deep' } } },
    });
    expect(result).toEqual({ a: { b: { c: { d: 'deep' } } } });
  });
});

describe('sanitizeEmail', () => {
  it('returns lowercase email for valid input', () => {
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('returns empty string for invalid email (no @)', () => {
    expect(sanitizeEmail('not-an-email')).toBe('');
  });

  it('returns empty string for invalid email (no domain)', () => {
    expect(sanitizeEmail('user@')).toBe('');
  });

  it('returns empty string for invalid email (no tld)', () => {
    expect(sanitizeEmail('user@example')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeEmail('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeEmail(null as unknown as string)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeEmail(123 as unknown as string)).toBe('');
  });

  it('strips HTML and validates remaining text', () => {
    expect(sanitizeEmail('<script>x</script>user@example.com')).toBe('user@example.com');
  });

  it('rejects email with embedded whitespace', () => {
    expect(sanitizeEmail('user name@example.com')).toBe('');
  });

  it('accepts plus-addressing', () => {
    expect(sanitizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
  });

  it('accepts subdomains', () => {
    expect(sanitizeEmail('user@mail.example.co.uk')).toBe('user@mail.example.co.uk');
  });
});

describe('sanitizeSearchQuery', () => {
  it('returns plain query unchanged', () => {
    expect(sanitizeSearchQuery('coffee shop')).toBe('coffee shop');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeSearchQuery('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeSearchQuery(null as unknown as string)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeSearchQuery({} as unknown as string)).toBe('');
  });

  it('strips HTML tags', () => {
    expect(sanitizeSearchQuery('<script>alert(1)</script>pizza')).toBe('pizza');
  });

  it('removes < > \' and " characters', () => {
    const result = sanitizeSearchQuery(`a<b>c'd"e`);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain("'");
    expect(result).not.toContain('"');
  });

  it('truncates to default 100 characters', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeSearchQuery(long).length).toBe(100);
  });

  it('truncates to custom maxLength', () => {
    expect(sanitizeSearchQuery('a'.repeat(50), 10).length).toBe(10);
  });

  it('preserves unicode within length limit', () => {
    expect(sanitizeSearchQuery('café 🌍')).toBe('café 🌍');
  });
});

describe('createBodySanitizer', () => {
  it('sanitizes plain-text fields', () => {
    const sanitizer = createBodySanitizer({ text: ['name'] });
    const result = sanitizer({ name: '<script>x</script>Alice', other: 'untouched' });
    expect(result.name).toBe('Alice');
    expect(result.other).toBe('untouched');
  });

  it('sanitizes HTML fields preserving allow-listed tags', () => {
    const sanitizer = createBodySanitizer({ html: ['bio'] });
    const result = sanitizer({ bio: '<b>hi</b><script>x</script>' });
    expect((result.bio as string)).toContain('<b>hi</b>');
    expect((result.bio as string)).not.toContain('<script>');
  });

  it('sanitizes URL fields and rejects dangerous protocols', () => {
    const sanitizer = createBodySanitizer({ url: ['homepage', 'avatar'] });
    const result = sanitizer({
      homepage: 'javascript:alert(1)',
      avatar: 'https://example.com/me.png',
    });
    expect(result.homepage).toBe('');
    expect(result.avatar).toBe('https://example.com/me.png');
  });

  it('sanitizes email fields with format validation', () => {
    const sanitizer = createBodySanitizer({ email: ['contactEmail'] });
    const result = sanitizer({ contactEmail: 'User@Example.com' });
    expect(result.contactEmail).toBe('user@example.com');
  });

  it('ignores fields not present in the body', () => {
    const sanitizer = createBodySanitizer({ text: ['missing'] });
    const result = sanitizer({ keep: 'value' });
    expect(result).toEqual({ keep: 'value' });
  });

  it('ignores non-string values when sanitizing', () => {
    const sanitizer = createBodySanitizer({ text: ['count'] });
    const result = sanitizer({ count: 42 });
    expect(result.count).toBe(42);
  });

  it('supports all four strategies in one config', () => {
    const sanitizer = createBodySanitizer({
      text: ['name'],
      html: ['bio'],
      url: ['link'],
      email: ['email'],
    });
    const result = sanitizer({
      name: '<script>x</script>Bob',
      bio: '<b>hi</b><script>x</script>',
      link: 'https://example.com',
      email: 'Bob@Example.COM',
    });
    expect(result.name).toBe('Bob');
    expect(result.bio as string).toContain('<b>hi</b>');
    expect(result.bio as string).not.toContain('<script>');
    expect(result.link).toBe('https://example.com');
    expect(result.email).toBe('bob@example.com');
  });

  it('does not mutate the original body object', () => {
    const sanitizer = createBodySanitizer({ text: ['name'] });
    const original = { name: '<b>Alice</b>' };
    const result = sanitizer(original);
    expect(original.name).toBe('<b>Alice</b>');
    expect(result.name).toBe('Alice');
  });

  it('returns body unchanged when no fieldsConfig keys provided', () => {
    const sanitizer = createBodySanitizer({});
    const result = sanitizer({ a: 1, b: '<b>x</b>' });
    expect(result).toEqual({ a: 1, b: '<b>x</b>' });
  });
});
