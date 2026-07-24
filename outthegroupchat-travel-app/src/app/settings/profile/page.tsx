import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProfileSettingsForm } from './ProfileSettingsForm';

export const metadata: Metadata = {
  title: 'Profile Settings — OutTheGroupchat',
  description: 'Update your photo, display name, bio, and home city.',
};

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, bio: true, city: true, image: true },
  });

  if (!user) {
    redirect('/auth/signin');
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
          <p className="mt-1 text-gray-500">
            Update the photo and details other people see on your profile.
          </p>
        </div>

        <ProfileSettingsForm
          user={{
            name: user.name ?? '',
            email: user.email ?? '',
            bio: user.bio ?? undefined,
            city: user.city ?? undefined,
            image: user.image ?? undefined,
          }}
        />

        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <a
            href="/settings/privacy"
            className="flex items-center justify-between gap-3 text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            <span>Privacy settings</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
          <p className="mt-1 text-xs text-gray-500">
            Choose who can see your check-ins and live activity.
          </p>
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">
          Your email address is tied to your sign-in and cannot be changed here.
        </p>
      </div>
    </main>
  );
}
