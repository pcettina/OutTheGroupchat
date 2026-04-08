import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | OutTheGroupchat',
  description:
    'Read the Terms of Service for OutTheGroupchat — the group travel planning platform. Understand your rights and responsibilities as a user.',
};

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Last Updated: April 2026
          </p>
        </div>

        {/* Content card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 space-y-10">

          {/* Acceptance of Terms */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Acceptance of Terms
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              By accessing or using OutTheGroupchat (&ldquo;the Service&rdquo;), you agree to be bound by
              these Terms of Service (&ldquo;Terms&rdquo;) and our{' '}
              <Link
                href="/privacy"
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Privacy Policy
              </Link>
              . If you do not agree to these Terms, you may not access or use the Service.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              We reserve the right to update these Terms at any time. Continued use of the Service after
              changes are posted constitutes your acceptance of the revised Terms. We will notify you of
              material changes via email or an in-app notice.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Description of Service */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Description of Service
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              OutTheGroupchat is a collaborative group travel planning platform that allows users to
              create and manage trips, coordinate with travel companions, vote on activities, share
              itineraries, and receive AI-powered travel recommendations.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              We reserve the right to modify, suspend, or discontinue any part of the Service at any
              time with or without notice. We will not be liable to you or any third party for any
              modification, suspension, or discontinuation of the Service.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* User Accounts */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              User Accounts
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              To access most features of the Service, you must create an account. By creating an account,
              you agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              <li>Provide accurate, current, and complete registration information</li>
              <li>Maintain and promptly update your account information as needed</li>
              <li>
                Keep your password confidential and be responsible for all activity that occurs under
                your account
              </li>
              <li>Notify us immediately at{' '}
                <a
                  href="mailto:support@outthegroupchat.com"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  support@outthegroupchat.com
                </a>{' '}
                of any unauthorized use of your account
              </li>
              <li>Be at least 13 years of age to use the Service</li>
            </ul>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-4">
              We reserve the right to terminate accounts that violate these Terms or that have been
              inactive for an extended period.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* User Conduct */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              User Conduct
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              <li>
                Post, transmit, or share content that is unlawful, harmful, threatening, abusive,
                harassing, defamatory, or otherwise objectionable
              </li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>
                Collect or harvest personal information about other users without their consent
              </li>
              <li>
                Interfere with or disrupt the integrity or performance of the Service or its infrastructure
              </li>
              <li>Attempt to gain unauthorized access to any portion of the Service</li>
              <li>
                Use automated means (bots, scrapers, crawlers) to access or interact with the Service
                without our express written permission
              </li>
              <li>
                Upload or transmit viruses or any other malicious code
              </li>
              <li>
                Use the Service for any illegal purpose or in violation of any applicable local, state,
                national, or international law
              </li>
            </ul>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Intellectual Property
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              The Service and its original content, features, and functionality are and will remain the
              exclusive property of OutTheGroupchat and its licensors. Our trademarks, trade dress, logos,
              and service marks may not be used in connection with any product or service without our
              prior written consent.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              You retain ownership of content you create and submit to the Service (e.g., trip
              descriptions, activity notes). By submitting content, you grant us a worldwide,
              non-exclusive, royalty-free license to use, reproduce, and display that content solely for
              the purpose of operating and improving the Service.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Limitation of Liability
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties
              of any kind, either express or implied. We do not warrant that the Service will be
              uninterrupted, error-free, or free of viruses or other harmful components.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              To the fullest extent permitted by applicable law, OutTheGroupchat and its officers,
              directors, employees, and agents shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from your use of (or inability to use) the
              Service, even if we have been advised of the possibility of such damages.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              Our total liability to you for any claims arising under these Terms shall not exceed the
              greater of (a) the amount you paid us in the twelve months preceding the claim or (b)
              $100 USD.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Termination */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Termination
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We may terminate or suspend your account and access to the Service at our sole discretion,
              without prior notice, for conduct that we believe violates these Terms, is harmful to other
              users, us, third parties, or the integrity of the Service, or for any other reason.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              You may delete your account at any time from the account settings page. Upon termination,
              your right to use the Service will immediately cease. Provisions of these Terms that by
              their nature should survive termination shall survive, including intellectual property
              provisions, warranty disclaimers, and limitations of liability.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Changes to Terms */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Changes to Terms
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We reserve the right to modify these Terms at any time. When we make material changes, we
              will update the &ldquo;Last Updated&rdquo; date at the top of this page and, where appropriate,
              notify you via email or an in-app notification.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-3">
              Your continued use of the Service after any changes to these Terms constitutes your
              acceptance of the new Terms. If you do not agree to the updated Terms, you must stop using
              the Service.
            </p>
          </section>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Contact Us */}
          <section>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
              Contact Us
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              If you have questions about these Terms of Service, please contact us:
            </p>
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-medium text-slate-800 dark:text-slate-200">OutTheGroupchat</p>
              <p>
                Email:{' '}
                <a
                  href="mailto:support@outthegroupchat.com"
                  className="text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  support@outthegroupchat.com
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
