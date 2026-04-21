import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Check-in — OutTheGroupchat',
};

type Props = { params: { id: string } };

export default async function CheckInDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const callerId = session.user.id;
  const checkIn = await prisma.checkIn.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, image: true } },
      venue: { select: { id: true, name: true, city: true, category: true } },
    },
  });

  if (!checkIn) notFound();

  // Visibility gate
  if (checkIn.visibility !== 'PUBLIC' && checkIn.userId !== callerId) {
    if (checkIn.visibility === 'PRIVATE') notFound();

    // CREW — check membership
    const crewRow = await prisma.crew.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userAId: callerId, userBId: checkIn.userId },
          { userAId: checkIn.userId, userBId: callerId },
        ],
      },
    });
    if (!crewRow) notFound();
  }

  const now = new Date();
  const isActive = checkIn.activeUntil > now;
  const msLeft = checkIn.activeUntil.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
  const minutesLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)));

  const activeLabel = isActive
    ? hoursLeft > 0
      ? `Active for ~${hoursLeft}h ${minutesLeft}m`
      : `Active for ~${minutesLeft}m`
    : 'Expired';

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <Link href="/checkins" className="text-sm text-teal-600 hover:underline mb-6 inline-block">
          ← Back to check-ins
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            {checkIn.user.image ? (
              <Image
                src={checkIn.user.image}
                alt={checkIn.user.name ?? 'User'}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-lg">
                {(checkIn.user.name ?? 'U')[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-900">{checkIn.user.name ?? 'Someone'}</p>
              <p className="text-xs text-gray-400">
                {checkIn.createdAt.toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <span
              className={`ml-auto text-xs font-medium px-2 py-1 rounded-full ${
                isActive
                  ? 'bg-teal-50 text-teal-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {activeLabel}
            </span>
          </div>

          {/* Venue */}
          {checkIn.venue?.name && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Venue</p>
              <p className="font-medium text-gray-900">{checkIn.venue.name}</p>
              {checkIn.venue.city && (
                <p className="text-sm text-gray-500">{checkIn.venue.city}</p>
              )}
            </div>
          )}

          {/* Note */}
          {checkIn.note && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Note</p>
              <p className="text-gray-700">{checkIn.note}</p>
            </div>
          )}

          {/* Location placeholder */}
          {checkIn.latitude != null && checkIn.longitude != null && (
            <div className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-500">
              📍 {checkIn.latitude.toFixed(5)}, {checkIn.longitude.toFixed(5)}
            </div>
          )}

          {/* Join me CTA */}
          {isActive && checkIn.userId !== callerId && (
            <Link
              href={`/meetups/new${checkIn.venue?.name ? `?venue=${encodeURIComponent(checkIn.venue.name)}` : ''}`}
              className="block w-full text-center py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-colors"
            >
              Join me →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
