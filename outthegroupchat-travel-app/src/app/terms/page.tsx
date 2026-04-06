import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | OutTheGroupchat',
  description: 'Review the Terms of Service governing your use of OutTheGroupchat.',
};

interface Section {
  id: string;
  title: string;
  content: string[];
}

const sections: Section[] = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: [
      'By accessing or using OutTheGroupchat (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.',
      'We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes your acceptance of the revised Terms. We will notify registered users of material changes via email or an in-app notice.',
      'You must be at least 13 years old to use the Service. By using the Service, you represent that you meet this age requirement.',
    ],
  },
  {
    id: 'use-of-service',
    title: '2. Use of Service',
    content: [
      'You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not use the Service to harass, threaten, or harm other users, or to transmit unsolicited commercial messages.',
      'You agree not to attempt to gain unauthorized access to any part of the Service, its servers, or any connected systems.',
      'You agree not to scrape, crawl, or use automated means to access the Service without our prior written consent.',
      'We reserve the right to suspend or terminate access for any user who violates these Terms.',
    ],
  },
  {
    id: 'user-accounts',
    title: '3. User Accounts',
    content: [
      'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.',
      'You agree to provide accurate and complete information when creating your account and to keep this information up to date.',
      'You may not share your account or allow others to access the Service using your credentials.',
      'Notify us immediately at support@outthegroupchat.com if you suspect unauthorized access to your account.',
    ],
  },
  {
    id: 'content',
    title: '4. User Content',
    content: [
      'You retain ownership of any content you create on the Service, including trip details, activity descriptions, photos, and comments ("User Content").',
      'By posting User Content, you grant OutTheGroupchat a non-exclusive, royalty-free, worldwide license to use, display, and distribute that content solely to operate and improve the Service.',
      'You represent that you have the rights to post your User Content and that it does not infringe the intellectual property or privacy rights of any third party.',
      'We reserve the right to remove any User Content that violates these Terms or that we reasonably deem harmful, offensive, or otherwise inappropriate.',
    ],
  },
  {
    id: 'intellectual-property',
    title: '5. Intellectual Property',
    content: [
      'All software, design, logos, trademarks, and other materials that comprise the Service (excluding User Content) are owned by or licensed to OutTheGroupchat and are protected by applicable intellectual property laws.',
      'You are granted a limited, non-exclusive, non-transferable license to access and use the Service for your personal, non-commercial purposes.',
      'You may not copy, modify, distribute, sell, or lease any part of the Service or its underlying code without our prior written permission.',
    ],
  },
  {
    id: 'limitation-of-liability',
    title: '6. Limitation of Liability',
    content: [
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING FITNESS FOR A PARTICULAR PURPOSE OR NON-INFRINGEMENT.',
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUTTHEGROUPCHAT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE.',
      'Our total liability to you for any claims arising from these Terms or the Service shall not exceed the amount you paid us in the twelve months preceding the claim, or $100, whichever is greater.',
      'Some jurisdictions do not allow exclusion of implied warranties or limitation of liability, so the above limitations may not fully apply to you.',
    ],
  },
  {
    id: 'termination',
    title: '7. Termination',
    content: [
      'You may delete your account at any time from your account settings. Upon deletion, your personal data will be handled in accordance with our Privacy Policy.',
      'We may suspend or terminate your access to the Service at our discretion, without notice, for conduct that we determine violates these Terms or is otherwise harmful.',
      'Upon termination, all licenses granted to you under these Terms will immediately cease.',
    ],
  },
  {
    id: 'governing-law',
    title: '8. Governing Law',
    content: [
      'These Terms are governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions.',
      'Any disputes arising under these Terms shall be resolved in the state or federal courts located in Delaware, and you consent to personal jurisdiction in those courts.',
      'If any provision of these Terms is found unenforceable, the remaining provisions will continue in full force and effect.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contact',
    content: [
      'If you have questions about these Terms, please contact us at legal@outthegroupchat.com.',
      'For general support inquiries, reach us at support@outthegroupchat.com.',
    ],
  },
];

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Last Updated: April 2026
          </p>
          <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">
            Please read these Terms of Service carefully before using OutTheGroupchat. These Terms
            govern your access to and use of our group travel planning platform and related services.
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
            <Link href="/privacy" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              Privacy Policy
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
