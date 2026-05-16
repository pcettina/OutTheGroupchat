import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import NearbyCrewList from '@/components/checkins/NearbyCrewList';
import CheckInButton from '@/components/checkins/CheckInButton';

export const metadata: Metadata = {
  title: 'Check-ins | OutTheGroupchat',
  description: "See where your Crew is at right now",
};

/**
 * Fetches the cityId from the user's most recent active check-in.
 * Returns undefined if the user has no active check-in with a city set.
 */
async function getUserCityId(userId: string): Promise<string | undefined> {
  const recentCheckIn = await prisma.checkIn.findFirst({
    where: {
      userId,
      cityId: { not: null },
      activeUntil: { gt: new Date() },
    },
    select: { cityId: true },
    orderBy: { createdAt: 'desc' },
  });
  return recentCheckIn?.cityId ?? undefined;
}

export default async function CheckInsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  const cityId = await getUserCityId(session.user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
          Who&apos;s Out Tonight?
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          See where your Crew is at right now
        </p>
      </div>

      <CheckInButton className="mb-6" />

      <hr className="border-slate-200 dark:border-slate-700 mb-6" />

      <NearbyCrewList cityId={cityId} />
    </div>
  );
}
