import { Outfit, Poppins } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/lib/providers';
import { SkipLinks } from '@/components/accessibility';
import { Analytics } from '@vercel/analytics/react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OutTheGroupchat — Meet Up IRL',
  description: 'The social network that wants to get you off your phone. Build your Crew, post a meetup, show up.',
  keywords: ['meetup', 'social network', 'irl', 'crew', 'friends', 'hang out'],
  openGraph: {
    title: 'OutTheGroupchat — Meet Up IRL',
    description: 'The social network that wants to get you off your phone. Build your Crew, post a meetup, show up.',
    type: 'website',
    url: 'https://outthegroupchat.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OutTheGroupchat — Meet Up IRL',
    description: 'The social network that wants to get you off your phone. Build your Crew, post a meetup, show up.',
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
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#10b981" />
      </head>
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
