import DOMPurify from 'isomorphic-dompurify';

/**
 * Input sanitization utilities using DOMPurify
 * 
 * These utilities help prevent XSS (Cross-Site Scripting) attacks
 * by sanitizing user input before storing or displaying it.
 */

/**
 * Sanitize plain text input - removes ALL HTML tags
 * Use for: usernames, titles, single-line text fields
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
 * Sanitize rich text/HTML content - allows safe HTML formatting
 * Use for: descriptions, bio, comments, rich text editor content
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
 * Sanitize markdown content - removes HTML but keeps markdown syntax
 * Use for: markdown editor content before processing
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
 * Sanitize URL - validates and sanitizes URLs
 * Use for: external links, image URLs, redirect URLs
 * 
 * @returns sanitized URL or empty string if invalid/dangerous
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
 * Sanitize JSON input - ensures JSON is safe and properly formatted
 * Use for: API request bodies, stored JSON data
 * 
 * @returns sanitized object or null if invalid
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
 * Sanitize email address
 * Use for: email input fields
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
 * Sanitize search query
 * Use for: search inputs, filter queries
 */
export function sanitizeSearchQuery(query: string, maxLength = 100): string {
  if (!query || typeof query !== 'string') return '';
  
  return sanitizeInput(query)
    .slice(0, maxLength)
    .replace(/[<>'"]/g, ''); // Extra protection for search contexts
}

/**
 * Create a sanitization middleware for API routes
 * Use in API routes to sanitize request body before processing
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

