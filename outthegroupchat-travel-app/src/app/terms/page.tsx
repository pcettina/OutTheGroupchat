// PLACEHOLDER — These Terms of Service were drafted as a professional placeholder.
// Legal team must review and finalize before public launch.
// Contact: legal@outthegroupchat.com

import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — OutTheGroupchat',
  description: 'Read the Terms of Service governing your use of the OutTheGroupchat travel planning platform.',
};

const LAST_UPDATED = 'March 31, 2026';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const sections: Section[] = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: (
      <>
        <p>
          By accessing or using the OutTheGroupchat platform, website, and related services
          (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of Service
          (&quot;Terms&quot;). Please read them carefully. If you do not agree to these Terms, you may
          not access or use the Service.
        </p>
        <p className="mt-3">
          These Terms constitute a legally binding agreement between you and OutTheGroupchat
          (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). We reserve the
          right to update these Terms at any time. Continued use of the Service after changes are posted
          constitutes your acceptance of the revised Terms.
        </p>
      </>
    ),
  },
  {
    id: 'account-registration',
    title: '2. Account Registration',
    content: (
      <>
        <p>
          To access certain features of the Service, you must create an account. When registering, you
          agree to:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Provide accurate, current, and complete information</li>
          <li>Maintain and promptly update your account information</li>
          <li>Keep your password confidential and not share it with any third party</li>
          <li>Notify us immediately of any unauthorized use of your account</li>
          <li>Accept responsibility for all activity that occurs under your account</li>
        </ul>
        <p className="mt-3">
          You must be at least 13 years of age to create an account. By registering, you represent and
          warrant that you meet this age requirement. We reserve the right to suspend or terminate
          accounts that provide false or misleading information.
        </p>
      </>
    ),
  },
  {
    id: 'user-content',
    title: '3. User Content',
    content: (
      <>
        <p>
          The Service allows you to create, submit, post, and share content including trip plans,
          activity preferences, messages, photos, and other materials (&quot;User Content&quot;). You
          retain ownership of your User Content.
        </p>
        <p className="mt-3">
          By submitting User Content to the Service, you grant OutTheGroupchat a worldwide,
          non-exclusive, royalty-free license to use, reproduce, modify, adapt, publish, and display
          such User Content solely for the purpose of operating and providing the Service.
        </p>
        <p className="font-medium text-slate-800 mt-4">You represent and warrant that:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>You own or have the necessary rights to submit the User Content</li>
          <li>Your User Content does not infringe any third-party intellectual property rights</li>
          <li>Your User Content does not violate any applicable law or regulation</li>
          <li>
            Your User Content does not contain malicious code, viruses, or harmful components
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'prohibited-uses',
    title: '4. Prohibited Uses',
    content: (
      <>
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Violate any applicable local, state, national, or international law or regulation</li>
          <li>
            Transmit unsolicited or unauthorized advertising, spam, or promotional material
          </li>
          <li>
            Impersonate any person or entity or misrepresent your affiliation with any person or entity
          </li>
          <li>
            Collect or harvest personal information about other users without their consent
          </li>
          <li>
            Engage in any conduct that restricts or inhibits anyone&apos;s use or enjoyment of the
            Service
          </li>
          <li>
            Attempt to gain unauthorized access to any portion of the Service or any other systems
            connected to it
          </li>
          <li>
            Use automated means (bots, scrapers, crawlers) to access the Service without our prior
            written consent
          </li>
          <li>
            Upload or transmit content that is defamatory, obscene, hateful, or otherwise
            objectionable
          </li>
          <li>
            Interfere with or disrupt the integrity or performance of the Service or its underlying
            infrastructure
          </li>
          <li>
            Reverse engineer, decompile, or disassemble any portion of the Service
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'group-features',
    title: '5. Group Trip Features',
    content: (
      <>
        <p>
          OutTheGroupchat provides collaborative tools that allow multiple users to plan trips together.
          When participating in group trips, you acknowledge that:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            Information you submit to a shared trip (preferences, budget, activity votes) will be
            visible to other group members
          </li>
          <li>
            Trip organizers may have elevated permissions to manage trip settings and membership
          </li>
          <li>
            Removing yourself from a trip does not automatically delete data you previously contributed
          </li>
          <li>
            We are not responsible for disputes between group members regarding trip planning decisions
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'ai-features',
    title: '6. AI-Powered Features',
    content: (
      <>
        <p>
          The Service uses artificial intelligence to provide travel recommendations, itinerary
          suggestions, and other features. You acknowledge that:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            AI-generated recommendations are provided for informational purposes only and do not
            constitute professional travel advice
          </li>
          <li>
            We do not guarantee the accuracy, completeness, or suitability of AI-generated content
          </li>
          <li>
            You should independently verify travel information including visa requirements, safety
            conditions, and booking availability before making travel arrangements
          </li>
          <li>
            We are not responsible for any decisions made based on AI-generated recommendations
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    title: '7. Intellectual Property',
    content: (
      <>
        <p>
          The Service and its original content (excluding User Content), features, and functionality
          are and will remain the exclusive property of OutTheGroupchat and its licensors. The Service
          is protected by copyright, trademark, and other laws of the United States and foreign
          countries.
        </p>
        <p className="mt-3">
          The OutTheGroupchat name, logo, and related marks are trademarks of OutTheGroupchat. You may
          not use these marks without our prior written permission. Nothing in these Terms grants you
          any right to use our trademarks, service marks, or logos.
        </p>
      </>
    ),
  },
  {
    id: 'third-party-links',
    title: '8. Third-Party Links and Services',
    content: (
      <p>
        The Service may contain links to third-party websites, services, and resources that are not
        owned or controlled by OutTheGroupchat. We have no control over and assume no responsibility
        for the content, privacy policies, or practices of any third-party websites or services. We
        strongly advise you to review the terms and privacy policy of any third-party site you visit.
        Inclusion of a link does not imply our endorsement or recommendation of the linked site.
      </p>
    ),
  },
  {
    id: 'disclaimers',
    title: '9. Disclaimers',
    content: (
      <>
        <p>
          THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT
          WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
        </p>
        <p className="mt-3">
          We do not warrant that: (a) the Service will be uninterrupted or error-free; (b) defects will
          be corrected; (c) the Service or servers are free of viruses or harmful components; or (d) the
          Service will meet your specific requirements.
        </p>
        <p className="mt-3">
          Travel planning involves inherent risks. OutTheGroupchat is a planning and coordination tool
          and is not a travel agency. We do not book travel on your behalf and are not responsible for
          the acts or omissions of airlines, hotels, tour operators, or other travel suppliers.
        </p>
      </>
    ),
  },
  {
    id: 'limitation-of-liability',
    title: '10. Limitation of Liability',
    content: (
      <>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, OUTTHEGROUPCHAT AND ITS OFFICERS,
          DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA,
          GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING FROM:
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Your use of or inability to use the Service</li>
          <li>Any unauthorized access to or use of our servers and any personal information stored therein</li>
          <li>Any interruption or cessation of transmission to or from the Service</li>
          <li>
            Any bugs, viruses, or other harmful code transmitted through the Service by any third party
          </li>
          <li>Any errors or omissions in any content or for any loss or damage incurred as a result</li>
        </ul>
        <p className="mt-3">
          In no event shall our aggregate liability to you exceed the greater of (a) the amount you paid
          us in the twelve months preceding the claim, or (b) one hundred US dollars ($100).
        </p>
      </>
    ),
  },
  {
    id: 'indemnification',
    title: '11. Indemnification',
    content: (
      <p>
        You agree to defend, indemnify, and hold harmless OutTheGroupchat and its licensors, officers,
        directors, employees, contractors, agents, and successors from and against any claims,
        liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable
        attorneys&apos; fees) arising out of or relating to your violation of these Terms or your use
        of the Service, including but not limited to your User Content, any use of the Service&apos;s
        content other than as expressly authorized, or your use of any information obtained from the
        Service.
      </p>
    ),
  },
  {
    id: 'governing-law',
    title: '12. Governing Law and Dispute Resolution',
    content: (
      <>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the State of
          Delaware, United States, without regard to its conflict of law provisions. You agree that any
          dispute arising from or relating to the subject matter of these Terms shall be governed by the
          exclusive jurisdiction and venue of the state and federal courts located in Delaware.
        </p>
        <p className="mt-3">
          Before initiating any formal legal proceeding, you agree to first contact us at{' '}
          <a
            href="mailto:legal@outthegroupchat.com"
            className="text-emerald-600 hover:text-emerald-700 underline"
          >
            legal@outthegroupchat.com
          </a>{' '}
          and attempt to resolve the dispute informally for at least 30 days.
        </p>
      </>
    ),
  },
  {
    id: 'termination',
    title: '13. Termination',
    content: (
      <>
        <p>
          We may terminate or suspend your account and access to the Service immediately, without prior
          notice or liability, for any reason, including if you breach these Terms. Upon termination,
          your right to use the Service will cease immediately.
        </p>
        <p className="mt-3">
          You may terminate your account at any time by contacting us or using the account deletion
          feature in your settings. All provisions of these Terms which by their nature should survive
          termination shall survive, including ownership provisions, warranty disclaimers, indemnity,
          and limitations of liability.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '14. Changes to Terms',
    content: (
      <p>
        We reserve the right to modify these Terms at any time. We will provide notice of material
        changes by updating the &quot;Last Updated&quot; date at the top of this page and, where
        appropriate, by sending you an email notification. Your continued use of the Service after the
        effective date of any changes constitutes your acceptance of the revised Terms. If you do not
        agree to the new Terms, you must stop using the Service.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '15. Contact Us',
    content: (
      <>
        <p>
          If you have questions about these Terms of Service, please contact us:
        </p>
        <div className="mt-3 space-y-1">
          <p>
            <strong>OutTheGroupchat</strong>
          </p>
          <p>
            General inquiries:{' '}
            <a
              href="mailto:legal@outthegroupchat.com"
              className="text-emerald-600 hover:text-emerald-700 underline"
            >
              legal@outthegroupchat.com
            </a>
          </p>
          <p>
            Privacy matters:{' '}
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

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
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
          <Link href="/privacy" className="hover:text-emerald-600 transition-colors">
            Privacy Policy
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/" className="hover:text-emerald-600 transition-colors">
            Return to OutTheGroupchat
          </Link>
          <span aria-hidden="true">&middot;</span>
          <a
            href="mailto:legal@outthegroupchat.com"
            className="hover:text-emerald-600 transition-colors"
          >
            Contact Us
          </a>
        </div>
      </div>
    </div>
  );
}
