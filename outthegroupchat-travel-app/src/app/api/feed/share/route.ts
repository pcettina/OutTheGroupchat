import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { z } from 'zod';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

const shareSchema = z.object({
  itemId: z.string().min(1, 'itemId is required'),
  itemType: z.enum(['trip', 'activity'], { message: 'itemType must be trip or activity' }),
  message: z.string().max(500, 'Message must be 500 characters or fewer').optional(),
});

/**
 * POST /api/feed/share
 * Share a trip or activity to the feed.
 * Creates a feed share event tied to the authenticated user.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = shareSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { itemId, itemType, message } = parsed.data;

    if (itemType === 'trip') {
      // Verify the trip exists and user has access
      const trip = await prisma.trip.findFirst({
        where: {
          id: itemId,
          OR: [
            { isPublic: true },
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } },
          ],
        },
        select: { id: true, title: true, isPublic: true },
      });

      if (!trip) {
        return NextResponse.json(
          { error: 'Trip not found or not accessible' },
          { status: 404 }
        );
      }

      // Record share in the notification system for the trip owner
      const tripFull = await prisma.trip.findUnique({
        where: { id: itemId },
        select: { ownerId: true, title: true },
      });

      if (tripFull && tripFull.ownerId !== session.user.id) {
        await prisma.notification.create({
          data: {
            userId: tripFull.ownerId,
            type: 'SYSTEM',
            title: 'Trip shared',
            message: `${session.user.name ?? 'Someone'} shared your trip "${tripFull.title}"${message ? `: "${message}"` : ''}`,
            data: {
              sharedBy: session.user.id,
              tripId: itemId,
              message: message ?? null,
            },
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          shared: true,
          itemId,
          itemType,
          shareUrl: `/trips/${itemId}`,
        },
      });
    }

    if (itemType === 'activity') {
      // Verify the activity exists and is public
      const activity = await prisma.activity.findFirst({
        where: {
          id: itemId,
          isPublic: true,
        },
        select: { id: true, name: true },
      });

      if (!activity) {
        return NextResponse.json(
          { error: 'Activity not found or not accessible' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          shared: true,
          itemId,
          itemType,
          shareUrl: `/activities/${itemId}`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Unsupported item type' },
      { status: 400 }
    );
  } catch (error) {
    captureException(error);
    logError('FEED_SHARE_POST', error);
    return NextResponse.json(
      { success: false, error: 'Failed to share item' },
      { status: 500 }
    );
  }
}
