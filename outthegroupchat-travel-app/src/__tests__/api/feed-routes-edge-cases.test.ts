/**
 * feed-routes-edge-cases.test.ts
 *
 * Edge-case tests for the three feed sub-routes:
 *   GET/POST /api/feed/comments
 *   GET/POST /api/feed/engagement
 *   POST     /api/feed/share
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET as commentsGET, POST as commentsPOST } from '@/app/api/feed/comments/route';
import { GET as engageGET, POST as ENGAGE } from '@/app/api/feed/engagement/route';
import { POST as SHARE } from '@/app/api/feed/share/route';

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockActivityCommentFindMany = vi.mocked(prisma.activityComment.findMany);
const mockActivityCommentCreate = vi.mocked(prisma.activityComment.create);
const mockActivityFindUnique = vi.mocked(prisma.activity.findUnique);
const mockNotificationCreate = vi.mocked(prisma.notification.create);
const mockTripFindUnique = vi.mocked(prisma.trip.findUnique);
const mockTripFindFirst = vi.mocked(prisma.trip.findFirst);
const mockTripCommentFindMany = vi.mocked(prisma.tripComment.findMany);
const mockTripCommentCreate = vi.mocked(prisma.tripComment.create);
const mockSavedActivityUpsert = vi.mocked(prisma.savedActivity.upsert);
const mockSavedActivityDeleteMany = vi.mocked(prisma.savedActivity.deleteMany);
const mockSavedActivityCount = vi.mocked(prisma.savedActivity.count);
const mockSavedActivityFindUnique = vi.mocked(prisma.savedActivity.findUnique);
const mockTripLikeUpsert = vi.mocked(prisma.tripLike.upsert);
const mockTripLikeDeleteMany = vi.mocked(prisma.tripLike.deleteMany);
const mockTripLikeCount = vi.mocked(prisma.tripLike.count);
const mockTripLikeFindUnique = vi.mocked(prisma.tripLike.findUnique);
const mockActivityFindFirst = vi.mocked(prisma.activity.findFirst);
// activityComment.count is not in the setup mock — cast to access it
const mockActivityCommentCount = prisma.activityComment.count as unknown as ReturnType<typeof vi.fn>;
const mockTripCommentCount = vi.mocked(prisma.tripComment.count);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_ACTIVITY_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_COMMENT_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const MOCK_OWNER_ID = 'clh7nz5vr0004mg0hb9gkfxe4';

const AUTHED_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

const COMMENT_URL = 'http://localhost/api/feed/comments';
const ENGAGE_URL = 'http://localhost/api/feed/engagement';
const SHARE_URL = 'http://localhost/api/feed/share';

function makeCommentGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL(COMMENT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: 'GET' });
}

function makeCommentPostRequest(body: unknown): NextRequest {
  return new NextRequest(COMMENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeEngageGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL(ENGAGE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: 'GET' });
}

function makeEngagePostRequest(body: unknown): NextRequest {
  return new NextRequest(ENGAGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeSharePostRequest(body: unknown): NextRequest {
  return new NextRequest(SHARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// /api/feed/comments — GET
// ===========================================================================
describe('GET /api/feed/comments', () => {
  it('returns comments for an activity (no auth required)', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    mockActivityCommentFindMany.mockResolvedValueOnce([
      {
        id: MOCK_COMMENT_ID,
        text: 'Great activity!',
        createdAt,
        activityId: MOCK_ACTIVITY_ID,
        userId: MOCK_USER_ID,
        user: { id: MOCK_USER_ID, name: 'Test User', image: null },
      } as unknown as Awaited<ReturnType<typeof prisma.activityComment.findMany>>[number],
    ]);

    const req = makeCommentGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' });
    const res = await commentsGET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.comments).toHaveLength(1);
    expect(json.comments[0].text).toBe('Great activity!');
    expect(json.comments[0].replies).toEqual([]);
  });

  it('returns 400 when itemId is missing', async () => {
    const req = makeCommentGetRequest({ itemType: 'activity' });
    const res = await commentsGET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is invalid', async () => {
    const req = makeCommentGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'video' });
    const res = await commentsGET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('returns 500 when prisma throws', async () => {
    mockActivityCommentFindMany.mockRejectedValueOnce(new Error('DB down'));

    const req = makeCommentGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' });
    const res = await commentsGET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch comments');
  });
});

// ===========================================================================
// /api/feed/comments — POST
// ===========================================================================
describe('POST /api/feed/comments', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeCommentPostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'hello' });
    const res = await commentsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('creates a comment on an activity successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockActivityFindUnique.mockResolvedValueOnce({
      id: MOCK_ACTIVITY_ID,
      tripId: MOCK_TRIP_ID,
      trip: { ownerId: MOCK_OWNER_ID, title: 'Road Trip' },
    } as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>);
    mockActivityCommentCreate.mockResolvedValueOnce({
      id: MOCK_COMMENT_ID,
      text: 'Nice!',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      activityId: MOCK_ACTIVITY_ID,
      userId: MOCK_USER_ID,
      user: { id: MOCK_USER_ID, name: 'Test User', image: null },
    } as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>);
    mockNotificationCreate.mockResolvedValueOnce({} as Awaited<ReturnType<typeof prisma.notification.create>>);

    const req = makeCommentPostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'Nice!' });
    const res = await commentsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.comment.text).toBe('Nice!');
    expect(json.comment.replies).toEqual([]);
  });

  it('returns 400 when itemId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);

    const req = makeCommentPostRequest({ itemType: 'activity', text: 'hello' });
    const res = await commentsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when text is empty', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);

    const req = makeCommentPostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: '' });
    const res = await commentsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('returns 404 when activity does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockActivityFindUnique.mockResolvedValueOnce(null);

    const req = makeCommentPostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'hello' });
    const res = await commentsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Activity not found');
  });

  it('returns 404 when trip does not exist (itemType=trip)', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockTripFindUnique.mockResolvedValueOnce(null);

    const req = makeCommentPostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', text: 'hello' });
    const res = await commentsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Trip not found');
  });

  it('returns 500 when prisma throws during comment creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockActivityFindUnique.mockResolvedValueOnce({
      id: MOCK_ACTIVITY_ID,
      tripId: MOCK_TRIP_ID,
      trip: { ownerId: MOCK_OWNER_ID, title: 'Road Trip' },
    } as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>);
    mockActivityCommentCreate.mockRejectedValueOnce(new Error('DB error'));

    const req = makeCommentPostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', text: 'hello' });
    const res = await commentsPOST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to post comment');
  });
});

// ===========================================================================
// /api/feed/engagement — POST (reactions/likes)
// ===========================================================================
describe('POST /api/feed/engagement', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeEngagePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('adds a like to an activity successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockSavedActivityUpsert.mockResolvedValueOnce({} as Awaited<ReturnType<typeof prisma.savedActivity.upsert>>);
    mockSavedActivityCount.mockResolvedValueOnce(5);

    const req = makeEngagePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.action).toBe('like');
    expect(json.likeCount).toBe(5);
  });

  it('removes a like from an activity (unlike action)', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockSavedActivityDeleteMany.mockResolvedValueOnce({ count: 1 });
    mockSavedActivityCount.mockResolvedValueOnce(4);

    const req = makeEngagePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'unlike' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.action).toBe('unlike');
    expect(json.likeCount).toBe(4);
  });

  it('returns 400 when action is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);

    const req = makeEngagePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'react' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);

    const req = makeEngagePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'photo', action: 'like' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('likes a trip and returns likeCount', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockTripFindUnique.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OWNER_ID,
      title: 'Beach Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockTripLikeUpsert.mockResolvedValueOnce({} as Awaited<ReturnType<typeof prisma.tripLike.upsert>>);
    mockNotificationCreate.mockResolvedValueOnce({} as Awaited<ReturnType<typeof prisma.notification.create>>);
    mockTripLikeCount.mockResolvedValueOnce(3);

    const req = makeEngagePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.likeCount).toBe(3);
  });

  it('returns 404 when trip does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockTripFindUnique.mockResolvedValueOnce(null);

    const req = makeEngagePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Trip not found');
  });

  it('returns 500 when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockSavedActivityUpsert.mockRejectedValueOnce(new Error('DB error'));

    const req = makeEngagePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' });
    const res = await ENGAGE(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to update engagement');
  });
});

// ===========================================================================
// /api/feed/engagement — GET (engagement stats)
// ===========================================================================
describe('GET /api/feed/engagement', () => {
  it('returns engagement stats for an activity without auth (isLiked=false)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockSavedActivityCount.mockResolvedValueOnce(10);
    // activityComment.count is not in the global setup mock — inject it for this test
    (prisma.activityComment as unknown as Record<string, ReturnType<typeof vi.fn>>).count = vi.fn().mockResolvedValueOnce(3);
    // No findUnique call when session is null

    const req = makeEngageGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' });
    const res = await engageGET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.likeCount).toBe(10);
    expect(json.commentCount).toBe(3);
    expect(json.isLiked).toBe(false);
  });

  it('returns 400 when itemType is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeEngageGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'event' });
    const res = await engageGET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeDefined();
  });
});

// ===========================================================================
// /api/feed/share — POST
// ===========================================================================
describe('POST /api/feed/share', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeSharePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('shares a trip successfully and returns shareUrl', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockTripFindFirst.mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      title: 'Beach Trip',
      isPublic: true,
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>);
    mockTripFindUnique.mockResolvedValueOnce({
      ownerId: MOCK_OWNER_ID,
      title: 'Beach Trip',
    } as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    mockNotificationCreate.mockResolvedValueOnce({} as Awaited<ReturnType<typeof prisma.notification.create>>);

    const req = makeSharePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', message: 'Check this out!' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.shared).toBe(true);
    expect(json.data.shareUrl).toBe(`/trips/${MOCK_TRIP_ID}`);
    expect(json.data.itemType).toBe('trip');
  });

  it('shares an activity successfully and returns shareUrl', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockActivityFindFirst.mockResolvedValueOnce({
      id: MOCK_ACTIVITY_ID,
      name: 'Surfing',
    } as unknown as Awaited<ReturnType<typeof prisma.activity.findFirst>>);

    const req = makeSharePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.shareUrl).toBe(`/activities/${MOCK_ACTIVITY_ID}`);
  });

  it('returns 400 when itemId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);

    const req = makeSharePostRequest({ itemType: 'trip' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);

    const req = makeSharePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'post' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request');
  });

  it('returns 404 when trip is not found or not accessible', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockTripFindFirst.mockResolvedValueOnce(null);

    const req = makeSharePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Trip not found or not accessible');
  });

  it('returns 404 when activity is not found or not public', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockActivityFindFirst.mockResolvedValueOnce(null);

    const req = makeSharePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Activity not found or not accessible');
  });

  it('returns 500 when prisma throws during share', async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockTripFindFirst.mockRejectedValueOnce(new Error('DB failure'));

    const req = makeSharePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' });
    const res = await SHARE(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to share item');
  });
});
