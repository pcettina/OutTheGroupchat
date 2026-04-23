import localFont from 'next/font/local';
import '@/styles/globals.css';
import { Providers } from '@/lib/providers';
import { SkipLinks } from '@/components/accessibility';
import { Analytics } from '@vercel/analytics/react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OutTheGroupchat — Real plans with real people. Tonight.',
  description:
    'The social media app that wants to get you off your phone. NYC-first meetup network — check in, RSVP, invite your Crew, meet up IRL.',
  keywords: [
    'meetup',
    'nyc',
    'social',
    'irl',
    'crew',
    'nightlife',
    'off your phone',
    'real plans',
  ],
  themeColor: '#15110E',
};

// Display — Cabinet Grotesk (Fontshare ITF FFL). Hero, headings, numbers.
const cabinetGrotesk = localFont({
  src: [
    { path: '../../public/fonts/CabinetGrotesk-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/CabinetGrotesk-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

// Body — Switzer (Fontshare ITF FFL). UI 14–18px, body text, buttons.
const switzer = localFont({
  src: [
    { path: '../../public/fonts/Switzer-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/Switzer-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

// Editorial italic — Instrument Serif Italic (Google Fonts OFL) standing in for Sentient italic,
// which is temporarily broken on Fontshare's CSS API (tested 2026-04-23, all italic weights 500).
// Swap back when their API heals — same italic-serif editorial register.
const editorialItalic = localFont({
  src: [
    {
      path: '../../public/fonts/InstrumentSerif-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-serif',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${cabinetGrotesk.variable} ${switzer.variable} ${editorialItalic.variable}`}
    >
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="font-sans antialiased bg-otg-bg-dark text-otg-text-bright">
        <Providers>
          <SkipLinks
            links={[
              { id: 'main-content', label: 'Skip to main content' },
              { id: 'navigation', label: 'Skip to navigation' },
            ]}
          />

          <div className="min-h-screen bg-otg-bg-dark text-otg-text-bright">
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
