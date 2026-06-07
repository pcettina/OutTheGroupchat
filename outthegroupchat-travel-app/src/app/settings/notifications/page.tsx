import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { NotificationSettingsForm } from '@/components/settings/NotificationSettingsForm';

export const metadata: Metadata = {
  title: 'Notification preferences | OutTheGroupchat',
  description: 'Choose when we nudge you.',
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
          <h1 className="text-2xl font-bold text-gray-900">Notification preferences</h1>
          <p className="mt-1 text-gray-500">Choose when we nudge you.</p>
        </div>

        <NotificationSettingsForm />
      </div>
    </main>
  );
}
