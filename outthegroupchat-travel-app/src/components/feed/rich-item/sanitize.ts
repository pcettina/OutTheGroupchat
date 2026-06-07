import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize a plain text string to remove any HTML/script injection.
 * Returns an empty string if input is null/undefined.
 */
export function sanitizeText(value: string | null | undefined): string {
  if (!value) return '';
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Sanitize a URL string. Returns an empty string if the URL contains
 * a dangerous scheme (e.g. javascript:) or any injected HTML.
 */
export function sanitizeUrl(value: string | null | undefined): string {
  if (!value) return '';
  const cleaned = DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // Block javascript: and data: schemes
  if (/^(javascript|data|vbscript):/i.test(cleaned.trim())) return '';
  return cleaned;
}

/**
 * Sanitize a route segment used in hrefs (e.g. user.id, trip.id).
 * Strips HTML and ensures the value is safe for interpolation into a path.
 */
export function sanitizeRouteSegment(value: string | null | undefined): string {
  if (!value) return '';
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
