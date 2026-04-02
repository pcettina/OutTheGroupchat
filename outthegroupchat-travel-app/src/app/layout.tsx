import { Outfit, Poppins } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/lib/providers';
import { SkipLinks } from '@/components/accessibility';
import { Analytics } from '@vercel/analytics/react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'OutTheGroupchat - Plan Group Trips Together',
    template: '%s | OutTheGroupchat',
  },
  description: 'The easiest way to plan trips with friends. Coordinate preferences, vote on activities, and create perfect group travel experiences.',
  keywords: ['travel', 'group travel', 'trip planning', 'vacation', 'friends', 'travel planning app', 'group vacation'],
  metadataBase: new URL('https://outthegroupchat.com'),
  openGraph: {
    type: 'website',
    siteName: 'OutTheGroupchat',
    title: 'OutTheGroupchat - Plan Group Trips Together',
    description: 'The easiest way to plan trips with friends. Coordinate preferences, vote on activities, and create perfect group travel experiences.',
    url: 'https://outthegroupchat.com',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'OutTheGroupchat - Group Travel Planning Made Easy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OutTheGroupchat - Plan Group Trips Together',
    description: 'The easiest way to plan trips with friends. Coordinate preferences, vote on activities, and create perfect group travel experiences.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
  },
  other: {
    'theme-color': '#10b981',
  },
};

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${poppins.variable}`}>
      <head />
      <body className="font-sans antialiased">
        <Providers>
          {/* Skip Links for Accessibility */}
          <SkipLinks
            links={[
              { id: 'main-content', label: 'Skip to main content' },
              { id: 'navigation', label: 'Skip to navigation' },
            ]}
          />
          
          <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
            <main id="main-content" role="main">
              {children}
            </main>
          </div>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
