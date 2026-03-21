import { logger } from '@/lib/logger';

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_API_URL = 'https://api.unsplash.com';

export interface UnsplashImage {
  id: string;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  alt_description: string | null;
  description: string | null;
  width: number;
  height: number;
  user: {
    name: string;
    username: string;
    links: {
      html: string;
    };
  };
  links: {
    html: string;
  };
}

export interface UnsplashSearchResult {
  total: number;
  total_pages: number;
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
