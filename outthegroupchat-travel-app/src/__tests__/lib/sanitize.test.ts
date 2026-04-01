/**
 * Unit tests for src/lib/sanitize.ts
 *
 * DOMPurify is mocked to isolate sanitize.ts logic from the DOM environment.
 * The mock strips HTML tags so tests can assert sanitized output without a browser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: isomorphic-dompurify
// Simulates tag stripping so we can test the wrapper logic in sanitize.ts.
// ---------------------------------------------------------------------------
vi.mock('isomorphic-dompurify', () => ({
  default: {
    sanitize: vi.fn((input: string) => input.replace(/<[^>]*>/g, '')),
  },
}));

import DOMPurify from 'isomorphic-dompurify';
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

const mockSanitize = vi.mocked(DOMPurify.sanitize);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Default mock implementation: strip HTML tags from input */
function defaultSanitizeImpl(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

beforeEach(() => {
  // resetAllMocks flushes mockReturnValueOnce queues AND resets implementations.
  // We re-establish the default tag-stripping impl after each reset so that
  // tests not using mockReturnValueOnce still get sensible behavior.
  vi.resetAllMocks();
  mockSanitize.mockImplementation(defaultSanitizeImpl as unknown as Parameters<typeof mockSanitize.mockImplementation>[0]);
});

// ===========================================================================
// sanitizeInput
// ===========================================================================
describe('sanitizeInput', () => {
  it('strips script tags and returns plain text', () => {
    const input = '<script>alert("xss")</script>Hello';
    mockSanitize.mockReturnValueOnce('Hello');
    expect(sanitizeInput(input)).toBe('Hello');
  });

  it('strips event handler attributes', () => {
    const input = '<img src="x" onerror="evil()">';
    mockSanitize.mockReturnValueOnce('');
    expect(sanitizeInput(input)).toBe('');
  });

  it('passes plain text through unchanged', () => {
    const input = 'Hello, world!';
    mockSanitize.mockReturnValueOnce('Hello, world!');
    expect(sanitizeInput(input)).toBe('Hello, world!');
  });

  it('returns empty string for empty input', () => {
    // falsy check — DOMPurify is never called
    expect(sanitizeInput('')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('returns empty string for non-string input (number coercion)', () => {
    // @ts-expect-error — testing runtime guard
    expect(sanitizeInput(42)).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('trims leading and trailing whitespace from output', () => {
    const input = '  hello  ';
    mockSanitize.mockReturnValueOnce('  hello  ');
    expect(sanitizeInput(input)).toBe('hello');
  });

  it('strips multiple consecutive tags', () => {
    const input = '<b><i><u>text</u></i></b>';
    mockSanitize.mockReturnValueOnce('text');
    expect(sanitizeInput(input)).toBe('text');
  });

  it('strips nested script tags', () => {
    const input = '<div><script>evil()</script>safe</div>';
    mockSanitize.mockReturnValueOnce('safe');
    expect(sanitizeInput(input)).toBe('safe');
  });

  it('calls DOMPurify with ALLOWED_TAGS and ALLOWED_ATTR both empty', () => {
    mockSanitize.mockReturnValueOnce('result');
    sanitizeInput('some input');
    expect(mockSanitize).toHaveBeenCalledWith('some input', {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
  });
});

// ===========================================================================
// sanitizeHtml
// ===========================================================================
describe('sanitizeHtml', () => {
  it('removes script tags from HTML', () => {
    const input = '<b>Hello</b><script>evil()</script>';
    mockSanitize.mockReturnValueOnce('<b>Hello</b>');
    expect(sanitizeHtml(input)).toBe('<b>Hello</b>');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('returns empty string for non-string input', () => {
    // @ts-expect-error — testing runtime guard
    expect(sanitizeHtml(null)).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('passes allowed formatting tags through DOMPurify', () => {
    const input = '<em>emphasized</em>';
    mockSanitize.mockReturnValueOnce('<em>emphasized</em>');
    const result = sanitizeHtml(input);
    expect(result).toBe('<em>emphasized</em>');
    expect(mockSanitize).toHaveBeenCalledOnce();
  });

  it('calls DOMPurify with a non-empty ALLOWED_TAGS list', () => {
    mockSanitize.mockReturnValueOnce('safe');
    sanitizeHtml('<p>safe</p>');
    const callArgs = mockSanitize.mock.calls[0][1] as Record<string, unknown>;
    const allowedTags = callArgs.ALLOWED_TAGS as string[];
    expect(Array.isArray(allowedTags)).toBe(true);
    expect(allowedTags.length).toBeGreaterThan(0);
    expect(allowedTags).toContain('b');
    expect(allowedTags).toContain('a');
  });
});

// ===========================================================================
// sanitizeMarkdown
// ===========================================================================
describe('sanitizeMarkdown', () => {
  it('removes HTML tags from markdown content', () => {
    const input = '**bold** <script>evil()</script>';
    mockSanitize.mockReturnValueOnce('**bold** ');
    expect(sanitizeMarkdown(input)).toBe('**bold** ');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeMarkdown('')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('preserves markdown syntax characters', () => {
    const input = '## Heading\n- item';
    mockSanitize.mockReturnValueOnce('## Heading\n- item');
    expect(sanitizeMarkdown(input)).toBe('## Heading\n- item');
  });

  it('calls DOMPurify with ALLOWED_TAGS and ALLOWED_ATTR both empty', () => {
    mockSanitize.mockReturnValueOnce('text');
    sanitizeMarkdown('text');
    expect(mockSanitize).toHaveBeenCalledWith('text', {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });
  });
});

// ===========================================================================
// sanitizeUrl
// ===========================================================================
describe('sanitizeUrl', () => {
  it('returns empty string for javascript: protocol URLs', () => {
    // The dangerous-protocol check runs before DOMPurify — no mock needed
    expect(sanitizeUrl('javascript:alert("xss")')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('returns empty string for data: protocol URLs', () => {
    expect(sanitizeUrl('data:text/html,<h1>hi</h1>')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('returns empty string for vbscript: protocol URLs', () => {
    expect(sanitizeUrl('vbscript:msgbox("xss")')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('returns empty string for URLs with no valid protocol', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('sanitizes valid https URLs through DOMPurify', () => {
    const url = 'https://example.com/path';
    mockSanitize.mockReturnValueOnce('https://example.com/path');
    expect(sanitizeUrl(url)).toBe('https://example.com/path');
    expect(mockSanitize).toHaveBeenCalledOnce();
  });

  it('sanitizes relative URLs through DOMPurify', () => {
    const url = '/trips/123';
    mockSanitize.mockReturnValueOnce('/trips/123');
    expect(sanitizeUrl(url)).toBe('/trips/123');
    expect(mockSanitize).toHaveBeenCalledOnce();
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeUrl('')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('is case-insensitive for dangerous protocol detection', () => {
    expect(sanitizeUrl('JAVASCRIPT:evil()')).toBe('');
    expect(sanitizeUrl('JavaScript:evil()')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// sanitizeJson
// ===========================================================================
describe('sanitizeJson', () => {
  it('sanitizes string values within a JSON object', () => {
    mockSanitize.mockReturnValueOnce('clean');
    const result = sanitizeJson({ name: '<script>evil</script>clean' });
    expect(result).toEqual({ name: 'clean' });
  });

  it('returns null for non-object input', () => {
    expect(sanitizeJson('string' as unknown as Record<string, unknown>)).toBeNull();
    expect(sanitizeJson(42 as unknown as Record<string, unknown>)).toBeNull();
    expect(sanitizeJson(null as unknown as Record<string, unknown>)).toBeNull();
  });

  it('filters keys not in the allowedKeys list', () => {
    mockSanitize.mockReturnValueOnce('Alice');
    const result = sanitizeJson(
      { name: 'Alice', secret: 'hidden' },
      ['name'],
    );
    expect(result).toEqual({ name: 'Alice' });
    expect(Object.keys(result ?? {})).not.toContain('secret');
  });

  it('keeps all keys when allowedKeys is not provided', () => {
    mockSanitize.mockReturnValueOnce('Alice');
    mockSanitize.mockReturnValueOnce('30');
    const result = sanitizeJson({ name: 'Alice', age: 30 });
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('age', 30);
  });

  it('preserves non-string primitive values unchanged', () => {
    mockSanitize.mockReturnValueOnce('text');
    const result = sanitizeJson({ label: 'text', count: 5, active: true });
    expect(result?.count).toBe(5);
    expect(result?.active).toBe(true);
  });

  it('sanitizes string items within arrays', () => {
    // Default mock impl strips tags: '<b>a</b>' → 'a', '<i>b</i>' → 'b'
    const result = sanitizeJson({ tags: ['<b>a</b>', '<i>b</i>'] });
    expect(result?.tags).toEqual(['a', 'b']);
  });
});

// ===========================================================================
// sanitizeEmail
// ===========================================================================
describe('sanitizeEmail', () => {
  it('returns a valid email unchanged', () => {
    mockSanitize.mockReturnValueOnce('user@example.com');
    expect(sanitizeEmail('user@example.com')).toBe('user@example.com');
  });

  it('converts email to lowercase', () => {
    mockSanitize.mockReturnValueOnce('user@example.com');
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('returns empty string for invalid email format', () => {
    mockSanitize.mockReturnValueOnce('notanemail');
    expect(sanitizeEmail('notanemail')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeEmail('')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });

  it('returns empty string when HTML is injected into email field', () => {
    // sanitizeInput strips tags → invalid email format → returns ''
    mockSanitize.mockReturnValueOnce('');
    expect(sanitizeEmail('<script>bad</script>@evil.com')).toBe('');
  });
});

// ===========================================================================
// sanitizeSearchQuery
// ===========================================================================
describe('sanitizeSearchQuery', () => {
  it('returns sanitized plain text query', () => {
    mockSanitize.mockReturnValueOnce('paris france');
    expect(sanitizeSearchQuery('paris france')).toBe('paris france');
  });

  it('strips < > quote characters from search queries', () => {
    mockSanitize.mockReturnValueOnce('<b>search</b>');
    const result = sanitizeSearchQuery('<b>search</b>');
    // sanitizeInput strips tags to '<b>search</b>' → mock returns that →
    // then the regex strips remaining <, >, b, / chars
    expect(result).not.toMatch(/[<>'"]/);
  });

  it('truncates query to maxLength', () => {
    const long = 'a'.repeat(200);
    mockSanitize.mockReturnValueOnce(long);
    const result = sanitizeSearchQuery(long, 50);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('uses default maxLength of 100', () => {
    const long = 'a'.repeat(150);
    mockSanitize.mockReturnValueOnce(long);
    const result = sanitizeSearchQuery(long);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeSearchQuery('')).toBe('');
    expect(mockSanitize).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// createBodySanitizer
// ===========================================================================
describe('createBodySanitizer', () => {
  it('sanitizes text fields as plain text', () => {
    const sanitize = createBodySanitizer<{ title: string }>({ text: ['title'] });
    mockSanitize.mockReturnValueOnce('clean title');
    const result = sanitize({ title: '<b>clean title</b>' });
    expect(result.title).toBe('clean title');
  });

  it('sanitizes html fields using the html sanitizer', () => {
    const sanitize = createBodySanitizer<{ bio: string }>({ html: ['bio'] });
    mockSanitize.mockReturnValueOnce('<b>bio</b>');
    const result = sanitize({ bio: '<b>bio</b><script>evil()</script>' });
    expect(result.bio).toBe('<b>bio</b>');
  });

  it('sanitizes url fields using the url sanitizer', () => {
    const sanitize = createBodySanitizer<{ link: string }>({ url: ['link'] });
    mockSanitize.mockReturnValueOnce('https://safe.com');
    const result = sanitize({ link: 'https://safe.com' });
    expect(result.link).toBe('https://safe.com');
  });

  it('blocks javascript: protocol in url fields', () => {
    const sanitize = createBodySanitizer<{ link: string }>({ url: ['link'] });
    // sanitizeUrl returns '' for dangerous protocol — DOMPurify not called
    const result = sanitize({ link: 'javascript:evil()' });
    expect(result.link).toBe('');
  });

  it('sanitizes email fields', () => {
    const sanitize = createBodySanitizer<{ email: string }>({ email: ['email'] });
    mockSanitize.mockReturnValueOnce('user@example.com');
    const result = sanitize({ email: 'User@Example.COM' });
    expect(result.email).toBe('user@example.com');
  });

  it('passes non-string field values through unchanged', () => {
    const sanitize = createBodySanitizer<{ count: number }>({ text: ['name'] });
    const result = sanitize({ count: 42 });
    expect(result.count).toBe(42);
  });

  it('handles multiple field configs simultaneously', () => {
    const sanitize = createBodySanitizer<{ title: string; link: string }>({
      text: ['title'],
      url: ['link'],
    });
    mockSanitize.mockReturnValueOnce('My Trip');
    mockSanitize.mockReturnValueOnce('https://example.com');
    const result = sanitize({ title: 'My Trip', link: 'https://example.com' });
    expect(result.title).toBe('My Trip');
    expect(result.link).toBe('https://example.com');
  });
});
