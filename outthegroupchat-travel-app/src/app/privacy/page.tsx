import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | OutTheGroupchat',
  description: 'Learn how OutTheGroupchat collects, uses, and protects your personal information.',
};

interface Section {
  id: string;
  title: string;
  content: string[];
}

const sections: Section[] = [
  {
    id: 'data-collection',
    title: '1. Data We Collect',
    content: [
      'We collect information you provide directly, including your name, email address, profile photo, and any content you create within the app (trips, activities, survey responses, comments).',
      'When you connect third-party accounts (e.g., Google), we receive basic profile information permitted by your authorization.',
      'We automatically collect usage data such as pages visited, features used, device type, browser type, and IP address to improve our service.',
      'With your permission, we may collect location information to provide destination recommendations relevant to your group.',
    ],
  },
  {
    id: 'how-we-use-data',
    title: '2. How We Use Your Data',
    content: [
      'To create and manage your account and authenticate your identity.',
      'To enable core features: trip creation, group coordination, activity voting, AI-powered recommendations, and real-time collaboration.',
      'To send transactional emails such as trip invitations, activity updates, and account notifications.',
      'To improve our product through aggregate usage analytics and performance monitoring.',
      'To comply with legal obligations and enforce our Terms of Service.',
    ],
  },
  {
    id: 'data-sharing',
    title: '3. Data Sharing',
    content: [
      'We do not sell your personal data to third parties.',
      'Trip members can see profile information (name, photo) of other members in shared trips. You control what you add to your profile.',
      'We share data with trusted service providers who help us operate the platform (database hosting, email delivery, analytics). These providers are bound by data processing agreements.',
      'We may disclose information if required by law, court order, or governmental authority, or to protect the rights, property, or safety of our users.',
    ],
  },
  {
    id: 'cookies',
    title: '4. Cookies & Tracking',
    content: [
      'We use essential session cookies to keep you signed in and maintain your preferences.',
      'We use analytics cookies (via Vercel Analytics) to understand how users interact with the platform. This data is aggregated and does not identify you personally.',
      'You can disable non-essential cookies through your browser settings; however, some features may not function correctly without session cookies.',
      'We do not use advertising or cross-site tracking cookies.',
    ],
  },
  {
    id: 'security',
    title: '5. Data Security',
    content: [
      'We use industry-standard encryption (TLS/HTTPS) for all data in transit.',
      'Passwords are never stored in plaintext; all credentials are hashed using bcrypt.',
      'Our database is hosted on Supabase with row-level security and access controls.',
      'While we work hard to protect your data, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security.',
    ],
  },
  {
    id: 'your-rights',
    title: '6. Your Rights',
    content: [
      'Access: You may request a copy of the personal data we hold about you.',
      'Correction: You may update your profile information at any time from your account settings.',
      'Deletion: You may request deletion of your account and associated data by contacting us. Some data may be retained for legal or safety purposes.',
      'Portability: You may request an export of your trip data in a machine-readable format.',
      'If you are located in the European Economic Area (EEA), you have additional rights under the GDPR. Contact us to exercise any of these rights.',
    ],
  },
  {
    id: 'contact',
    title: '7. Contact Us',
    content: [
      'If you have questions or concerns about this Privacy Policy or our data practices, please contact us at privacy@outthegroupchat.com.',
      'We will respond to all data rights requests within 30 days.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">OG</span>
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm sm:text-base">
              OutTheGroupchat
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
          >
            &larr; Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Last Updated: April 2026
          </p>
          <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">
            OutTheGroupchat (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to protecting
            your privacy. This policy explains what information we collect, how we use it, and the
            choices you have regarding your data when you use our group travel planning platform.
          </p>
        </div>

        {/* Table of contents */}
        <nav className="mb-10 p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Contents
          </h2>
          <ol className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-6"
            >
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
                {section.title}
              </h2>
              <ul className="space-y-3">
                {section.content.map((paragraph, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{paragraph}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer nav */}
        <div className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} OutTheGroupchat. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Terms of Service
            </Link>
            <Link href="/" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
