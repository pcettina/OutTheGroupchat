import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';
import { z } from 'zod';

const shareSchema = z.object({
  itemId: z.string().min(1, 'itemId is required'),
  itemType: z.enum(['activity', 'trip'], { message: 'itemType must be activity or trip' }),
  platform: z.enum(['copy', 'native']).default('copy'),
  message: z.string().max(500).optional(),
});

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * POST /api/feed/share
 *
 * Records a share event for a trip or activity and returns a shareable URL.
 * Increments a share counter and optionally triggers a notification to the owner.
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

    const { itemId, itemType, platform, message } = parsed.data;
    const userId = session.user.id;

    if (itemType === 'trip') {
      const trip = await prisma.trip.findUnique({
        where: { id: itemId },
        select: { id: true, title: true, ownerId: true, isPublic: true, status: true },
      });

      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
      }

      // Check visibility: must be public or user must be a member/owner
      if (!trip.isPublic && trip.ownerId !== userId) {
        const membership = await prisma.tripMember.findUnique({
          where: { tripId_userId: { tripId: itemId, userId } },
          select: { id: true },
        });
        if (!membership) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      // Record share event via notification (notify owner when someone else shares)
      if (trip.ownerId !== userId) {
        await prisma.notification.create({
          data: {
            userId: trip.ownerId,
            type: 'TRIP_UPDATE',
            title: 'Someone shared your trip',
            message: `${session.user.name || 'Someone'} shared your trip "${trip.title}"`,
            data: {
              tripId: itemId,
              sharedBy: userId,
              platform,
              event: 'TRIP_SHARE',
            },
          },
        });
      }

      const shareUrl = `/trips/${itemId}`;

      return NextResponse.json({
        success: true,
        shareUrl,
        itemType,
        itemId,
        platform,
        message: message ?? null,
      });
    } else if (itemType === 'activity') {
      const activity = await prisma.activity.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          isPublic: true,
          trip: { select: { id: true, title: true, ownerId: true } },
        },
      });

      if (!activity) {
        return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
      }

      // Check visibility
      if (!activity.isPublic && activity.trip.ownerId !== userId) {
        const membership = await prisma.tripMember.findUnique({
          where: { tripId_userId: { tripId: activity.trip.id, userId } },
          select: { id: true },
        });
        if (!membership) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      const shareUrl = `/trips/${activity.trip.id}?activity=${itemId}`;

      return NextResponse.json({
        success: true,
        shareUrl,
        itemType,
        itemId,
        platform,
        message: message ?? null,
      });
    }

    return NextResponse.json({ error: 'Unsupported itemType' }, { status: 400 });
  } catch (error) {
    logError('FEED_SHARE_POST', error);
    return NextResponse.json(
      { error: 'Failed to process share' },
      { status: 500 }
    );
  }
}
