import { logger } from '@/lib/logger';

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_API_URL = 'https://api.unsplash.com';

/**
 * Represents a single photo returned by the Unsplash API.
 */
export interface UnsplashImage {
  /** Unique Unsplash identifier for this photo. */
  id: string;
  /** Set of pre-sized image URLs provided by Unsplash. */
  urls: {
    /** Raw, unprocessed source URL (highest quality, no resizing applied). */
    raw: string;
    /** Full-resolution URL with standard processing applied. */
    full: string;
    /** Regular-sized URL, suitable for most display contexts (~1080px wide). */
    regular: string;
    /** Small-sized URL (~400px wide), good for thumbnails. */
    small: string;
    /** Thumbnail-sized URL (~200px wide). */
    thumb: string;
  };
  /** Machine-generated alternative text description of the image, or null. */
  alt_description: string | null;
  /** Photographer-provided description of the image, or null. */
  description: string | null;
  /** Original image width in pixels. */
  width: number;
  /** Original image height in pixels. */
  height: number;
  /** Information about the photographer who uploaded the image. */
  user: {
    /** Photographer's display name. */
    name: string;
    /** Photographer's Unsplash username (used to construct profile URLs). */
    username: string;
    /** Links to the photographer's Unsplash profile pages. */
    links: {
      /** URL to the photographer's public Unsplash profile page. */
      html: string;
    };
  };
  /** Links to the image's pages on Unsplash. */
  links: {
    /** URL to the photo's public page on Unsplash. */
    html: string;
  };
}

/**
 * Represents the paginated search response from the Unsplash search/photos endpoint.
 */
export interface UnsplashSearchResult {
  /** Total number of photos matching the search query across all pages. */
  total: number;
  /** Total number of pages available for the current query and per-page size. */
  total_pages: number;
  /** Array of photo objects for the current page of results. */
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
