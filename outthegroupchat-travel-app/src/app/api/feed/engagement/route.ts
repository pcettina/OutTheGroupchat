import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';

// Handle likes/unlikes for feed items
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { itemId, itemType, action } = body;

    if (!itemId || !itemType || !['like', 'unlike'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const userId = session.user.id;

    if (itemType === 'activity') {
      // Use SavedActivity as the like mechanism for activities
      if (action === 'like') {
        await prisma.savedActivity.upsert({
          where: {
            userId_activityId: {
              userId,
              activityId: itemId,
            },
          },
          update: {},
          create: {
            userId,
            activityId: itemId,
          },
        });
      } else {
        await prisma.savedActivity.deleteMany({
          where: {
            userId,
            activityId: itemId,
          },
        });
      }

      // Get updated count
      const count = await prisma.savedActivity.count({
        where: { activityId: itemId },
      });

      return NextResponse.json({
        success: true,
        action,
        itemType,
        itemId,
        likeCount: count,
      });
    } else if (itemType === 'trip') {
      // Use TripLike model for proper like tracking
      const trip = await prisma.trip.findUnique({
        where: { id: itemId },
        select: { id: true, ownerId: true, title: true },
      });

      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
      }

      if (action === 'like') {
        await prisma.tripLike.upsert({
          where: {
            userId_tripId: {
              userId,
              tripId: itemId,
            },
          },
          update: {},
          create: {
            userId,
            tripId: itemId,
          },
        });

        // Create notification for trip owner (if not liking own trip)
        if (trip.ownerId !== userId) {
          await prisma.notification.create({
            data: {
              userId: trip.ownerId,
              type: 'TRIP_LIKE',
              title: 'New Like',
              message: `${session.user.name || 'Someone'} liked your trip "${trip.title}"`,
              data: {
                tripId: itemId,
                likerId: userId,
              },
            },
          });
        }
      } else {
        await prisma.tripLike.deleteMany({
          where: {
            userId,
            tripId: itemId,
          },
        });
      }

      // Get updated count
      const count = await prisma.tripLike.count({
        where: { tripId: itemId },
      });

      return NextResponse.json({
        success: true,
        action,
        itemType,
        itemId,
        likeCount: count,
      });
    }

    return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
  } catch (error) {
    logError('ENGAGEMENT_POST', error);
    return NextResponse.json(
      { error: 'Failed to update engagement' },
      { status: 500 }
    );
  }
}

// Get engagement stats for items
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');
    const itemType = searchParams.get('itemType');

    if (!itemId || !itemType) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (itemType === 'activity') {
      const [likeCount, commentCount, isLiked] = await Promise.all([
        prisma.savedActivity.count({
          where: { activityId: itemId },
        }),
        prisma.activityComment.count({
          where: { activityId: itemId },
        }),
        session?.user?.id
          ? prisma.savedActivity.findUnique({
              where: {
                userId_activityId: {
                  userId: session.user.id,
                  activityId: itemId,
                },
              },
            })
          : null,
      ]);

      return NextResponse.json({
        success: true,
        itemId,
        itemType,
        likeCount,
        commentCount,
        isLiked: !!isLiked,
      });
    } else if (itemType === 'trip') {
      const [likeCount, commentCount, isLiked] = await Promise.all([
        prisma.tripLike.count({
          where: { tripId: itemId },
        }),
        prisma.tripComment.count({
          where: { tripId: itemId },
        }),
        session?.user?.id
          ? prisma.tripLike.findUnique({
              where: {
                userId_tripId: {
                  userId: session.user.id,
                  tripId: itemId,
                },
              },
            })
          : null,
      ]);

      return NextResponse.json({
        success: true,
        itemId,
        itemType,
        likeCount,
        commentCount,
        isLiked: !!isLiked,
      });
    }

    return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
  } catch (error) {
    logError('ENGAGEMENT_GET', error);
    return NextResponse.json(
      { error: 'Failed to get engagement' },
      { status: 500 }
    );
  }
}

