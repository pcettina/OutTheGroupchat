import { logger } from '@/lib/logger';

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_API_URL = 'https://api.unsplash.com';

/**
 * @description Represents a single photo returned by the Unsplash API.
 * Contains multiple resolution URLs, attribution metadata, and photographer info.
 */
export interface UnsplashImage {
  /** Unique Unsplash photo identifier. */
  id: string;
  /** Object containing pre-signed URLs at various resolutions (raw, full, regular, small, thumb). */
  urls: {
    /** Original unprocessed image URL. */
    raw: string;
    /** Full-resolution image URL. */
    full: string;
    /** Regular-resolution image URL (suitable for most display uses, ~1080px wide). */
    regular: string;
    /** Small-resolution image URL (~400px wide). */
    small: string;
    /** Thumbnail image URL (~200px wide). */
    thumb: string;
  };
  /** Machine-generated alt text for the image, or null if unavailable. */
  alt_description: string | null;
  /** Human-provided description of the image, or null if unavailable. */
  description: string | null;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Photographer attribution metadata. */
  user: {
    /** Photographer's display name. */
    name: string;
    /** Photographer's Unsplash username. */
    username: string;
    /** Links to the photographer's Unsplash profile. */
    links: {
      /** URL to the photographer's public Unsplash profile page. */
      html: string;
    };
  };
  /** Links related to the photo itself. */
  links: {
    /** URL to the photo's public Unsplash page. */
    html: string;
  };
}

/**
 * @description Represents the paginated response from the Unsplash photo search endpoint.
 * Contains the total match count, total page count, and the array of photo results.
 */
export interface UnsplashSearchResult {
  /** Total number of photos matching the search query across all pages. */
  total: number;
  /** Total number of pages available for the current query and per-page size. */
  total_pages: number;
  /** Array of photo objects for the current page. */
  results: UnsplashImage[];
}

/**
 * Returns whether the Unsplash API is configured in the current environment.
 * @returns `true` if `UNSPLASH_ACCESS_KEY` is set, `false` otherwise.
 */
export function isUnsplashConfigured(): boolean {
  return !!UNSPLASH_ACCESS_KEY;
}

/**
 * Searches Unsplash for photos matching the given query string.
 * Results are cached for 5 minutes via Next.js fetch revalidation.
 * Falls back to an empty result set if the API key is missing or the request fails.
 * Free tier limit: 50 requests per hour.
 *
 * @param query - The search term used to find relevant photos.
 * @param page - Page number for paginated results (default: 1).
 * @param perPage - Number of results per page, max 30 on the free tier (default: 12).
 * @param orientation - Optional filter for photo orientation: `'landscape'`, `'portrait'`, or `'squarish'`.
 * @returns A promise resolving to an `UnsplashSearchResult` with `total`, `total_pages`, and `results`.
 */
export async function searchImages(
  query: string,
  page = 1,
  perPage = 12,
  orientation?: 'landscape' | 'portrait' | 'squarish'
): Promise<UnsplashSearchResult> {
  if (!UNSPLASH_ACCESS_KEY) {
    logger.warn('Unsplash API key not configured');
    return { total: 0, total_pages: 0, results: [] };
  }

  const params = new URLSearchParams({
    query,
    page: String(page),
    per_page: String(perPage),
    content_filter: 'high',
  });

  if (orientation) {
    params.set('orientation', orientation);
  }

  const res = await fetch(`${UNSPLASH_API_URL}/search/photos?${params}`, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
    },
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!res.ok) {
    logger.error({ status: res.status }, 'Unsplash API request failed');
    return { total: 0, total_pages: 0, results: [] };
  }

  return res.json();
}
