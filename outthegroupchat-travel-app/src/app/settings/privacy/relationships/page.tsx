import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { RelationshipSettingsList } from '@/components/privacy/RelationshipSettingsList';

export const metadata: Metadata = {
  title: 'Who sees your location',
};

export default async function RelationshipPrivacyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Who sees your location</h1>
          <p className="mt-1 text-gray-500">
            Fine-tune how precisely each Crew member sees you, and whether your name is shown.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <RelationshipSettingsList />
        </div>
      </div>
    </main>
  );
}
