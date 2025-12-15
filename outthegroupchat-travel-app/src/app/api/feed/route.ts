import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

// Feed item types for different activities
type FeedItemType = 
  | 'trip_created'
  | 'trip_completed'
  | 'activity_added'
  | 'member_joined'
  | 'review_posted'
  | 'trip_in_progress';

interface FeedItem {
  id: string;
  type: FeedItemType;
  timestamp: Date;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  trip?: {
    id: string;
    title: string;
    destination: { city: string; country: string };
    status: string;
  };
  activity?: {
    id: string;
    name: string;
    category: string;
    description: string | null;
  };
  metadata?: Record<string, unknown>;
}

// Get activity feed (public activities from followed users and popular activities)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const feedType = searchParams.get('type') || 'all'; // 'all', 'following', 'trending'

    const skip = (page - 1) * limit;

    // Get users the current user follows (if logged in)
    let followingIds: string[] = [];
    if (userId) {
      const following = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      followingIds = following.map(f => f.followingId);
    }

    const feedItems: FeedItem[] = [];

    // 1. Get recent public trips (trip_created, trip_completed, trip_in_progress)
    const tripsWhere = {
      isPublic: true,
      ...(feedType === 'following' && followingIds.length > 0
        ? { ownerId: { in: followingIds } }
        : {}),
    };

    const recentTrips = await prisma.trip.findMany({
      where: tripsWhere,
      include: {
        owner: {
          select: { id: true, name: true, image: true },
        },
        _count: { select: { members: true, activities: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit * 2, // Get more to mix with other content
    });

    for (const trip of recentTrips) {
      const destination = trip.destination as { city: string; country: string };
      
      let type: FeedItemType = 'trip_created';
      if (trip.status === 'COMPLETED') {
        type = 'trip_completed';
      } else if (trip.status === 'IN_PROGRESS') {
        type = 'trip_in_progress';
      }

      feedItems.push({
        id: `trip-${trip.id}`,
        type,
        timestamp: trip.updatedAt,
        user: trip.owner,
        trip: {
          id: trip.id,
          title: trip.title,
          destination,
          status: trip.status,
        },
        metadata: {
          memberCount: trip._count.members,
          activityCount: trip._count.activities,
        },
      });
    }

    // 2. Get recent public activities (activity_added)
    const activitiesWhere = {
      isPublic: true,
      ...(feedType === 'following' && followingIds.length > 0
        ? { trip: { ownerId: { in: followingIds } } }
        : {}),
    };

    const recentActivities = await prisma.activity.findMany({
      where: activitiesWhere,
      include: {
        trip: {
          select: {
            id: true,
            title: true,
            destination: true,
            owner: {
              select: { id: true, name: true, image: true },
            },
          },
        },
        ratings: { take: 1 },
        _count: { select: { savedBy: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    for (const activity of recentActivities) {
      const destination = activity.trip.destination as { city: string; country: string };
      
      feedItems.push({
        id: `activity-${activity.id}`,
        type: 'activity_added',
        timestamp: activity.createdAt,
        user: activity.trip.owner,
        trip: {
          id: activity.trip.id,
          title: activity.trip.title,
          destination,
          status: 'PLANNING', // Activities are added during planning
        },
        activity: {
          id: activity.id,
          name: activity.name,
          category: activity.category,
          description: activity.description,
        },
        metadata: {
          saveCount: activity._count.savedBy,
          commentCount: activity._count.comments,
        },
      });
    }

    // 3. Get recent reviews (review_posted)
    const recentReviews = await prisma.activityRating.findMany({
      where: {
        activity: {
          isPublic: true,
          ...(feedType === 'following' && followingIds.length > 0
            ? { trip: { ownerId: { in: followingIds } } }
            : {}),
        },
        review: { not: null },
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        activity: {
          include: {
            trip: {
              select: {
                id: true,
                title: true,
                destination: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit / 2,
    });

    for (const review of recentReviews) {
      const destination = review.activity.trip.destination as { city: string; country: string };
      
      feedItems.push({
        id: `review-${review.id}`,
        type: 'review_posted',
        timestamp: review.createdAt,
        user: review.user,
        trip: {
          id: review.activity.trip.id,
          title: review.activity.trip.title,
          destination,
          status: 'COMPLETED',
        },
        activity: {
          id: review.activity.id,
          name: review.activity.name,
          category: review.activity.category,
          description: review.review,
        },
        metadata: {
          rating: review.score,
        },
      });
    }

    // Sort all items by timestamp
    feedItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const paginatedItems = feedItems.slice(skip, skip + limit);

    // If user is logged in, check which activities they've saved
    let savedActivityIds: Set<string> = new Set();
    if (userId) {
      const savedActivities = await prisma.savedActivity.findMany({
        where: {
          userId,
          activityId: {
            in: paginatedItems
              .filter(item => item.activity)
              .map(item => item.activity!.id),
          },
        },
        select: { activityId: true },
      });
      savedActivityIds = new Set(savedActivities.map(s => s.activityId));
    }

    // Add isSaved flag
    const itemsWithSaved = paginatedItems.map(item => ({
      ...item,
      isSaved: item.activity ? savedActivityIds.has(item.activity.id) : false,
    }));

    return NextResponse.json({
      success: true,
      data: itemsWithSaved,
      pagination: {
        page,
        limit,
        total: feedItems.length,
        totalPages: Math.ceil(feedItems.length / limit),
        hasMore: skip + paginatedItems.length < feedItems.length,
      },
    });
  } catch (error) {
    console.error('[FEED_GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}

// Save/unsave an activity
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { activityId, action } = body;

    if (!activityId || !['save', 'unsave'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (action === 'save') {
      await prisma.savedActivity.upsert({
        where: {
          userId_activityId: {
            userId: session.user.id,
            activityId,
          },
        },
        update: {},
        create: {
          userId: session.user.id,
          activityId,
        },
      });
    } else {
      await prisma.savedActivity.deleteMany({
        where: {
          userId: session.user.id,
          activityId,
        },
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error('[FEED_POST]', error);
    return NextResponse.json(
      { error: 'Failed to save activity' },
      { status: 500 }
    );
  }
}
