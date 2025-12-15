import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// Get comments for an item
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');
    const itemType = searchParams.get('itemType');

    if (!itemId || !itemType) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (itemType !== 'activity') {
      // For now, only activities have comments in the schema
      return NextResponse.json({ comments: [] });
    }

    const comments = await prisma.activityComment.findMany({
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
    console.error('[COMMENTS_GET]', error);
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

    if (itemType !== 'activity') {
      return NextResponse.json(
        { error: 'Comments only supported for activities' },
        { status: 400 }
      );
    }

    // Check if activity exists
    const activity = await prisma.activity.findUnique({
      where: { id: itemId },
      select: { id: true, tripId: true },
    });

    if (!activity) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    // Create the comment
    const comment = await prisma.activityComment.create({
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

    // Create notification for activity owner
    const activityWithTrip = await prisma.activity.findUnique({
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

    if (activityWithTrip && activityWithTrip.trip.ownerId !== session.user.id) {
      await prisma.notification.create({
        data: {
          userId: activityWithTrip.trip.ownerId,
          type: 'ACTIVITY_COMMENT',
          title: 'New Comment',
          message: `${session.user.name || 'Someone'} commented on an activity in "${activityWithTrip.trip.title}"`,
          data: {
            activityId: itemId,
            commentId: comment.id,
            tripId: activityWithTrip.tripId,
          },
        },
      });
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
    console.error('[COMMENTS_POST]', error);
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

    if (!commentId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Check if comment exists and belongs to user
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[COMMENTS_DELETE]', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}

