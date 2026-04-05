/**
 * Unit tests for the Feed Comments and Engagement API route handlers.
 *
 * Routes:
 *   /api/feed/comments   (GET, POST, DELETE)
 *   /api/feed/engagement (GET, POST)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts. This file extends those mocks with the additional
 *   Prisma models the comment/engagement handlers require: tripComment and
 *   tripLike, plus additional methods on activityComment, savedActivity,
 *   activity, trip, and notification.
 * - Handlers are called directly with minimal Request objects.
 * - Each test sets up its own mocks via mockResolvedValueOnce().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  apiRateLimiter: null,
}));

// ---------------------------------------------------------------------------
// Extend the global prisma mock with all models/methods needed by these routes.
// The spread from importOriginal() picks up setup.ts stubs, but we explicitly
// redefine every model used by comments/engagement to ensure each method is
// a fresh vi.fn() that supports mockResolvedValueOnce().
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      // activity — needs findUnique with include for the POST comments route
      activity: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      // trip — needs findUnique for comments POST and engagement POST
      trip: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      // activityComment — needs count beyond setup.ts defaults
      activityComment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      // savedActivity — needs upsert, deleteMany, count, findUnique
      savedActivity: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
      },
      // notification — needs create
      notification: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      // tripComment — not in setup.ts; added here
      tripComment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      // tripLike — not in setup.ts; added here
      tripLike: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

// Import handlers after the mock is registered.
import {
  GET as commentsGET,
  POST as commentsPOST,
  DELETE as commentsDELETE,
} from '@/app/api/feed/comments/route';
import {
  GET as engagementGET,
  POST as engagementPOST,
} from '@/app/api/feed/engagement/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaActivityComment = vi.mocked(prisma.activityComment);
const mockPrismaSavedActivity = vi.mocked(prisma.savedActivity);
const mockPrismaTripComment = vi.mocked((prisma as any).tripComment);
const mockPrismaTripLike = vi.mocked((prisma as any).tripLike);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaNotification = vi.mocked(prisma.notification);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-comment-001';
const MOCK_OTHER_USER_ID = 'user-comment-002';
const MOCK_TRIP_ID = 'trip-comment-333';
const MOCK_ACTIVITY_ID = 'activity-comment-444';
const MOCK_COMMENT_ID = 'comment-555';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Comment Tester',
    email: 'comment@example.com',
  },
  expires: '2099-01-01',
};

const MOCK_CREATED_AT = new Date('2026-03-01T10:00:00Z');

/** A minimal comment row returned by prisma.activityComment.findMany. */
const MOCK_ACTIVITY_COMMENT_ROW = {
  id: MOCK_COMMENT_ID,
  text: 'Great activity!',
  createdAt: MOCK_CREATED_AT,
  user: {
    id: MOCK_USER_ID,
    name: 'Comment Tester',
    image: null,
  },
};

/** A minimal comment row returned by prisma.tripComment.findMany. */
const MOCK_TRIP_COMMENT_ROW = {
  id: MOCK_COMMENT_ID,
  text: 'Love this trip!',
  createdAt: MOCK_CREATED_AT,
  user: {
    id: MOCK_USER_ID,
    name: 'Comment Tester',
    image: null,
  },
};

