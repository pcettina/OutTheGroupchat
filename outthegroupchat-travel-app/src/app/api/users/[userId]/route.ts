import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';

const patchUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  image: z.string().url().optional(),
});

/**
 * GET /api/users/[userId]
 *
 * Returns the public profile of a user by ID. When the requesting user is
 * authenticated and viewing another user's profile, the response includes an
 * `isFollowing` flag. Public trips owned by the user are always included.
 * The user's email is only exposed when viewing one's own profile.
 *
 * @param req - The incoming request (used only for context; no body expected)
 * @param params.userId - The ID of the user profile to fetch
 * @returns 200 with `{ success: true, data: { ...user, isFollowing, publicTrips } }`
 * @returns 404 if no user with the given ID exists
 * @returns 500 on unexpected database errors
 */
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
    logger.error({ error }, '[USER_GET] Failed to fetch user');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/[userId]
 *
 * Toggles the follow relationship between the authenticated user and the target
 * user. If the authenticated user is not yet following the target, a follow
 * record and a FOLLOW notification are created. If they are already following,
 * the follow record is deleted (unfollow). Self-follow is rejected with 400.
 *
 * @param req - The incoming request (body is not read; action is derived from follow state)
 * @param params.userId - The ID of the target user to follow or unfollow
 * @returns 200 with `{ success: true, message: "Following"|"Unfollowed", isFollowing: boolean }`
 * @returns 400 if the authenticated user attempts to follow themselves
 * @returns 401 if the request is unauthenticated
 * @returns 404 if the target user does not exist
 * @returns 500 on unexpected database errors
 */
export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
    logger.error({ error }, '[USER_FOLLOW] Failed to follow/unfollow');
    return NextResponse.json(
      { success: false, error: 'Failed to follow/unfollow' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/[userId]
 *
 * Updates the profile of the specified user. Only the owner of the profile
 * (i.e., the authenticated user whose ID matches `userId`) may update it.
 * Accepts a partial payload validated against `patchUserSchema`. Email is
 * never returned in the response to prevent unintended exposure.
 *
 * @param req - The incoming request containing the JSON update payload
 * @param params.userId - The ID of the user whose profile should be updated
 * @returns 200 with `{ success: true, data: { id, name, image, bio, city } }`
 * @returns 400 if the request body fails Zod validation
 * @returns 401 if the request is unauthenticated
 * @returns 403 if the authenticated user is not the profile owner
 * @returns 500 on unexpected database errors
 */
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = params;

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body: unknown = await req.json();
    const parsed = patchUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, bio, city, image } = parsed.data;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(city !== undefined && { city }),
        ...(image !== undefined && { image }),
      },
      select: {
        id: true,
        name: true,
        email: false,
        image: true,
        bio: true,
        city: true,
      },
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error) {
    logger.error({ error }, '[USER_PATCH] Failed to update user');
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

