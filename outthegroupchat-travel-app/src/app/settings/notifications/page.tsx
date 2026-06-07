import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { NotificationPreferencesForm } from '@/components/settings/NotificationPreferencesForm';

export const metadata: Metadata = {
  title: 'Notification Settings — OutTheGroupchat',
  description: 'Choose when OutTheGroupchat reaches out about your plans and your Crew.',
};

export default async function NotificationSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
          <p className="mt-1 text-gray-500">
            Decide when we nudge you about your plans and what your Crew is up to.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Notification preferences
          </h2>
          <NotificationPreferencesForm />
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">
          We’ll only reach out for the triggers you turn on here.
        </p>
      </div>
    </main>
  );
}