/** Build a minimal Request accepted by the App Router handlers. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const url = `http://localhost:3000${path}`;
  const method = options.method ?? 'GET';

  if (options.body !== undefined) {
    return new NextRequest(url, {
      method,
      body: JSON.stringify(options.body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new NextRequest(url, { method });
}

/** Parse the JSON body from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to avoid state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/feed/comments
// ===========================================================================
describe('GET /api/feed/comments', () => {
  it('returns 400 when itemId is missing', async () => {
    const res = await commentsGET(
      makeRequest('/api/feed/comments?itemType=activity')
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is missing', async () => {
    const res = await commentsGET(
      makeRequest('/api/feed/comments?itemId=activity-123')
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 200 with activity comments', async () => {
    mockPrismaActivityComment.findMany.mockResolvedValueOnce([
      MOCK_ACTIVITY_COMMENT_ROW,
    ] as unknown as Awaited<ReturnType<typeof prisma.activityComment.findMany>>);

    const res = await commentsGET(
      makeRequest(`/api/feed/comments?itemId=${MOCK_ACTIVITY_ID}&itemType=activity`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.comments)).toBe(true);
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].id).toBe(MOCK_COMMENT_ID);
    expect(body.comments[0].text).toBe('Great activity!');
    expect(body.comments[0].replies).toEqual([]);
    expect(body.comments[0].createdAt).toBe(MOCK_CREATED_AT.toISOString());
  });

  it('returns 200 with trip comments', async () => {
    mockPrismaTripComment.findMany.mockResolvedValueOnce([
      MOCK_TRIP_COMMENT_ROW,
    ]);

    const res = await commentsGET(
      makeRequest(`/api/feed/comments?itemId=${MOCK_TRIP_ID}&itemType=trip`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].text).toBe('Love this trip!');
  });

  it('returns 200 with empty comments array when no comments exist', async () => {
    mockPrismaActivityComment.findMany.mockResolvedValueOnce([]);

    const res = await commentsGET(
      makeRequest(`/api/feed/comments?itemId=${MOCK_ACTIVITY_ID}&itemType=activity`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.comments).toHaveLength(0);
  });

  it('returns 500 on database error', async () => {
    mockPrismaActivityComment.findMany.mockRejectedValueOnce(
      new Error('DB connection lost')
    );

    const res = await commentsGET(
      makeRequest(`/api/feed/comments?itemId=${MOCK_ACTIVITY_ID}&itemType=activity`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to fetch comments');
  });
});

// ===========================================================================
// POST /api/feed/comments
// ===========================================================================
describe('POST /api/feed/comments', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'Hello' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when itemId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemType: 'activity', text: 'Hello' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when text is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'invalid', text: 'Hello' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 404 when activity does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivity.findUnique.mockResolvedValueOnce(null);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'Hello' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Activity not found');
  });

  it('creates an activity comment and returns the comment object', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // activity.findUnique returns an activity with a trip owned by a different user
    mockPrismaActivity.findUnique.mockResolvedValueOnce({
      id: MOCK_ACTIVITY_ID,
      tripId: MOCK_TRIP_ID,
      trip: { ownerId: MOCK_OTHER_USER_ID, title: 'Tokyo Adventure' },
    } as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>);

    // activityComment.create returns the new comment
    mockPrismaActivityComment.create.mockResolvedValueOnce({
      id: MOCK_COMMENT_ID,
      text: 'Great activity!',
      createdAt: MOCK_CREATED_AT,
      user: { id: MOCK_USER_ID, name: 'Comment Tester', image: null },
    } as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>);

    // notification.create for the activity owner
    mockPrismaNotification.create.mockResolvedValueOnce({} as any);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'Great activity!' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.comment.id).toBe(MOCK_COMMENT_ID);
    expect(body.comment.text).toBe('Great activity!');
    expect(body.comment.replies).toEqual([]);
    expect(mockPrismaActivityComment.create).toHaveBeenCalledOnce();
  });

  it('does not create a notification when commenter is the trip owner (activity)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // activity is owned by MOCK_USER_ID (same as commenter)
    mockPrismaActivity.findUnique.mockResolvedValueOnce({
      id: MOCK_ACTIVITY_ID,
      tripId: MOCK_TRIP_ID,
      trip: { ownerId: MOCK_USER_ID, title: 'My Trip' },
    } as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>);

    mockPrismaActivityComment.create.mockResolvedValueOnce({
      id: MOCK_COMMENT_ID,
      text: 'Self comment',
      createdAt: MOCK_CREATED_AT,
      user: { id: MOCK_USER_ID, name: 'Comment Tester', image: null },
    } as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'Self comment' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // No notification should be created when owner comments on their own trip
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });

  it('returns 404 when trip does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_TRIP_ID, itemType: 'trip', text: 'Hello trip' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Trip not found');
  });

  it('creates a trip comment successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OTHER_USER_ID,
      title: 'Tokyo Adventure',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    mockPrismaTripComment.create.mockResolvedValueOnce({
      id: MOCK_COMMENT_ID,
      text: 'Love this trip!',
      createdAt: MOCK_CREATED_AT,
      user: { id: MOCK_USER_ID, name: 'Comment Tester', image: null },
    } as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>);

    mockPrismaNotification.create.mockResolvedValueOnce({} as any);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_TRIP_ID, itemType: 'trip', text: 'Love this trip!' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.comment.id).toBe(MOCK_COMMENT_ID);
    expect(body.comment.text).toBe('Love this trip!');
    expect(mockPrismaTripComment.create).toHaveBeenCalledOnce();
  });

  it('does not create a notification when commenter is the trip owner (trip)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
      title: 'My Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    mockPrismaTripComment.create.mockResolvedValueOnce({
      id: MOCK_COMMENT_ID,
      text: 'My own trip comment',
      createdAt: MOCK_CREATED_AT,
      user: { id: MOCK_USER_ID, name: 'Comment Tester', image: null },
    } as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>);

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_TRIP_ID, itemType: 'trip', text: 'My own trip comment' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });

  it('returns 500 on database error during activity comment creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaActivity.findUnique.mockResolvedValueOnce({
      id: MOCK_ACTIVITY_ID,
      tripId: MOCK_TRIP_ID,
      trip: { ownerId: MOCK_OTHER_USER_ID, title: 'Tokyo Adventure' },
    } as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>);

    mockPrismaActivityComment.create.mockRejectedValueOnce(new Error('DB error'));

    const res = await commentsPOST(
      makeRequest('/api/feed/comments', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'Hello' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to post comment');
  });
});

// ===========================================================================
// DELETE /api/feed/comments
// ===========================================================================
describe('DELETE /api/feed/comments', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=activity`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when commentId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await commentsDELETE(
      makeRequest('/api/feed/comments?itemType=activity', { method: 'DELETE' })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 404 when activity comment does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivityComment.findUnique.mockResolvedValueOnce(null);

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=activity`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Comment not found');
  });

  it('returns 403 when user does not own the activity comment', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivityComment.findUnique.mockResolvedValueOnce({
      userId: MOCK_OTHER_USER_ID,
    } as unknown as Awaited<ReturnType<typeof prisma.activityComment.findUnique>>);

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=activity`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized');
  });

  it('deletes an activity comment successfully when authorized', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivityComment.findUnique.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
    } as unknown as Awaited<ReturnType<typeof prisma.activityComment.findUnique>>);
    mockPrismaActivityComment.delete.mockResolvedValueOnce({} as any);

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=activity`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaActivityComment.delete).toHaveBeenCalledOnce();
    expect(mockPrismaActivityComment.delete).toHaveBeenCalledWith({
      where: { id: MOCK_COMMENT_ID },
    });
  });

  it('returns 404 when trip comment does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripComment.findUnique.mockResolvedValueOnce(null);

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=trip`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Comment not found');
  });

  it('returns 403 when user does not own the trip comment', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripComment.findUnique.mockResolvedValueOnce({
      userId: MOCK_OTHER_USER_ID,
    });

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=trip`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized');
  });

  it('deletes a trip comment successfully when authorized', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripComment.findUnique.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
    });
    mockPrismaTripComment.delete.mockResolvedValueOnce({} as any);

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=trip`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTripComment.delete).toHaveBeenCalledOnce();
    expect(mockPrismaTripComment.delete).toHaveBeenCalledWith({
      where: { id: MOCK_COMMENT_ID },
    });
  });

  it('returns 500 on database error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaActivityComment.findUnique.mockRejectedValueOnce(
      new Error('DB error')
    );

    const res = await commentsDELETE(
      makeRequest(
        `/api/feed/comments?commentId=${MOCK_COMMENT_ID}&itemType=activity`,
        { method: 'DELETE' }
      )
    );
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to delete comment');
  });
});

// ===========================================================================
// GET /api/feed/engagement
// ===========================================================================
describe('GET /api/feed/engagement', () => {
  it('returns 400 when itemId is missing', async () => {
    const res = await engagementGET(
      makeRequest('/api/feed/engagement?itemType=activity')
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is missing', async () => {
    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_ACTIVITY_ID}`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is invalid', async () => {
    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_ACTIVITY_ID}&itemType=invalid`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid item type');
  });

  it('returns 200 with activity engagement stats (unauthenticated)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    // Promise.all: [likeCount, commentCount, isLiked]
    // likeCount via savedActivity.count
    mockPrismaSavedActivity.count.mockResolvedValueOnce(5);
    // commentCount via activityComment.count
    mockPrismaActivityComment.count.mockResolvedValueOnce(3);
    // isLiked is null when unauthenticated (no findUnique call)

    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_ACTIVITY_ID}&itemType=activity`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.itemId).toBe(MOCK_ACTIVITY_ID);
    expect(body.itemType).toBe('activity');
    expect(body.likeCount).toBe(5);
    expect(body.commentCount).toBe(3);
    expect(body.isLiked).toBe(false);
  });

  it('returns 200 with activity engagement stats including isLiked (authenticated)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaSavedActivity.count.mockResolvedValueOnce(7);
    mockPrismaActivityComment.count.mockResolvedValueOnce(2);
    mockPrismaSavedActivity.findUnique.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      activityId: MOCK_ACTIVITY_ID,
    } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findUnique>>);

    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_ACTIVITY_ID}&itemType=activity`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.likeCount).toBe(7);
    expect(body.commentCount).toBe(2);
    expect(body.isLiked).toBe(true);
  });

  it('returns 200 with activity isLiked false when not liked', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaSavedActivity.count.mockResolvedValueOnce(4);
    mockPrismaActivityComment.count.mockResolvedValueOnce(1);
    // findUnique returns null meaning user has not liked this activity
    mockPrismaSavedActivity.findUnique.mockResolvedValueOnce(null);

    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_ACTIVITY_ID}&itemType=activity`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.isLiked).toBe(false);
  });

  it('returns 200 with trip engagement stats (unauthenticated)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockPrismaTripLike.count.mockResolvedValueOnce(10);
    mockPrismaTripComment.count.mockResolvedValueOnce(4);

    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_TRIP_ID}&itemType=trip`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.itemId).toBe(MOCK_TRIP_ID);
    expect(body.itemType).toBe('trip');
    expect(body.likeCount).toBe(10);
    expect(body.commentCount).toBe(4);
    expect(body.isLiked).toBe(false);
  });

  it('returns 200 with trip engagement stats including isLiked (authenticated)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripLike.count.mockResolvedValueOnce(8);
    mockPrismaTripComment.count.mockResolvedValueOnce(1);
    mockPrismaTripLike.findUnique.mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
    });

    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_TRIP_ID}&itemType=trip`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.likeCount).toBe(8);
    expect(body.commentCount).toBe(1);
    expect(body.isLiked).toBe(true);
  });

  it('returns 500 on database error for activity engagement', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    // Reject the first count call (likeCount via savedActivity.count)
    mockPrismaSavedActivity.count.mockRejectedValueOnce(new Error('DB error'));

    const res = await engagementGET(
      makeRequest(`/api/feed/engagement?itemId=${MOCK_ACTIVITY_ID}&itemType=activity`)
    );
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to get engagement');
  });
});

// ===========================================================================
// POST /api/feed/engagement
// ===========================================================================
describe('POST /api/feed/engagement', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when itemId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemType: 'activity', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when action is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'bookmark' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'venue', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('likes an activity successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaSavedActivity.upsert.mockResolvedValueOnce({} as any);
    mockPrismaSavedActivity.count.mockResolvedValueOnce(6);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('like');
    expect(body.itemType).toBe('activity');
    expect(body.itemId).toBe(MOCK_ACTIVITY_ID);
    expect(body.likeCount).toBe(6);
    expect(mockPrismaSavedActivity.upsert).toHaveBeenCalledOnce();
  });

  it('unlikes an activity successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaSavedActivity.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaSavedActivity.count.mockResolvedValueOnce(5);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'unlike' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('unlike');
    expect(body.likeCount).toBe(5);
    expect(mockPrismaSavedActivity.deleteMany).toHaveBeenCalledOnce();
  });

  it('returns 404 when trip does not exist during engagement', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Trip not found');
  });

  it('likes a trip successfully and creates notification for owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OTHER_USER_ID,
      title: 'Tokyo Adventure',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    mockPrismaTripLike.upsert.mockResolvedValueOnce({} as any);
    mockPrismaNotification.create.mockResolvedValueOnce({} as any);
    mockPrismaTripLike.count.mockResolvedValueOnce(11);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('like');
    expect(body.likeCount).toBe(11);
    expect(mockPrismaTripLike.upsert).toHaveBeenCalledOnce();
    expect(mockPrismaNotification.create).toHaveBeenCalledOnce();
  });

  it('does not create notification when user likes their own trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID,
      title: 'My Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    mockPrismaTripLike.upsert.mockResolvedValueOnce({} as any);
    mockPrismaTripLike.count.mockResolvedValueOnce(3);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });

  it('unlikes a trip successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    mockPrismaTrip.findUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OTHER_USER_ID,
      title: 'Tokyo Adventure',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    mockPrismaTripLike.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockPrismaTripLike.count.mockResolvedValueOnce(9);

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'unlike' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe('unlike');
    expect(body.likeCount).toBe(9);
    expect(mockPrismaTripLike.deleteMany).toHaveBeenCalledOnce();
  });

  it('returns 500 on database error during engagement POST', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // Reject the upsert call for a like action on activity
    mockPrismaSavedActivity.upsert.mockRejectedValueOnce(new Error('DB error'));

    const res = await engagementPOST(
      makeRequest('/api/feed/engagement', {
        method: 'POST',
        body: { itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' },
      })
    );
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to update engagement');
  });
});
