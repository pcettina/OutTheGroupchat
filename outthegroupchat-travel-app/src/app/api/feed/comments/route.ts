import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logError } from '@/lib/logger';

// Get comments for an item (activity or trip)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');
    const itemType = searchParams.get('itemType');

    if (!itemId || !itemType) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    let comments;

    if (itemType === 'activity') {
      comments = await prisma.activityComment.findMany({
        where: { activityId: itemId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } else if (itemType === 'trip') {
      comments = await prisma.tripComment.findMany({
        where: { tripId: itemId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } else {
      return NextResponse.json({ comments: [] });
    }

    // Transform to match the frontend interface
    const formattedComments = comments.map((comment) => ({
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
      user: comment.user,
      replies: [], // Flat structure for now, can add nesting later
    }));

    return NextResponse.json({
      success: true,
      comments: formattedComments,
    });
  } catch (error) {
    logError('COMMENTS_GET', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// Post a new comment
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { itemId, itemType, text, parentId } = body;

    if (!itemId || !itemType || !text?.trim()) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    let comment;
    let notificationData: { ownerId: string; title: string } | null = null;

    if (itemType === 'activity') {
      // Check if activity exists
      const activity = await prisma.activity.findUnique({
        where: { id: itemId },
        include: {
          trip: {
            select: {
              ownerId: true,
              title: true,
            },
          },
        },
      });

      if (!activity) {
        return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
      }

      // Create the comment
      comment = await prisma.activityComment.create({
        data: {
          activityId: itemId,
          userId: session.user.id,
          text: text.trim(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      // Set notification data
      if (activity.trip.ownerId !== session.user.id) {
        notificationData = {
          ownerId: activity.trip.ownerId,
          title: activity.trip.title,
        };
        
        await prisma.notification.create({
          data: {
            userId: notificationData.ownerId,
            type: 'ACTIVITY_COMMENT',
            title: 'New Comment',
            message: `${session.user.name || 'Someone'} commented on an activity in "${notificationData.title}"`,
            data: {
              activityId: itemId,
              commentId: comment.id,
              tripId: activity.tripId,
            },
          },
        });
      }
    } else if (itemType === 'trip') {
      // Check if trip exists
      const trip = await prisma.trip.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          ownerId: true,
          title: true,
        },
      });

      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
      }

      // Create the trip comment
      comment = await prisma.tripComment.create({
        data: {
          tripId: itemId,
          userId: session.user.id,
          text: text.trim(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      // Create notification for trip owner
      if (trip.ownerId !== session.user.id) {
        await prisma.notification.create({
          data: {
            userId: trip.ownerId,
            type: 'TRIP_COMMENT',
            title: 'New Comment',
            message: `${session.user.name || 'Someone'} commented on your trip "${trip.title}"`,
            data: {
              tripId: itemId,
              commentId: comment.id,
            },
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: 'Comments only supported for activities and trips' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        user: comment.user,
        replies: [],
      },
    });
  } catch (error) {
    logError('COMMENTS_POST', error);
    return NextResponse.json(
      { error: 'Failed to post comment' },
      { status: 500 }
    );
  }
}

// Delete a comment
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get('commentId');
    const itemType = searchParams.get('itemType') || 'activity';

    if (!commentId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (itemType === 'trip') {
      // Check if trip comment exists and belongs to user
      const comment = await prisma.tripComment.findUnique({
        where: { id: commentId },
        select: { userId: true },
      });

      if (!comment) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
      }

      if (comment.userId !== session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      await prisma.tripComment.delete({
        where: { id: commentId },
      });
    } else {
      // Check if activity comment exists and belongs to user
      const comment = await prisma.activityComment.findUnique({
        where: { id: commentId },
        select: { userId: true },
      });

      if (!comment) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
      }

      if (comment.userId !== session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      await prisma.activityComment.delete({
        where: { id: commentId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('COMMENTS_DELETE', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}

