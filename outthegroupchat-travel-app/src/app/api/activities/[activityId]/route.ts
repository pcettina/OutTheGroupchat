import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { z } from 'zod';

const commentSchema = z.object({
  text: z.string().min(1).max(500),
});

const ratingSchema = z.object({
  score: z.number().min(1).max(5),
  review: z.string().optional(),
});

// Get activity details
export async function GET(
  req: Request,
  { params }: { params: { activityId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { activityId } = params;

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        trip: {
          select: {
            id: true,
            title: true,
            destination: true,
            isPublic: true,
            ownerId: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        ratings: {
          select: {
            score: true,
            review: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        _count: {
          select: {
            savedBy: true,
            comments: true,
            ratings: true,
          },
        },
      },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: 'Activity not found' },
        { status: 404 }
      );
    }

    // Check access
    if (!activity.isPublic && !activity.trip.isPublic) {
      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }

      const isMember = await prisma.tripMember.findFirst({
        where: {
          tripId: activity.trip.id,
          userId: session.user.id,
        },
      });

      if (!isMember) {
        return NextResponse.json(
          { success: false, error: 'Not authorized to view this activity' },
          { status: 403 }
        );
      }
    }

    // Calculate average rating
    const avgRating = activity.ratings.length > 0
      ? activity.ratings.reduce((sum, r) => sum + r.score, 0) / activity.ratings.length
      : null;

    // Check if user has saved/rated
    let userActions = { saved: false, rating: null as number | null };
    if (session?.user?.id) {
      const saved = await prisma.savedActivity.findFirst({
        where: { userId: session.user.id, activityId },
      });
      const rating = await prisma.activityRating.findFirst({
        where: { userId: session.user.id, activityId },
      });
      userActions = {
        saved: !!saved,
        rating: rating?.score || null,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        ...activity,
        averageRating: avgRating,
        userActions,
      },
    });
  } catch (error) {
    console.error('[ACTIVITY_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}

// Save/unsave activity
export async function POST(
  req: Request,
  { params }: { params: { activityId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { activityId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, error: 'Activity not found' },
        { status: 404 }
      );
    }

    // Check if already saved
    const existingSave = await prisma.savedActivity.findFirst({
      where: {
        userId: session.user.id,
        activityId,
      },
    });

    if (existingSave) {
      // Unsave
      await prisma.savedActivity.delete({
        where: { id: existingSave.id },
      });

      // Decrement share count
      await prisma.activity.update({
        where: { id: activityId },
        data: { shareCount: { decrement: 1 } },
      });

      return NextResponse.json({
        success: true,
        message: 'Activity unsaved',
        saved: false,
      });
    } else {
      // Save
      await prisma.savedActivity.create({
        data: {
          userId: session.user.id,
          activityId,
        },
      });

      // Increment share count
      await prisma.activity.update({
        where: { id: activityId },
        data: { shareCount: { increment: 1 } },
      });

      return NextResponse.json({
        success: true,
        message: 'Activity saved',
        saved: true,
      });
    }
  } catch (error) {
    console.error('[ACTIVITY_SAVE]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save/unsave activity' },
      { status: 500 }
    );
  }
}

// Add comment or rating
export async function PUT(
  req: Request,
  { params }: { params: { activityId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { activityId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'comment') {
      const validationResult = commentSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid comment' },
          { status: 400 }
        );
      }

      const comment = await prisma.activityComment.create({
        data: {
          activityId,
          userId: session.user.id,
          text: validationResult.data.text,
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

      return NextResponse.json({ success: true, data: comment });
    } else if (action === 'rate') {
      const validationResult = ratingSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { success: false, error: 'Invalid rating' },
          { status: 400 }
        );
      }

      const rating = await prisma.activityRating.upsert({
        where: {
          activityId_userId: {
            activityId,
            userId: session.user.id,
          },
        },
        update: {
          score: validationResult.data.score,
          review: validationResult.data.review,
        },
        create: {
          activityId,
          userId: session.user.id,
          score: validationResult.data.score,
          review: validationResult.data.review,
        },
      });

      return NextResponse.json({ success: true, data: rating });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[ACTIVITY_PUT]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process action' },
      { status: 500 }
    );
  }
}

