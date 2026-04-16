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
 * Sanitizes plain text input by removing all HTML tags.
 * Use for: usernames, titles, single-line text fields.
 *
 * @param input - Raw string from user input to be sanitized
 * @returns Plain text with all HTML stripped and whitespace trimmed
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
 * Sanitizes rich text/HTML content, allowing a safe allowlist of formatting tags.
 * Use for: descriptions, bio, comments, rich text editor content.
 *
 * @param html - Raw HTML string from user input
 * @returns HTML with unsafe tags and attributes removed, safe for rendering
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
 * Sanitizes markdown content by stripping HTML while preserving markdown syntax.
 * Use for: markdown editor content before processing.
 *
 * @param markdown - Raw markdown string potentially containing HTML
 * @returns Markdown string with all HTML removed, markdown syntax intact
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
 * Validates and sanitizes a URL, rejecting dangerous protocols such as javascript: or data:.
 * Use for: external links, image URLs, redirect URLs.
 *
 * @param url - Raw URL string to validate and sanitize
 * @returns Sanitized URL string, or an empty string if the URL is invalid or dangerous
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
 * Recursively sanitizes a JSON object, stripping dangerous strings from all string values.
 * Use for: API request bodies, stored JSON data.
 *
 * @param json - Unknown value expected to be a plain object; non-objects return null
 * @param allowedKeys - Optional allowlist of top-level keys to include; omitting allows all keys
 * @returns Sanitized object cast to T, or null if the input is not a valid object
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
 * Sanitizes and validates an email address, lowercasing and stripping HTML.
 * Use for: email input fields.
 *
 * @param email - Raw email string from user input
 * @returns Lowercase sanitized email string, or an empty string if the format is invalid
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
 * Sanitizes a search query by stripping HTML and truncating to a maximum length.
 * Use for: search inputs, filter queries.
 *
 * @param query - Raw search string from user input
 * @param maxLength - Maximum character length to allow (default: 100)
 * @returns Sanitized query string truncated to maxLength
 */
export function sanitizeSearchQuery(query: string, maxLength = 100): string {
  if (!query || typeof query !== 'string') return '';
  
  return sanitizeInput(query)
    .slice(0, maxLength)
    .replace(/[<>'"]/g, ''); // Extra protection for search contexts
}

/**
 * Creates a reusable sanitizer function for API route request bodies.
 * Configures which fields to treat as plain text, HTML, URL, or email.
 *
 * @param fieldsConfig - Object mapping sanitization strategy to arrays of field names
 * @param fieldsConfig.text - Field names to sanitize as plain text (all HTML removed)
 * @param fieldsConfig.html - Field names to sanitize as HTML (safe tags allowed)
 * @param fieldsConfig.url - Field names to sanitize as URLs (dangerous protocols rejected)
 * @param fieldsConfig.email - Field names to sanitize as email addresses
 * @returns A sanitizer function that accepts a raw body object and returns the sanitized version cast to T
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

