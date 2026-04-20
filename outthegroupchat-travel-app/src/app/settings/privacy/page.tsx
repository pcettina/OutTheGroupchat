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

        <p className="mt-4 text-xs text-gray-400 text-center">
          You can also override this on a per-check-in basis when checking in.
        </p>
      </div>
    </main>
  );
}
