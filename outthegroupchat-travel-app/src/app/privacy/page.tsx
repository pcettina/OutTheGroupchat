import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | OutTheGroupchat',
  description:
    'Learn how OutTheGroupchat collects, uses, and protects your personal information when you use our group travel planning platform.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
      <div className="max-w-3xl mx-auto px-4 py-16">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline mb-8"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Home
        </Link>

        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Privacy Policy
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Last Updated: April 2026
          </p>
        </div>

        {/* Content card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 space-y-10">

          {/* Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Introduction
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Welcome to OutTheGroupchat (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). We are committed to
              protecting your personal information and your right to privacy. This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you use our group travel
              planning platform, including our website and any related services (collectively, the
              &ldquo;Service&rdquo;).
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              Please read this policy carefully. If you disagree with its terms, please discontinue use
              of the Service.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Information We Collect
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              We collect information you provide directly to us and information generated automatically
              through your use of the Service.
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 mb-1">
                  Information You Provide
                </h3>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                  <li>Account registration details (name, email address, password)</li>
                  <li>Profile information (bio, city, travel preferences, profile photo)</li>
                  <li>Trip details, itineraries, and activity information you create</li>
                  <li>Messages and communications within the platform</li>
                  <li>Survey responses and votes on group decisions</li>
                  <li>Feedback, support requests, and correspondence with us</li>
                </ul>
              </div>
              <div>
                <h3 className="text-base font-medium text-slate-800 dark:text-slate-200 mb-1">
                  Information Collected Automatically
                </h3>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                  <li>Log data (IP address, browser type, pages visited, time and date)</li>
                  <li>Device information (hardware model, operating system, unique device identifiers)</li>
                  <li>Usage data (features used, clicks, search queries)</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              How We Use Your Information
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              <li>Provide, operate, and maintain the Service</li>
              <li>Create and manage your account</li>
              <li>Process and facilitate group trip planning and collaboration</li>
              <li>Send transactional emails (invitations, trip updates, notifications)</li>
              <li>Power AI-driven recommendations and itinerary suggestions</li>
              <li>Analyze usage patterns to improve our features and user experience</li>
              <li>Detect, prevent, and address fraud, abuse, or security incidents</li>
              <li>Comply with applicable laws and legal obligations</li>
              <li>Respond to your comments, questions, and support requests</li>
            </ul>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Information Sharing */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Information Sharing
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              We do not sell your personal information. We may share your information in the following
              limited circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              <li>
                <strong className="text-slate-700 dark:text-slate-200">With other trip members:</strong>{' '}
                Information you add to shared trips (name, profile photo, activities) is visible to other
                members of that trip.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Service providers:</strong>{' '}
                We work with trusted third-party vendors (e.g., Supabase for database hosting, Vercel for
                deployment, OpenAI for AI features, Pusher for real-time collaboration) who process data
                on our behalf and are bound by confidentiality obligations.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Legal requirements:</strong>{' '}
                We may disclose information if required by law, regulation, or valid legal process.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Business transfers:</strong>{' '}
                In the event of a merger, acquisition, or sale of assets, your information may be
                transferred as part of that transaction.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">With your consent:</strong>{' '}
                We may share information in other ways with your explicit consent.
              </li>
            </ul>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Data Retention
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We retain your personal information for as long as your account is active or as needed to
              provide you with the Service. If you delete your account, we will delete or anonymize your
              personal information within 30 days, except where we are required to retain it for legal,
              tax, or regulatory purposes.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              Trip data that has been shared with other users may remain visible to those users even after
              you delete your account, as it forms part of a collaborative record.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Your Rights */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Your Rights
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
              Depending on your location, you may have the following rights regarding your personal
              information:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Access:</strong> Request a copy of
                the personal data we hold about you.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Correction:</strong> Request that
                we correct inaccurate or incomplete information.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Deletion:</strong> Request that we
                delete your personal information.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Portability:</strong> Request a
                machine-readable export of your data.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Objection:</strong> Object to
                certain processing activities, including direct marketing.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Restriction:</strong> Request that
                we restrict processing of your data in certain circumstances.
              </li>
            </ul>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-4">
              To exercise any of these rights, please contact us at{' '}
              <a
                href="mailto:privacy@outthegroupchat.com"
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                privacy@outthegroupchat.com
              </a>
              .
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Cookies
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We use cookies and similar tracking technologies to maintain your session, remember your
              preferences, and analyze how the Service is used. You can control cookie settings through
              your browser, though disabling certain cookies may affect functionality.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              We use the following types of cookies:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 text-sm leading-relaxed mt-2">
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Essential cookies:</strong>{' '}
                Required for authentication and core functionality.
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Analytics cookies:</strong>{' '}
                Help us understand how users interact with the Service (e.g., Vercel Analytics).
              </li>
              <li>
                <strong className="text-slate-700 dark:text-slate-200">Preference cookies:</strong>{' '}
                Remember your settings and preferences across sessions.
              </li>
            </ul>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Security */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Security
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We implement industry-standard technical and organizational measures to protect your
              personal information against unauthorized access, disclosure, alteration, or destruction.
              These include encrypted connections (HTTPS/TLS), hashed password storage, rate limiting,
              and access controls.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              However, no method of transmission over the Internet or electronic storage is 100% secure.
              While we strive to protect your data, we cannot guarantee absolute security.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Contact Us */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Contact Us
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data
              practices, please contact us:
            </p>
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-medium text-slate-800 dark:text-slate-200">OutTheGroupchat</p>
              <p>
                Email:{' '}
                <a
                  href="mailto:privacy@outthegroupchat.com"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  privacy@outthegroupchat.com
                </a>
              </p>
            </div>
          </section>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8">
          Last Updated: April 2026 &mdash; OutTheGroupchat
        </p>
      </div>
    </div>
  );
}
