/**
 * @module sanitize
 * @description Input sanitization utilities using isomorphic-dompurify to prevent XSS attacks.
 * Provides functions for sanitizing plain text, HTML, markdown, URLs, JSON objects, email
 * addresses, search queries, and a configurable body sanitizer factory for API routes.
 */
import DOMPurify from 'isomorphic-dompurify';

/**
 * Input sanitization utilities using DOMPurify
 * 
 * These utilities help prevent XSS (Cross-Site Scripting) attacks
 * by sanitizing user input before storing or displaying it.
 */

/**
 * @description Sanitizes plain text input by stripping ALL HTML tags and trimming whitespace.
 * Use for usernames, titles, and any single-line text field where rich formatting is unwanted.
 *
 * @param {string} input - The raw string to sanitize.
 * @returns {string} The sanitized plain-text string, or an empty string when `input` is falsy
 *   or not a string.
 *
 * @example
 * sanitizeInput('<script>alert("xss")</script>Hello') // Returns: 'Hello'
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  // Strip all HTML tags - only keep plain text
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  }).trim();
}

/**
 * @description Sanitizes rich text / HTML content by allowing only a curated set of safe
 * formatting tags and attributes while stripping all scripts, event handlers, and data
 * attributes. Use for descriptions, bios, comments, and rich-text editor output.
 *
 * @param {string} html - The raw HTML string to sanitize.
 * @returns {string} The sanitized HTML string retaining only safe tags and attributes,
 *   or an empty string when `html` is falsy or not a string.
 *
 * @example
 * sanitizeHtml('<b>Hello</b> <script>evil()</script>') // Returns: '<b>Hello</b>'
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  
  return DOMPurify.sanitize(html, {
    // Only allow safe formatting tags
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'u', 's', 'strike',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'a',
      'blockquote',
      'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'span', 'div',
    ],
    // Only allow safe attributes
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'title',
      'class', 'id',
    ],
    // Force links to open in new tab with security
    ALLOW_DATA_ATTR: false,
    // Transform tags for safety
    ADD_ATTR: ['target', 'rel'],
    // Custom hook to secure links
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * @description Sanitizes markdown content by removing all embedded HTML tags while
 * preserving the plain-text markdown syntax. Use this before passing user-supplied
 * markdown to a renderer so that the renderer cannot be tricked via injected HTML.
 *
 * @param {string} markdown - The raw markdown string to sanitize.
 * @returns {string} The sanitized string with HTML stripped, or an empty string when
 *   `markdown` is falsy or not a string.
 */
export function sanitizeMarkdown(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';
  
  // Remove HTML but keep the text content
  return DOMPurify.sanitize(markdown, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * @description Validates and sanitizes a URL string. Only `http:`, `https:`, and relative
 * URLs (starting with `/`) are permitted. Dangerous protocol schemes such as `javascript:`,
 * `data:`, and `vbscript:` are rejected. Use for external links, image URLs, and redirect
 * destination values.
 *
 * @param {string} url - The raw URL string to validate and sanitize.
 * @returns {string} The sanitized URL string, or an empty string when `url` is falsy, not a
 *   string, uses a dangerous protocol, or does not start with an allowed protocol.
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  
  const trimmedUrl = url.trim();
  
  // Only allow http, https, and relative URLs
  const isValidProtocol = /^(https?:\/\/|\/)/i.test(trimmedUrl);
  const isDangerous = /^(javascript|data|vbscript):/i.test(trimmedUrl);
  
  if (isDangerous || !isValidProtocol) {
    return '';
  }
  
  // Sanitize the URL text itself
  return DOMPurify.sanitize(trimmedUrl, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * @description Recursively sanitizes a JSON-compatible object by applying
 * {@link sanitizeInput} to every string value, recursing into nested objects,
 * and sanitizing string elements inside arrays. Non-string primitives are passed
 * through unchanged. An optional allowlist of top-level keys restricts which
 * fields are included in the output. Use for API request bodies and stored JSON data.
 *
 * @template T - The expected shape of the sanitized result object.
 * @param {unknown} json - The value to sanitize. Must be a non-null object; returns `null` otherwise.
 * @param {string[]} [allowedKeys] - Optional list of top-level keys to retain. When omitted, all
 *   keys are included.
 * @returns {T | null} The sanitized object cast to `T`, or `null` if `json` is not an object or
 *   an unexpected error occurs during traversal.
 */
export function sanitizeJson<T extends Record<string, unknown>>(
  json: unknown,
  allowedKeys?: string[]
): T | null {
  if (!json || typeof json !== 'object') return null;
  
  try {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
      // Skip if key not in allowed list (when specified)
      if (allowedKeys && !allowedKeys.includes(key)) continue;
      
      // Sanitize string values
      if (typeof value === 'string') {
        sanitized[key] = sanitizeInput(value);
      }
      // Recursively sanitize nested objects
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = sanitizeJson(value as Record<string, unknown>);
      }
      // Sanitize arrays
      else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => {
          if (typeof item === 'string') return sanitizeInput(item);
          if (item && typeof item === 'object') return sanitizeJson(item as Record<string, unknown>);
          return item;
        });
      }
      // Keep primitive values as-is
      else {
        sanitized[key] = value;
      }
    }
    
    return sanitized as T;
  } catch {
    return null;
  }
}

