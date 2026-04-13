/**
 * Unit tests for src/lib/sanitize.ts
 *
 * Strategy
 * --------
 * sanitize.ts is a pure utility module that wraps isomorphic-dompurify.
 * DOMPurify works natively in the Vitest/jsdom environment, so no mocking
 * of the library is needed. All exported functions are tested directly with:
 *   - Normal / expected inputs
 *   - XSS / injection payloads
 *   - Edge cases (empty string, null, undefined, special characters)
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
  it('returns the original plain text when input contains no HTML', () => {
    expect(sanitizeInput('Hello World')).toBe('Hello World');
  });

  it('strips a script tag XSS payload and returns only the inner text', () => {
    const result = sanitizeInput('<script>alert("xss")</script>Hello');
    expect(result).toBe('Hello');
    expect(result).not.toContain('<script>');
  });

  it('strips inline event handler attributes', () => {
    const result = sanitizeInput('<img src=x onerror=alert(1)>');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('<img');
  });

  it('strips all HTML tags leaving only the text content', () => {
    const result = sanitizeInput('<b>Bold</b> and <i>italic</i>');
    expect(result).toBe('Bold and italic');
  });

  it('returns empty string for an empty input string', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('returns empty string when passed a non-string value (number coerced)', () => {
    // The type signature is string but runtime guard handles non-strings
    expect(sanitizeInput(null as unknown as string)).toBe('');
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('preserves safe special characters used in normal text', () => {
    const input = 'Paris & Rome: Top 5 cities!';
    const result = sanitizeInput(input);
    // Ampersand may be HTML-entity encoded — the text value should remain
    expect(result).toContain('Paris');
    expect(result).toContain('Rome');
    expect(result).toContain('Top 5 cities');
  });

  it('strips a javascript: protocol injection attempt', () => {
    const result = sanitizeInput('<a href="javascript:evil()">click</a>');
    expect(result).toBe('click');
    expect(result).not.toContain('javascript:');
  });
});

// ===========================================================================
// sanitizeHtml
// ===========================================================================
describe('sanitizeHtml', () => {
  it('preserves allowed formatting tags like <b> and <i>', () => {
    const result = sanitizeHtml('<b>Bold</b> and <i>italic</i>');
    expect(result).toContain('<b>Bold</b>');
    expect(result).toContain('<i>italic</i>');
  });

  it('removes script tags and their content', () => {
    const result = sanitizeHtml('<b>Hello</b><script>evil()</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('evil()');
    expect(result).toContain('Hello');
  });

  it('removes onclick and other event handler attributes', () => {
    const result = sanitizeHtml('<p onclick="steal()">Text</p>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('Text');
  });

  it('preserves safe anchor tags with href attributes', () => {
    const result = sanitizeHtml('<a href="https://example.com">Link</a>');
    expect(result).toContain('<a');
    expect(result).toContain('https://example.com');
    expect(result).toContain('Link');
  });

  it('strips javascript: hrefs from anchor tags', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('preserves heading tags h1 through h3', () => {
    const result = sanitizeHtml('<h1>Title</h1><h2>Sub</h2><h3>Sub2</h3>');
    expect(result).toContain('<h1>');
    expect(result).toContain('<h2>');
    expect(result).toContain('<h3>');
  });

  it('preserves list tags ul, ol, li', () => {
    const result = sanitizeHtml('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });

  it('strips data- attributes', () => {
    const result = sanitizeHtml('<span data-secret="token">Text</span>');
    expect(result).not.toContain('data-secret');
    expect(result).toContain('Text');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });

  it('strips iframe injection attempts', () => {
    const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(result).not.toContain('<iframe');
  });
});

// ===========================================================================
// sanitizeMarkdown
// ===========================================================================
describe('sanitizeMarkdown', () => {
  it('preserves plain markdown syntax characters', () => {
    const input = '# Heading\n\n**bold** and _italic_';
    const result = sanitizeMarkdown(input);
    expect(result).toContain('# Heading');
    expect(result).toContain('**bold**');
    expect(result).toContain('_italic_');
  });

  it('strips embedded HTML script tags from markdown', () => {
    const input = '# Title\n\n<script>alert("xss")</script>\n\nSafe content';
    const result = sanitizeMarkdown(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('Safe content');
  });

  it('strips HTML tags but preserves the surrounding markdown text', () => {
    const input = 'Text with <b>bold html</b> and *markdown bold*';
    const result = sanitizeMarkdown(input);
    expect(result).not.toContain('<b>');
    expect(result).toContain('*markdown bold*');
    expect(result).toContain('bold html');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeMarkdown('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeMarkdown(null as unknown as string)).toBe('');
    expect(sanitizeMarkdown(undefined as unknown as string)).toBe('');
  });
});

// ===========================================================================
// sanitizeUrl
// ===========================================================================
describe('sanitizeUrl', () => {
  it('passes through a safe https URL unchanged', () => {
    const url = 'https://example.com/path?q=1';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('passes through a safe http URL', () => {
    const url = 'http://example.com';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('passes through a relative URL starting with /', () => {
    const url = '/trips/123';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it('returns empty string for a javascript: protocol URL', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('returns empty string for a data: URI', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('returns empty string for a vbscript: protocol URL', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('returns empty string for a bare string with no protocol or leading slash', () => {
    expect(sanitizeUrl('evil.com/hack')).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeUrl(null as unknown as string)).toBe('');
    expect(sanitizeUrl(undefined as unknown as string)).toBe('');
  });

  it('trims whitespace before protocol check', () => {
    const result = sanitizeUrl('  https://example.com  ');
    expect(result).toContain('https://example.com');
  });
});

// ===========================================================================
// sanitizeJson
// ===========================================================================
describe('sanitizeJson', () => {
  it('sanitizes string values inside a plain object', () => {
    const input = { name: '<script>xss()</script>Alice', age: 30 };
    const result = sanitizeJson(input);
    expect(result).not.toBeNull();
    expect(result!.name).not.toContain('<script>');
    expect(result!.name).toContain('Alice');
    expect(result!.age).toBe(30);
  });

  it('preserves numeric and boolean primitive values unchanged', () => {
    const input = { count: 42, active: true, ratio: 3.14 };
    const result = sanitizeJson(input);
    expect(result!.count).toBe(42);
    expect(result!.active).toBe(true);
    expect(result!.ratio).toBe(3.14);
  });

  it('recursively sanitizes nested objects', () => {
    const input = { outer: { inner: '<img onerror=evil()>' } };
    const result = sanitizeJson(input) as { outer: { inner: string } };
    expect(result).not.toBeNull();
    expect(result.outer.inner).not.toContain('onerror');
  });

  it('sanitizes string items inside arrays', () => {
    const input = { tags: ['<script>bad</script>', 'safe'] };
    const result = sanitizeJson(input) as { tags: string[] };
    expect(result.tags[0]).not.toContain('<script>');
    expect(result.tags[1]).toBe('safe');
  });

  it('filters out keys not in the allowedKeys list', () => {
    const input = { name: 'Alice', secret: 'hidden', age: 30 };
    const result = sanitizeJson(input, ['name', 'age']);
    expect(result).not.toBeNull();
    expect(result!.name).toBeDefined();
    expect(result!.age).toBeDefined();
    expect((result as Record<string, unknown>).secret).toBeUndefined();
  });

  it('returns null for a non-object input', () => {
    expect(sanitizeJson('string' as unknown as Record<string, unknown>)).toBeNull();
    expect(sanitizeJson(42 as unknown as Record<string, unknown>)).toBeNull();
    expect(sanitizeJson(null as unknown as Record<string, unknown>)).toBeNull();
  });

  it('returns an object with empty sanitized strings when all values are XSS payloads', () => {
    const input = { title: '<script>evil()</script>', desc: '<iframe src=x>' };
    const result = sanitizeJson(input);
    expect(result!.title).not.toContain('<script>');
    expect(result!.desc).not.toContain('<iframe');
  });
});

// ===========================================================================
// sanitizeEmail
// ===========================================================================
describe('sanitizeEmail', () => {
  it('returns a valid lowercase email address unchanged', () => {
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('returns empty string for a string without @ sign', () => {
    expect(sanitizeEmail('notanemail')).toBe('');
  });

  it('returns empty string for an email missing a TLD', () => {
    expect(sanitizeEmail('user@domain')).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(sanitizeEmail('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeEmail(null as unknown as string)).toBe('');
    expect(sanitizeEmail(undefined as unknown as string)).toBe('');
  });

  it('strips HTML tags from an email input', () => {
    const result = sanitizeEmail('<script>alert(1)</script>user@example.com');
    // After stripping tags the remaining text likely won't match email regex
    // The important thing is no script tag leaks through
    expect(result).not.toContain('<script>');
  });

  it('lowercases the returned email', () => {
    expect(sanitizeEmail('ALICE@EXAMPLE.COM')).toBe('alice@example.com');
  });
});

// ===========================================================================
// sanitizeSearchQuery
// ===========================================================================
describe('sanitizeSearchQuery', () => {
  it('returns a clean search query unchanged', () => {
    expect(sanitizeSearchQuery('paris restaurants')).toBe('paris restaurants');
  });

  it('strips angle bracket characters from a query', () => {
    const result = sanitizeSearchQuery('<script>alert(1)</script>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('strips single and double quote characters', () => {
    const result = sanitizeSearchQuery("O'Brien \"quoted\"");
    expect(result).not.toContain("'");
    expect(result).not.toContain('"');
  });

  it('truncates the query to the default maxLength of 100', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeSearchQuery(long).length).toBeLessThanOrEqual(100);
  });

  it('truncates to a custom maxLength when provided', () => {
    const result = sanitizeSearchQuery('hello world', 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns empty string for an empty input', () => {
    expect(sanitizeSearchQuery('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeSearchQuery(null as unknown as string)).toBe('');
    expect(sanitizeSearchQuery(undefined as unknown as string)).toBe('');
  });

  it('preserves alphanumeric content and spaces', () => {
    const result = sanitizeSearchQuery('Tokyo 2026 travel tips');
    expect(result).toBe('Tokyo 2026 travel tips');
  });
});

// ===========================================================================
// createBodySanitizer
// ===========================================================================
describe('createBodySanitizer', () => {
  it('sanitizes text fields as plain text', () => {
    const sanitize = createBodySanitizer({ text: ['name'] });
    const result = sanitize({ name: '<b>Alice</b>', other: 'untouched' });
    expect(result.name).toBe('Alice');
    expect(result.other).toBe('untouched');
  });

  it('sanitizes html fields allowing safe formatting tags', () => {
    const sanitize = createBodySanitizer({ html: ['bio'] });
    const result = sanitize({ bio: '<b>Hello</b><script>evil()</script>' });
    expect((result as Record<string, unknown>).bio).toContain('<b>Hello</b>');
    expect((result as Record<string, unknown>).bio as string).not.toContain('<script>');
  });

  it('sanitizes url fields rejecting dangerous protocols', () => {
    const sanitize = createBodySanitizer({ url: ['website'] });
    const result = sanitize({ website: 'javascript:evil()' });
    expect((result as Record<string, unknown>).website).toBe('');
  });

  it('sanitizes url fields passing through safe https URLs', () => {
    const sanitize = createBodySanitizer({ url: ['website'] });
    const result = sanitize({ website: 'https://example.com' });
    expect((result as Record<string, unknown>).website).toBe('https://example.com');
  });

  it('sanitizes email fields rejecting invalid addresses', () => {
    const sanitize = createBodySanitizer({ email: ['contact'] });
    const result = sanitize({ contact: 'notanemail' });
    expect((result as Record<string, unknown>).contact).toBe('');
  });

  it('sanitizes email fields normalizing valid addresses to lowercase', () => {
    const sanitize = createBodySanitizer({ email: ['contact'] });
    const result = sanitize({ contact: 'USER@EXAMPLE.COM' });
    expect((result as Record<string, unknown>).contact).toBe('user@example.com');
  });

  it('applies multiple field type configs in one pass', () => {
    const sanitize = createBodySanitizer({
      text: ['title'],
      email: ['email'],
      url: ['link'],
    });
    const result = sanitize({
      title: '<script>xss</script>Safe Title',
      email: 'ADMIN@EXAMPLE.COM',
      link: 'https://safe.com',
    }) as Record<string, unknown>;
    expect(result.title).not.toContain('<script>');
    expect(result.email).toBe('admin@example.com');
    expect(result.link).toBe('https://safe.com');
  });

  it('does not mutate fields not listed in the config', () => {
    const sanitize = createBodySanitizer({ text: ['name'] });
    const body = { name: 'Alice', extra: '<script>evil()</script>' };
    const result = sanitize(body) as Record<string, unknown>;
    // extra is NOT in the text config so it should pass through unmodified
    expect(result.extra).toBe('<script>evil()</script>');
  });

  it('skips fields whose value is not a string', () => {
    const sanitize = createBodySanitizer({ text: ['count'] });
    const result = sanitize({ count: 42 }) as Record<string, unknown>;
    expect(result.count).toBe(42);
  });
});
