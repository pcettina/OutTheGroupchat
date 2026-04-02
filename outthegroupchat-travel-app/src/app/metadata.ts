import { Metadata } from 'next';

const SITE_URL = 'https://outthegroupchat.com';
const SITE_NAME = 'OutTheGroupchat';
const DEFAULT_OG_IMAGE = '/og-image.png';

export const DEFAULT_TITLE = `${SITE_NAME} - Plan Group Trips Together`;
export const DEFAULT_DESCRIPTION =
  'The easiest way to plan trips with friends. Coordinate preferences, vote on activities, and create perfect group travel experiences.';

/**
 * Build page-level metadata that merges with the root layout defaults.
 * Call from any Server Component page to override title/description/OG fields.
 */
export function buildMetadata(overrides: {
  title: string;
  description: string;
  path?: string;
}): Metadata {
  const pageUrl = overrides.path ? `${SITE_URL}${overrides.path}` : SITE_URL;

  return {
    title: overrides.title,
    description: overrides.description,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: overrides.title,
      description: overrides.description,
      url: pageUrl,
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} - Group Travel Planning Made Easy`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: overrides.title,
      description: overrides.description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}
