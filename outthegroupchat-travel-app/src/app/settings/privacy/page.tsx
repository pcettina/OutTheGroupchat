import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PrivacySettingsForm } from './PrivacySettingsForm';

export const metadata: Metadata = {
  title: 'Privacy Settings — OutTheGroupchat',
  description: 'Control who can see your check-ins and live activity.',
};

type Visibility = 'PUBLIC' | 'CREW' | 'PRIVATE';

function parseVisibility(raw: unknown): Visibility {
  if (raw === 'PUBLIC' || raw === 'CREW' || raw === 'PRIVATE') return raw;
  return 'CREW';
}

export default async function PrivacySettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferences: true },
  });

  const prefs =
    user?.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
      ? (user.preferences as Record<string, unknown>)
      : {};

  const initialVisibility = parseVisibility(prefs.checkInVisibility);

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Privacy Settings</h1>
          <p className="mt-1 text-gray-500">
            Choose who can see your check-ins when you&apos;re out.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Default check-in visibility
          </h2>
          <PrivacySettingsForm initialVisibility={initialVisibility} />
        </div>

        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <a
            href="/settings/privacy/relationships"
            className="flex items-center justify-between gap-3 text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            <span>Manage who sees your location</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
          <p className="mt-1 text-xs text-gray-500">
            Set precision and name visibility per Crew member.
          </p>
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">
          You can also override this on a per-check-in basis when checking in.
        </p>
      </div>
    </main>
  );
}
