import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

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
      // For trips, we increment/decrement the viewCount as a "like" proxy
      // In a real app, you'd want a dedicated TripLike model
      const trip = await prisma.trip.findUnique({
        where: { id: itemId },
        select: { viewCount: true },
      });

      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
      }

      // For now, we'll use viewCount as a like proxy
      // In production, you'd want a proper like table
      const updatedTrip = await prisma.trip.update({
        where: { id: itemId },
        data: {
          viewCount: action === 'like' 
            ? { increment: 1 } 
            : { decrement: Math.min(1, trip.viewCount) },
        },
        select: { viewCount: true },
      });

      return NextResponse.json({
        success: true,
        action,
        itemType,
        itemId,
        likeCount: updatedTrip.viewCount,
      });
    }

    return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
  } catch (error) {
    console.error('[ENGAGEMENT_POST]', error);
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
      const trip = await prisma.trip.findUnique({
        where: { id: itemId },
        select: { viewCount: true },
      });

      return NextResponse.json({
        success: true,
        itemId,
        itemType,
        likeCount: trip?.viewCount || 0,
        commentCount: 0,
        isLiked: false,
      });
    }

    return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
  } catch (error) {
    console.error('[ENGAGEMENT_GET]', error);
    return NextResponse.json(
      { error: 'Failed to get engagement' },
      { status: 500 }
    );
  }
}

