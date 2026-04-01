// PLACEHOLDER — This Privacy Policy was drafted as a professional placeholder.
// Legal team must review and finalize before public launch.
// Contact: privacy@outthegroupchat.com

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — OutTheGroupchat',
  description: 'Learn how OutTheGroupchat collects, uses, and protects your personal information.',
};

const LAST_UPDATED = 'March 31, 2026';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const sections: Section[] = [
  {
    id: 'introduction',
    title: '1. Introduction',
    content: (
      <>
        <p>
          Welcome to OutTheGroupchat (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). We are
          committed to protecting your personal information and your right to privacy. This Privacy Policy
          explains how we collect, use, disclose, and safeguard your information when you use our travel
          planning platform and related services (collectively, the &quot;Service&quot;).
        </p>
        <p className="mt-3">
          Please read this policy carefully. If you disagree with its terms, please discontinue use of
          the Service. By accessing or using the Service, you acknowledge that you have read, understood,
          and agree to be bound by this Privacy Policy.
        </p>
      </>
    ),
  },
  {
    id: 'information-collected',
    title: '2. Information We Collect',
    content: (
      <>
        <p className="font-medium text-slate-800">Information You Provide to Us</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Account registration details (name, email address, password)</li>
          <li>Profile information (profile photo, travel preferences, bio)</li>
          <li>Trip planning data (destinations, travel dates, budgets, activity preferences)</li>
          <li>Group communication content (messages, votes, survey responses)</li>
          <li>Payment information (processed securely by third-party payment processors)</li>
          <li>Correspondence with our support team</li>
        </ul>
        <p className="font-medium text-slate-800 mt-4">Information Collected Automatically</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Device information (browser type, operating system, device identifiers)</li>
          <li>Log data (IP address, access times, pages viewed, referring URLs)</li>
          <li>Usage data (features used, search queries, click patterns)</li>
          <li>Location data (only when explicitly granted by you)</li>
          <li>Cookies and similar tracking technologies (see Section 4)</li>
        </ul>
        <p className="font-medium text-slate-800 mt-4">Information from Third Parties</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Social login providers (if you choose to sign in with Google or similar services)</li>
          <li>Travel partners and API providers (flight, hotel, and activity data)</li>
          <li>Analytics providers</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: '3. How We Use Your Information',
    content: (
      <>
        <p>We use the information we collect to:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Provide, operate, and maintain the Service</li>
          <li>Create and manage your account</li>
          <li>Facilitate group trip planning and collaboration features</li>
          <li>Generate AI-powered travel recommendations tailored to your group</li>
          <li>Process transactions and send related notices</li>
          <li>Send administrative communications (account confirmations, updates, security alerts)</li>
          <li>Send promotional communications, where you have opted in</li>
          <li>Respond to inquiries and provide customer support</li>
          <li>Analyze usage trends to improve and personalize the Service</li>
          <li>Detect, investigate, and prevent fraudulent or unauthorized activity</li>
          <li>Comply with legal obligations</li>
        </ul>
      </>
    ),
  },
  {
    id: 'cookies',
    title: '4. Cookies and Tracking Technologies',
    content: (
      <>
        <p>
          We use cookies, web beacons, pixels, and similar tracking technologies to operate the Service
          and understand how you use it. Cookies are small data files stored on your browser or device.
        </p>
        <p className="font-medium text-slate-800 mt-4">Types of Cookies We Use</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>Strictly Necessary:</strong> Essential for the Service to function (session
            management, authentication).
          </li>
          <li>
            <strong>Performance:</strong> Help us understand how visitors interact with the Service
            (analytics).
          </li>
          <li>
            <strong>Functional:</strong> Remember your preferences (language, theme, saved filters).
          </li>
          <li>
            <strong>Targeting:</strong> Used to deliver relevant advertising (only where applicable and
            with consent).
          </li>
        </ul>
        <p className="mt-3">
          You can control cookie settings through your browser. Note that disabling certain cookies may
          affect Service functionality.
        </p>
      </>
    ),
  },
  {
    id: 'third-party',
    title: '5. Third-Party Services',
    content: (
      <>
        <p>
          The Service integrates with third-party services to provide certain features. These providers
          have their own privacy policies governing their use of your data:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>Authentication:</strong> NextAuth.js (session management)
          </li>
          <li>
            <strong>Database:</strong> Supabase (PostgreSQL hosting)
          </li>
          <li>
            <strong>AI Services:</strong> OpenAI (travel recommendations and itinerary generation)
          </li>
          <li>
            <strong>Real-Time Features:</strong> Pusher (live collaboration)
          </li>
          <li>
            <strong>Analytics:</strong> Vercel Analytics
          </li>
          <li>
            <strong>Email:</strong> Resend (transactional email delivery)
          </li>
          <li>
            <strong>Travel Data:</strong> Third-party flight, hotel, and activity APIs
          </li>
        </ul>
        <p className="mt-3">
          We are not responsible for the privacy practices of these third parties and encourage you to
          review their policies.
        </p>
      </>
    ),
  },
  {
    id: 'data-sharing',
    title: '6. How We Share Your Information',
    content: (
      <>
        <p>We do not sell your personal information. We may share your information:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>With your group members:</strong> Trip details, preferences, and activity data you
            add to shared trips are visible to other members of that trip.
          </li>
          <li>
            <strong>With service providers:</strong> Vendors who assist us in operating the Service
            (subject to confidentiality obligations).
          </li>
          <li>
            <strong>For legal reasons:</strong> When required by law, regulation, legal process, or
            governmental request.
          </li>
          <li>
            <strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of
            assets, with appropriate notice to you.
          </li>
          <li>
            <strong>With your consent:</strong> In other circumstances where you have given explicit
            consent.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-retention',
    title: '7. Data Retention',
    content: (
      <p>
        We retain your personal information for as long as your account is active or as necessary to
        provide the Service, comply with legal obligations, resolve disputes, and enforce our agreements.
        When you delete your account, we will delete or anonymize your personal information within 30
        days, except where retention is required by law. Trip data shared with other group members may
        remain visible to those members after you leave the trip or close your account.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: '8. Your Privacy Rights',
    content: (
      <>
        <p>
          Depending on your location, you may have certain rights regarding your personal information:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>Access:</strong> Request a copy of the personal data we hold about you.
          </li>
          <li>
            <strong>Correction:</strong> Request correction of inaccurate or incomplete data.
          </li>
          <li>
            <strong>Deletion:</strong> Request deletion of your personal data (&quot;right to be
            forgotten&quot;).
          </li>
          <li>
            <strong>Portability:</strong> Request your data in a structured, machine-readable format.
          </li>
          <li>
            <strong>Opt-Out:</strong> Unsubscribe from marketing emails at any time via the unsubscribe
            link in any email.
          </li>
          <li>
            <strong>Restriction:</strong> Request that we restrict processing of your data in certain
            circumstances.
          </li>
        </ul>
        <p className="mt-3">
          To exercise any of these rights, please contact us at{' '}
          <a
            href="mailto:privacy@outthegroupchat.com"
            className="text-emerald-600 hover:text-emerald-700 underline"
          >
            privacy@outthegroupchat.com
          </a>
          . We will respond within 30 days.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: '9. Security',
    content: (
      <p>
        We implement industry-standard technical and organizational measures to protect your personal
        information against unauthorized access, alteration, disclosure, or destruction. These measures
        include encryption in transit (TLS), hashed passwords (bcrypt), and access controls. However,
        no method of transmission over the internet or electronic storage is 100% secure. While we
        strive to use commercially acceptable means to protect your information, we cannot guarantee
        absolute security.
      </p>
    ),
  },
  {
    id: 'childrens-privacy',
    title: "10. Children's Privacy",
    content: (
      <p>
        The Service is not directed to individuals under the age of 13. We do not knowingly collect
        personal information from children under 13. If you become aware that a child under 13 has
        provided us with personal information, please contact us immediately at{' '}
        <a
          href="mailto:privacy@outthegroupchat.com"
          className="text-emerald-600 hover:text-emerald-700 underline"
        >
          privacy@outthegroupchat.com
        </a>{' '}
        so that we can take appropriate action.
      </p>
    ),
  },
  {
    id: 'changes',
    title: '11. Changes to This Policy',
    content: (
      <p>
        We may update this Privacy Policy from time to time. We will notify you of material changes by
        posting the new policy on this page and updating the &quot;Last Updated&quot; date. For
        significant changes, we may also notify you via email or a prominent notice within the Service.
        Your continued use of the Service after any changes constitutes acceptance of the updated policy.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '12. Contact Us',
    content: (
      <>
        <p>
          If you have questions, concerns, or requests regarding this Privacy Policy or our data
          practices, please contact us:
        </p>
        <div className="mt-3 space-y-1">
          <p>
            <strong>OutTheGroupchat</strong>
          </p>
          <p>
            Email:{' '}
            <a
              href="mailto:privacy@outthegroupchat.com"
              className="text-emerald-600 hover:text-emerald-700 underline"
            >
              privacy@outthegroupchat.com
            </a>
          </p>
        </div>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 mb-6 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">Last Updated: {LAST_UPDATED}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Table of Contents */}
          <div className="bg-slate-50 border-b border-slate-200 px-8 py-6">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Contents
            </h2>
            <nav>
              <ol className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          {/* Sections */}
          <div className="px-8 py-8 space-y-10 text-slate-700 leading-relaxed">
            {sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2 className="text-xl font-semibold text-slate-900 mb-3">{section.title}</h2>
                <div className="text-sm leading-relaxed">{section.content}</div>
              </section>
            ))}
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
          <Link href="/terms" className="hover:text-emerald-600 transition-colors">
            Terms of Service
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/" className="hover:text-emerald-600 transition-colors">
            Return to OutTheGroupchat
          </Link>
          <span aria-hidden="true">&middot;</span>
          <a
            href="mailto:privacy@outthegroupchat.com"
            className="hover:text-emerald-600 transition-colors"
          >
            Contact Us
          </a>
        </div>
      </div>
    </div>
  );
}