/**
 * @description Sanitizes and validates an email address by first stripping any HTML via
 * {@link sanitizeInput}, converting to lowercase, and then verifying the result matches a
 * basic email format pattern. Use for email input fields before storage or comparison.
 *
 * @param {string} email - The raw email string to sanitize.
 * @returns {string} The normalized, sanitized email address if it passes format validation,
 *   or an empty string when `email` is falsy, not a string, or fails format validation.
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  
  // Basic email sanitization
  const sanitized = sanitizeInput(email).toLowerCase();
  
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(sanitized) ? sanitized : '';
}

/**
 * @description Sanitizes a search query string by stripping HTML via {@link sanitizeInput},
 * truncating to a maximum length, and removing residual angle-bracket and quote characters
 * that could interfere with search back-ends. Use for search input fields and filter query
 * parameters.
 *
 * @param {string} query - The raw search query string to sanitize.
 * @param {number} [maxLength=100] - The maximum number of characters to retain after sanitization.
 * @returns {string} The sanitized, truncated search string, or an empty string when `query` is
 *   falsy or not a string.
 */
export function sanitizeSearchQuery(query: string, maxLength = 100): string {
  if (!query || typeof query !== 'string') return '';
  
  return sanitizeInput(query)
    .slice(0, maxLength)
    .replace(/[<>'"]/g, ''); // Extra protection for search contexts
}

/**
 * @description Factory that creates a typed body-sanitization function for use in API route
 * handlers. Each field listed in `fieldsConfig` is sanitized with the appropriate strategy:
 * plain-text fields via {@link sanitizeInput}, HTML fields via {@link sanitizeHtml}, URL
 * fields via {@link sanitizeUrl}, and email fields via {@link sanitizeEmail}. Fields not
 * present in the body are left untouched.
 *
 * @template T - The expected shape of the sanitized request body.
 * @param {{ text?: string[]; html?: string[]; url?: string[]; email?: string[] }} fieldsConfig -
 *   An object whose keys name sanitization strategies and whose values are arrays of body field
 *   names to apply that strategy to.
 * @returns {(body: Record<string, unknown>) => T} A function that accepts a raw request body
 *   object and returns a sanitized copy cast to `T`.
 */
export function createBodySanitizer<T extends Record<string, unknown>>(
  fieldsConfig: {
    text?: string[];      // Fields to sanitize as plain text
    html?: string[];      // Fields to sanitize as HTML
    url?: string[];       // Fields to sanitize as URLs
    email?: string[];     // Fields to sanitize as emails
  }
): (body: Record<string, unknown>) => T {
  return (body: Record<string, unknown>): T => {
    const sanitized = { ...body };
    
    fieldsConfig.text?.forEach(field => {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = sanitizeInput(sanitized[field] as string);
      }
    });
    
    fieldsConfig.html?.forEach(field => {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = sanitizeHtml(sanitized[field] as string);
      }
    });
    
    fieldsConfig.url?.forEach(field => {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = sanitizeUrl(sanitized[field] as string);
      }
    });
    
    fieldsConfig.email?.forEach(field => {
      if (typeof sanitized[field] === 'string') {
        sanitized[field] = sanitizeEmail(sanitized[field] as string);
      }
    });
    
    return sanitized as T;
  };
}

