import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// Get user profile
export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: session?.user?.id === userId ? true : false,
        image: true,
        bio: true,
        city: true,
        preferences: true,
        createdAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
            ownedTrips: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if current user follows this user
    let isFollowing = false;
    if (session?.user?.id && session.user.id !== userId) {
      const follow = await prisma.follow.findFirst({
        where: {
          followerId: session.user.id,
          followingId: userId,
        },
      });
      isFollowing = !!follow;
    }

    // Get public trips
    const publicTrips = await prisma.trip.findMany({
      where: {
        ownerId: userId,
        isPublic: true,
      },
      select: {
        id: true,
        title: true,
        destination: true,
        startDate: true,
        endDate: true,
        status: true,
        _count: {
          select: {
            members: true,
            activities: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        isFollowing,
        publicTrips,
      },
    });
  } catch (error) {
    console.error('[USER_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// Follow/unfollow user
export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.id === userId) {
      return NextResponse.json(
        { success: false, error: 'Cannot follow yourself' },
        { status: 400 }
      );
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if already following
    const existingFollow = await prisma.follow.findFirst({
      where: {
        followerId: session.user.id,
        followingId: userId,
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({
        where: { id: existingFollow.id },
      });

      return NextResponse.json({
        success: true,
        message: 'Unfollowed',
        isFollowing: false,
      });
    } else {
      // Follow
      await prisma.follow.create({
        data: {
          followerId: session.user.id,
          followingId: userId,
        },
      });

      // Notify user
      await prisma.notification.create({
        data: {
          userId,
          type: 'FOLLOW',
          title: 'New Follower',
          message: 'Someone started following you!',
          data: { followerId: session.user.id },
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Following',
        isFollowing: true,
      });
    }
  } catch (error) {
    console.error('[USER_FOLLOW]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to follow/unfollow' },
      { status: 500 }
    );
  }
}

