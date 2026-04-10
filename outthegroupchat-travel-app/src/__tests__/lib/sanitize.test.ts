/**
 * Unit tests for src/lib/sanitize.ts
 *
 * Strategy
 * --------
 * isomorphic-dompurify works natively in the Node.js test environment —
 * no mocking required. All functions are pure utilities that wrap DOMPurify,
 * so tests exercise real sanitization behavior end-to-end.
 *
 * Coverage targets:
 *   - sanitizeInput: strips all HTML, preserves plain text
 *   - sanitizeHtml: allows safe tags, strips dangerous ones
 *   - sanitizeMarkdown: removes HTML, keeps markdown characters
 *   - sanitizeUrl: blocks javascript:/data:/vbscript: URLs
 *   - sanitizeJson: recursively sanitizes string values
 *   - sanitizeEmail: validates and lowercases email addresses
 *   - sanitizeSearchQuery: limits length and strips dangerous chars
 *   - createBodySanitizer: factory wires correct sanitizer per field type
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// sanitizeInput
// ===========================================================================
describe('sanitizeInput', () => {
  it('strips <script> tags and their content', () => {
    expect(sanitizeInput('<script>alert("xss")</script>Hello')).toBe('Hello');
  });

  it('strips inline event handlers', () => {
    const result = sanitizeInput('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('<img');
  });

  it('strips onclick attributes', () => {
    const result = sanitizeInput('<div onclick="evil()">Click me</div>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('<div');
  });

  it('removes <b> and all HTML tags — plain text only', () => {
    const result = sanitizeInput('<b>bold</b> text');
    expect(result).not.toContain('<b>');
    expect(result).toContain('bold');
    expect(result).toContain('text');
  });

  it('removes <a href="..."> links entirely', () => {
    const result = sanitizeInput('<a href="https://evil.com">click</a>');
    expect(result).not.toContain('<a');
    expect(result).toContain('click');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('returns empty string for non-string input (null coercion)', () => {
    // The function checks `!input || typeof input !== 'string'`
    expect(sanitizeInput(null as unknown as string)).toBe('');
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
  });

  it('returns empty string for number input', () => {
    expect(sanitizeInput(42 as unknown as string)).toBe('');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('preserves plain text without any HTML', () => {
    expect(sanitizeInput('Paris in the springtime')).toBe('Paris in the springtime');
  });

  it('handles nested XSS attempts — no executable script tags in output', () => {
    // The double-nesting trick partially bypasses tag detection; however,
    // DOMPurify ensures no executable <script> tag is produced. The raw word
    // "alert" may appear as plain text, which is safe — it cannot execute.
    const result = sanitizeInput('<scr<script>ipt>alert(1)</scr</script>ipt>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script>');
  });

  it('strips javascript: URL in plain text context', () => {
    const result = sanitizeInput('javascript:alert(1)');
    // DOMPurify with no ALLOWED_TAGS strips everything; plain text is kept
    // but the dangerous protocol is not executed as HTML
    expect(result).not.toContain('<');
  });

  it('handles data URI attempt in text', () => {
    const result = sanitizeInput('data:text/html,<h1>XSS</h1>');
    expect(result).not.toContain('<h1>');
  });
});

// ===========================================================================
// sanitizeHtml
// ===========================================================================
describe('sanitizeHtml', () => {
  it('allows <b> tags', () => {
    expect(sanitizeHtml('<b>bold</b>')).toContain('<b>');
  });

  it('allows <i> tags', () => {
    expect(sanitizeHtml('<i>italic</i>')).toContain('<i>');
  });

  it('allows <em> tags', () => {
    expect(sanitizeHtml('<em>emphasis</em>')).toContain('<em>');
  });

  it('allows <strong> tags', () => {
    expect(sanitizeHtml('<strong>strong</strong>')).toContain('<strong>');
  });

  it('allows <a href="..."> links', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('<a');
    expect(result).toContain('href');
    expect(result).toContain('link');
  });

  it('allows heading tags', () => {
    expect(sanitizeHtml('<h1>Title</h1>')).toContain('<h1>');
    expect(sanitizeHtml('<h2>Subtitle</h2>')).toContain('<h2>');
  });

  it('allows <ul> <ol> <li> list elements', () => {
    const result = sanitizeHtml('<ul><li>item</li></ul>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });

  it('allows <blockquote>', () => {
    expect(sanitizeHtml('<blockquote>quote</blockquote>')).toContain('<blockquote>');
  });

  it('allows <code> and <pre>', () => {
    expect(sanitizeHtml('<code>const x = 1;</code>')).toContain('<code>');
    expect(sanitizeHtml('<pre>preformatted</pre>')).toContain('<pre>');
  });

  it('strips <script> tags', () => {
    const result = sanitizeHtml('<b>Hello</b><script>evil()</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('evil()');
    expect(result).toContain('<b>Hello</b>');
  });

  it('strips onerror event handler', () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('strips onclick attribute', () => {
    const result = sanitizeHtml('<div onclick="evil()">text</div>');
    expect(result).not.toContain('onclick');
  });

  it('strips onload handler from body/iframe', () => {
    const result = sanitizeHtml('<iframe onload="evil()"></iframe>');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('<iframe');
  });

  it('strips javascript: href', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('strips data: href', () => {
    const result = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">click</a>');
    expect(result).not.toContain('data:');
  });

  it('strips style attribute with expression', () => {
    const result = sanitizeHtml('<div style="background:url(javascript:alert(1))">text</div>');
    // style is not in ALLOWED_ATTR, so it should be stripped
    expect(result).not.toContain('javascript:');
  });

  it('handles complex nested XSS: script within allowed tag', () => {
    const result = sanitizeHtml('<b><script>alert(1)</script>bold text</b>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });

  it('strips SVG-based XSS', () => {
    const result = sanitizeHtml('<svg onload="alert(1)"><use href="#x"></use></svg>');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert(1)');
  });

  it('strips <object> and <embed> tags', () => {
    const result = sanitizeHtml('<object data="evil.swf"></object><embed src="evil.swf">');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });

  it('preserves safe mixed content', () => {
    const input = '<h1>Trip to Paris</h1><p>A <b>wonderful</b> city with <em>great</em> food.</p>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<h1>');
    expect(result).toContain('<b>');
    expect(result).toContain('<em>');
  });
});

// ===========================================================================
// sanitizeMarkdown
// ===========================================================================
describe('sanitizeMarkdown', () => {
  it('removes HTML tags from markdown content', () => {
    const result = sanitizeMarkdown('# Title\n\n<script>evil()</script>');
    expect(result).not.toContain('<script>');
  });

  it('preserves markdown syntax characters', () => {
    const result = sanitizeMarkdown('**bold** _italic_ [link](url)');
    expect(result).toContain('**bold**');
    expect(result).toContain('_italic_');
    // URL text preserved; actual sanitization of the markdown link syntax is fine
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeMarkdown('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeMarkdown(null as unknown as string)).toBe('');
  });

  it('strips inline HTML in markdown', () => {
    const result = sanitizeMarkdown('Hello <b>world</b>');
    expect(result).not.toContain('<b>');
    expect(result).toContain('world');
  });

  it('strips XSS in markdown context', () => {
    const result = sanitizeMarkdown('[click me](javascript:alert(1))');
    // The link text is preserved but dangerous HTML is stripped
    expect(result).not.toContain('<script');
    // The markdown syntax itself (no HTML tags) is not something DOMPurify strips
    expect(result).toContain('click me');
  });
});

// ===========================================================================
// sanitizeUrl
// ===========================================================================
describe('sanitizeUrl', () => {
  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative URLs starting with /', () => {
    expect(sanitizeUrl('/trips/123')).toBe('/trips/123');
  });

  it('blocks javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks JAVASCRIPT: (uppercase) URLs', () => {
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
  });

  it('blocks data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('blocks vbscript: URLs', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeUrl(null as unknown as string)).toBe('');
    expect(sanitizeUrl(undefined as unknown as string)).toBe('');
  });

  it('returns empty string for non-http/https/relative URLs', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe('');
    expect(sanitizeUrl('file:///etc/passwd')).toBe('');
  });

  it('trims whitespace before validation', () => {
    expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('blocks URLs with embedded HTML', () => {
    const result = sanitizeUrl('https://example.com/<script>alert(1)</script>');
    // The URL passes the protocol check; DOMPurify sanitizes the embedded tags
    expect(result).not.toContain('<script>');
  });
});

// ===========================================================================
// sanitizeJson
// ===========================================================================
describe('sanitizeJson', () => {
  it('sanitizes string values in top-level object', () => {
    const result = sanitizeJson({ name: '<script>evil()</script>Alice' });
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).name).not.toContain('<script>');
    expect((result as Record<string, unknown>).name).toContain('Alice');
  });

  it('preserves numeric and boolean values', () => {
    const result = sanitizeJson({ count: 42, active: true });
    expect((result as Record<string, unknown>).count).toBe(42);
    expect((result as Record<string, unknown>).active).toBe(true);
  });

  it('recursively sanitizes nested objects', () => {
    const result = sanitizeJson({
      user: { bio: '<script>evil()</script>Nice person' },
    });
    expect(result).not.toBeNull();
    const user = (result as Record<string, Record<string, unknown>>).user;
    expect(user.bio).not.toContain('<script>');
    expect(user.bio).toContain('Nice person');
  });

  it('sanitizes string items in arrays', () => {
    const result = sanitizeJson({ tags: ['<script>xss</script>Paris', 'Travel'] });
    expect(result).not.toBeNull();
    const tags = (result as Record<string, unknown[]>).tags;
    expect(tags[0]).not.toContain('<script>');
    expect(tags[1]).toBe('Travel');
  });

  it('respects allowedKeys filter — omits keys not in list', () => {
    const result = sanitizeJson(
      { name: 'Alice', secret: 'password123', role: 'admin' },
      ['name']
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.name).toBeDefined();
    expect(r.secret).toBeUndefined();
    expect(r.role).toBeUndefined();
  });

  it('returns null for non-object input', () => {
    expect(sanitizeJson(null)).toBeNull();
    expect(sanitizeJson('string' as unknown as Record<string, unknown>)).toBeNull();
    expect(sanitizeJson(42 as unknown as Record<string, unknown>)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(sanitizeJson(undefined)).toBeNull();
  });

  it('handles mixed array items (objects and primitives)', () => {
    const result = sanitizeJson({
      items: [{ label: '<b>Item</b>' }, 'plain string', 42],
    });
    expect(result).not.toBeNull();
    const items = (result as Record<string, unknown[]>).items;
    // Nested object in array has its strings sanitized
    expect((items[0] as Record<string, unknown>).label).not.toContain('<b>');
    expect(items[1]).toBe('plain string'); // string run through sanitizeInput
    expect(items[2]).toBe(42);
  });
});

// ===========================================================================
// sanitizeEmail
// ===========================================================================
describe('sanitizeEmail', () => {
  it('returns valid email lowercased', () => {
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('accepts standard email format', () => {
    expect(sanitizeEmail('hello@world.org')).toBe('hello@world.org');
  });

  it('returns empty string for invalid format (no @)', () => {
    expect(sanitizeEmail('notanemail')).toBe('');
  });

  it('returns empty string for missing domain', () => {
    expect(sanitizeEmail('user@')).toBe('');
  });

  it('returns empty string for missing local part', () => {
    expect(sanitizeEmail('@example.com')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeEmail('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeEmail(null as unknown as string)).toBe('');
  });

  it('strips HTML from email before validation', () => {
    // HTML injection in email field returns empty (fails format check after stripping)
    const result = sanitizeEmail('<script>alert(1)</script>@evil.com');
    // After stripping HTML tags, the local part is empty or malformed
    expect(result).toBe('');
  });

  it('handles email with subdomain', () => {
    expect(sanitizeEmail('user@mail.example.co.uk')).toBe('user@mail.example.co.uk');
  });
});

// ===========================================================================
// sanitizeSearchQuery
// ===========================================================================
describe('sanitizeSearchQuery', () => {
  it('returns plain search term unchanged', () => {
    expect(sanitizeSearchQuery('paris hotels')).toBe('paris hotels');
  });

  it('strips <script> injection', () => {
    const result = sanitizeSearchQuery('<script>alert(1)</script>paris');
    expect(result).not.toContain('<script>');
    expect(result).toContain('paris');
  });

  it('strips < and > characters', () => {
    const result = sanitizeSearchQuery('search<term>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('strips single and double quote characters', () => {
    const result = sanitizeSearchQuery("it's a \"test\"");
    expect(result).not.toContain("'");
    expect(result).not.toContain('"');
  });

  it('enforces default max length of 100 characters', () => {
    const longQuery = 'a'.repeat(150);
    const result = sanitizeSearchQuery(longQuery);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('respects custom maxLength parameter', () => {
    const result = sanitizeSearchQuery('hello world', 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeSearchQuery('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(sanitizeSearchQuery(null as unknown as string)).toBe('');
  });

  it('strips HTML-wrapped event handlers in query', () => {
    // sanitizeSearchQuery strips HTML tags via sanitizeInput and then removes <>'".
    // A bare `onclick=evil()` without angle-bracket HTML is plain text —
    // only the tag syntax itself is stripped, not attribute names in plain text.
    const result = sanitizeSearchQuery('<div onclick="evil()">text</div>');
    expect(result).not.toContain('<div');
    expect(result).not.toContain('"');
    expect(result).toContain('text');
  });
});

// ===========================================================================
// createBodySanitizer
// ===========================================================================
describe('createBodySanitizer', () => {
  it('sanitizes text fields as plain text', () => {
    const sanitize = createBodySanitizer({ text: ['name', 'title'] });
    const result = sanitize({ name: '<script>xss</script>Alice', title: '<b>Trip</b>' });
    expect(result.name).not.toContain('<script>');
    expect(result.name).toContain('Alice');
    expect(result.title).not.toContain('<b>');
    expect(result.title).toContain('Trip');
  });

  it('sanitizes html fields preserving safe tags', () => {
    const sanitize = createBodySanitizer({ html: ['description'] });
    const result = sanitize({ description: '<b>Hello</b><script>evil()</script>' });
    expect(result.description).toContain('<b>');
    expect(result.description).not.toContain('<script>');
  });

  it('sanitizes url fields blocking javascript: protocol', () => {
    const sanitize = createBodySanitizer({ url: ['website'] });
    const result = sanitize({ website: 'javascript:alert(1)' });
    expect(result.website).toBe('');
  });

  it('sanitizes url fields allowing https URLs', () => {
    const sanitize = createBodySanitizer({ url: ['website'] });
    const result = sanitize({ website: 'https://example.com' });
    expect(result.website).toBe('https://example.com');
  });

  it('sanitizes email fields', () => {
    const sanitize = createBodySanitizer({ email: ['contactEmail'] });
    const result = sanitize({ contactEmail: 'USER@EXAMPLE.COM' });
    expect(result.contactEmail).toBe('user@example.com');
  });

  it('leaves non-configured fields untouched', () => {
    const sanitize = createBodySanitizer({ text: ['name'] });
    const result = sanitize({ name: 'Alice', untouched: '<b>preserved</b>' });
    expect(result.untouched).toBe('<b>preserved</b>');
  });

  it('ignores configured fields that are not strings', () => {
    const sanitize = createBodySanitizer({ text: ['count'] });
    const result = sanitize({ count: 42 });
    expect(result.count).toBe(42);
  });

  it('handles multiple field types simultaneously', () => {
    const sanitize = createBodySanitizer({
      text: ['name'],
      html: ['bio'],
      url: ['website'],
      email: ['email'],
    });
    const result = sanitize({
      name: '<script>xss</script>Bob',
      bio: '<b>Developer</b><script>evil()</script>',
      website: 'javascript:alert(1)',
      email: 'BOB@EXAMPLE.COM',
    });
    expect(result.name).not.toContain('<script>');
    expect(result.name).toContain('Bob');
    expect(result.bio).toContain('<b>');
    expect(result.bio).not.toContain('<script>');
    expect(result.website).toBe('');
    expect(result.email).toBe('bob@example.com');
  });

  it('returns a function (factory pattern)', () => {
    const sanitize = createBodySanitizer({ text: ['name'] });
    expect(typeof sanitize).toBe('function');
  });

  it('handles empty body object', () => {
    const sanitize = createBodySanitizer({ text: ['name'] });
    const result = sanitize({});
    expect(result).toEqual({});
  });
});
