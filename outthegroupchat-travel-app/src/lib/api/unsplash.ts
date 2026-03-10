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

export function isUnsplashConfigured(): boolean {
  return !!UNSPLASH_ACCESS_KEY;
}

/**
 * Search Unsplash for images matching a query.
 * Free tier: 50 requests/hour.
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
