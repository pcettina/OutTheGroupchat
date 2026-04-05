/**
 * Unit tests for social/real-time API route handlers.
 *
 * Routes covered:
 *   POST /api/pusher/auth        — Pusher channel authentication
 *   POST /api/feed/comments      — Post a comment on an activity or trip
 *   POST /api/feed/engagement    — Like/unlike an activity or trip
 *   POST /api/feed/share         — Share a trip or activity to the feed
 *
 * Strategy
 * --------
 * - next-auth, @/lib/auth, and @/lib/logger are mocked globally in setup.ts.
 * - @/lib/pusher is mocked in this file so getPusherServer() is fully
 *   controlled per-test without requiring real credentials or env vars.
 * - @/lib/prisma is re-mocked here with the full set of methods required by
 *   the comments, engagement, and share handlers (upsert, deleteMany, count,
 *   findFirst, etc.) that are absent from the global setup.ts stub.
 * - All tests use mockResolvedValueOnce() / mockReturnValueOnce() so mocks
 *   never bleed across test boundaries.
 * - vi.clearAllMocks() runs in beforeEach to reset call counts and queues.
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
// Mock: @/lib/pusher — controlled authorizeChannel per test
// ---------------------------------------------------------------------------
const mockAuthorizeChannel = vi.fn();
const mockPusherInstance = { authorizeChannel: mockAuthorizeChannel };

vi.mock('@/lib/pusher', () => ({
  getPusherServer: vi.fn(),
}));

import { getPusherServer } from '@/lib/pusher';

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — extend global setup with all methods the four routes need
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      activity: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      trip: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      activityComment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      savedActivity: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
        count: vi.fn(),
      },
      notification: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      tripComment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      tripLike: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Import route handlers after mocks are registered
// ---------------------------------------------------------------------------
import { POST as pusherAuthPOST } from '@/app/api/pusher/auth/route';
import { POST as commentsPOST } from '@/app/api/feed/comments/route';
import { POST as engagementPOST } from '@/app/api/feed/engagement/route';
import { POST as sharePOST } from '@/app/api/feed/share/route';

// ---------------------------------------------------------------------------
// Typed references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGetPusherServer = vi.mocked(getPusherServer);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaActivityComment = vi.mocked(prisma.activityComment);
const mockPrismaSavedActivity = vi.mocked(prisma.savedActivity);
const mockPrismaTripComment = vi.mocked((prisma as unknown as Record<string, typeof prisma.tripComment>).tripComment);
const mockPrismaTripLike = vi.mocked((prisma as unknown as Record<string, typeof prisma.tripLike>).tripLike);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaNotification = vi.mocked(prisma.notification);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// User ID without dashes so it survives channel_name.split('-') parsing:
// 'private-user-userABC123' → parts[2] === 'userABC123' === MOCK_USER_ID ✓
const MOCK_USER_ID = 'userABC123';
const MOCK_OTHER_USER_ID = 'userOTHER456';
const MOCK_TRIP_ID = 'trip-social-001';
const MOCK_ACTIVITY_ID = 'activity-social-002';
const MOCK_COMMENT_ID = 'comment-social-003';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Social Tester',
    email: 'social@example.com',
  },
  expires: '2099-01-01',
};

const MOCK_CREATED_AT = new Date('2026-03-20T12:00:00Z');

const MOCK_AUTH_RESPONSE = { auth: 'app-key:mock-signature' };

/** Build a FormData POST Request (used by pusher/auth). */
function makeFormDataRequest(
  socketId: string | null,
  channelName: string | null
): NextRequest {
  const formData = new FormData();
  if (socketId !== null) formData.set('socket_id', socketId);
  if (channelName !== null) formData.set('channel_name', channelName);
  return new NextRequest('http://localhost:3000/api/pusher/auth', {
    method: 'POST',
    body: formData,
  });
}

/** Build a JSON POST NextRequest (used by comments, engagement, share). */
function makeJsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Parse JSON from a NextResponse-compatible Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// POST /api/pusher/auth
// ===========================================================================
describe('POST /api/pusher/auth', () => {
  describe('authentication guard', () => {
    it('returns 401 when session is null', async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
      expect(mockGetPusherServer).not.toHaveBeenCalled();
    });

    it('returns 401 when session user has no id', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { name: 'No ID', email: 'noid@example.com' },
        expires: '2099-01-01',
      } as never);

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('Pusher server configuration', () => {
    it('returns 500 when getPusherServer returns null', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(null);

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(500);
      expect(body.error).toBe('Pusher not configured');
    });
  });

  describe('input validation', () => {
    it('returns 400 when socket_id is missing', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest(null, 'public-channel');
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Missing required fields');
      expect(body.details).toBeDefined();
      expect(mockAuthorizeChannel).not.toHaveBeenCalled();
    });

    it('returns 400 when channel_name is missing', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest('123.456', null);
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Missing required fields');
      expect(mockAuthorizeChannel).not.toHaveBeenCalled();
    });

    it('returns 400 when socket_id is an empty string', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest('', 'public-channel');
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Missing required fields');
    });
  });

  describe('successful authentication', () => {
    it('returns 200 with pusher auth token for a public channel', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );
      mockAuthorizeChannel.mockReturnValueOnce(MOCK_AUTH_RESPONSE);

      const req = makeFormDataRequest('123.456', 'public-trip-abc');
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.auth).toBe(MOCK_AUTH_RESPONSE.auth);
      expect(mockAuthorizeChannel).toHaveBeenCalledOnce();
      expect(mockAuthorizeChannel).toHaveBeenCalledWith('123.456', 'public-trip-abc');
    });

    it('returns 200 for a private-user channel matching the session user id', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );
      mockAuthorizeChannel.mockReturnValueOnce(MOCK_AUTH_RESPONSE);

      const channelName = `private-user-${MOCK_USER_ID}`;
      const req = makeFormDataRequest('123.456', channelName);
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.auth).toBe(MOCK_AUTH_RESPONSE.auth);
    });

    it('returns 200 for a private-trip channel (no ownership check)', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );
      mockAuthorizeChannel.mockReturnValueOnce(MOCK_AUTH_RESPONSE);

      const req = makeFormDataRequest('123.456', 'private-trip-tripXYZ789');
      const res = await pusherAuthPOST(req);

      expect(res.status).toBe(200);
    });
  });

  describe('private channel ownership check', () => {
    it('returns 403 when private-user channel belongs to a different user', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockGetPusherServer.mockReturnValueOnce(
        mockPusherInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest('123.456', `private-user-${MOCK_OTHER_USER_ID}`);
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(403);
      expect(body.error).toBe('Forbidden');
      expect(mockAuthorizeChannel).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when authorizeChannel throws', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      const throwingInstance = {
        authorizeChannel: vi.fn().mockImplementationOnce(() => {
          throw new Error('Pusher signing error');
        }),
      };
      mockGetPusherServer.mockReturnValueOnce(
        throwingInstance as unknown as ReturnType<typeof getPusherServer>
      );

      const req = makeFormDataRequest('123.456', 'public-channel');
      const res = await pusherAuthPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(500);
      expect(body.error).toBe('Authentication failed');
    });
  });
});

// ===========================================================================
// POST /api/feed/comments
// ===========================================================================
describe('POST /api/feed/comments', () => {
  describe('authentication guard', () => {
    it('returns 401 when session is null', async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        text: 'Nice activity!',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('input validation', () => {
    it('returns 400 when itemId is missing', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/comments', {
        itemType: 'activity',
        text: 'Hello',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });

    it('returns 400 when itemType is invalid', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'invalid-type',
        text: 'Hello',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });

    it('returns 400 when text is empty', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        text: '',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });

    it('returns 400 when text exceeds 2000 characters', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        text: 'a'.repeat(2001),
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });
  });

  describe('activity comment — happy path', () => {
    it('returns 200 with the created comment for an activity', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const mockActivity = {
        id: MOCK_ACTIVITY_ID,
        tripId: MOCK_TRIP_ID,
        trip: { ownerId: MOCK_OTHER_USER_ID, title: 'Paris Trip' },
      };
      const mockComment = {
        id: MOCK_COMMENT_ID,
        text: 'Great activity!',
        createdAt: MOCK_CREATED_AT,
        user: { id: MOCK_USER_ID, name: 'Social Tester', image: null },
      };

      mockPrismaActivity.findUnique.mockResolvedValueOnce(
        mockActivity as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
      );
      mockPrismaActivityComment.create.mockResolvedValueOnce(
        mockComment as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>
      );
      mockPrismaNotification.create.mockResolvedValueOnce(
        {} as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        text: 'Great activity!',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.comment.id).toBe(MOCK_COMMENT_ID);
      expect(body.comment.text).toBe('Great activity!');
      expect(body.comment.replies).toEqual([]);
    });

    it('returns 404 when the activity does not exist', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaActivity.findUnique.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: 'nonexistent-activity',
        itemType: 'activity',
        text: 'Hello',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(404);
      expect(body.error).toBe('Activity not found');
    });
  });

  describe('trip comment — happy path', () => {
    it('returns 200 with the created comment for a trip', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const mockTrip = {
        id: MOCK_TRIP_ID,
        ownerId: MOCK_OTHER_USER_ID,
        title: 'Tokyo Adventure',
      };
      const mockComment = {
        id: MOCK_COMMENT_ID,
        text: 'Looks amazing!',
        createdAt: MOCK_CREATED_AT,
        user: { id: MOCK_USER_ID, name: 'Social Tester', image: null },
      };

      mockPrismaTrip.findUnique.mockResolvedValueOnce(
        mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
      );
      mockPrismaTripComment.create.mockResolvedValueOnce(
        mockComment as unknown as Awaited<ReturnType<typeof prisma.tripComment.create>>
      );
      mockPrismaNotification.create.mockResolvedValueOnce(
        {} as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: MOCK_TRIP_ID,
        itemType: 'trip',
        text: 'Looks amazing!',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.comment.id).toBe(MOCK_COMMENT_ID);
      expect(body.comment.text).toBe('Looks amazing!');
    });

    it('returns 404 when the trip does not exist', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/comments', {
        itemId: 'nonexistent-trip',
        itemType: 'trip',
        text: 'Hello',
      });
      const res = await commentsPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(404);
      expect(body.error).toBe('Trip not found');
    });
  });
});

// ===========================================================================
// POST /api/feed/engagement
// ===========================================================================
describe('POST /api/feed/engagement', () => {
  describe('authentication guard', () => {
    it('returns 401 when session is null', async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        action: 'like',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('input validation', () => {
    it('returns 400 when itemId is missing', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemType: 'activity',
        action: 'like',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });

    it('returns 400 when action is invalid', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        action: 'upvote',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });

    it('returns 400 when itemType is invalid', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'comment',
        action: 'like',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });
  });

  describe('activity engagement — like', () => {
    it('returns 200 with updated like count when liking an activity', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaSavedActivity.upsert.mockResolvedValueOnce(
        {} as unknown as Awaited<ReturnType<typeof prisma.savedActivity.upsert>>
      );
      mockPrismaSavedActivity.count.mockResolvedValueOnce(5);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        action: 'like',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('like');
      expect(body.itemType).toBe('activity');
      expect(body.likeCount).toBe(5);
    });
  });

  describe('activity engagement — unlike', () => {
    it('returns 200 with updated like count when unliking an activity', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaSavedActivity.deleteMany.mockResolvedValueOnce(
        { count: 1 } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.deleteMany>>
      );
      mockPrismaSavedActivity.count.mockResolvedValueOnce(3);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
        action: 'unlike',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('unlike');
      expect(body.likeCount).toBe(3);
    });
  });

  describe('trip engagement — like', () => {
    it('returns 200 with updated like count when liking a trip', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const mockTrip = {
        id: MOCK_TRIP_ID,
        ownerId: MOCK_OTHER_USER_ID,
        title: 'Bali Retreat',
      };

      mockPrismaTrip.findUnique.mockResolvedValueOnce(
        mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
      );
      mockPrismaTripLike.upsert.mockResolvedValueOnce(
        {} as unknown as Awaited<ReturnType<typeof prisma.tripLike.upsert>>
      );
      mockPrismaNotification.create.mockResolvedValueOnce(
        {} as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
      );
      mockPrismaTripLike.count.mockResolvedValueOnce(12);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: MOCK_TRIP_ID,
        itemType: 'trip',
        action: 'like',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('like');
      expect(body.likeCount).toBe(12);
    });

    it('returns 404 when trip does not exist', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaTrip.findUnique.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: 'nonexistent-trip',
        itemType: 'trip',
        action: 'like',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(404);
      expect(body.error).toBe('Trip not found');
    });
  });

  describe('trip engagement — unlike', () => {
    it('returns 200 with updated like count when unliking a trip', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const mockTrip = {
        id: MOCK_TRIP_ID,
        ownerId: MOCK_OTHER_USER_ID,
        title: 'Bali Retreat',
      };

      mockPrismaTrip.findUnique.mockResolvedValueOnce(
        mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
      );
      mockPrismaTripLike.deleteMany.mockResolvedValueOnce(
        { count: 1 } as unknown as Awaited<ReturnType<typeof prisma.tripLike.deleteMany>>
      );
      mockPrismaTripLike.count.mockResolvedValueOnce(7);

      const req = makeJsonRequest('/api/feed/engagement', {
        itemId: MOCK_TRIP_ID,
        itemType: 'trip',
        action: 'unlike',
      });
      const res = await engagementPOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('unlike');
      expect(body.likeCount).toBe(7);
    });
  });
});

// ===========================================================================
// POST /api/feed/share
// ===========================================================================
describe('POST /api/feed/share', () => {
  describe('authentication guard', () => {
    it('returns 401 when session is null', async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/share', {
        itemId: MOCK_TRIP_ID,
        itemType: 'trip',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('input validation', () => {
    it('returns 400 when itemId is missing', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/share', {
        itemType: 'trip',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });

    it('returns 400 when itemType is invalid', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/share', {
        itemId: MOCK_TRIP_ID,
        itemType: 'event',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });

    it('returns 400 when message exceeds 500 characters', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const req = makeJsonRequest('/api/feed/share', {
        itemId: MOCK_TRIP_ID,
        itemType: 'trip',
        message: 'x'.repeat(501),
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid request');
    });
  });

  describe('share trip — happy path', () => {
    it('returns 200 with shareUrl when sharing an accessible trip', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const mockTrip = {
        id: MOCK_TRIP_ID,
        title: 'Epic Road Trip',
        isPublic: true,
      };
      const mockTripFull = {
        ownerId: MOCK_OTHER_USER_ID,
        title: 'Epic Road Trip',
      };

      mockPrismaTrip.findFirst.mockResolvedValueOnce(
        mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
      );
      mockPrismaTrip.findUnique.mockResolvedValueOnce(
        mockTripFull as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
      );
      mockPrismaNotification.create.mockResolvedValueOnce(
        {} as unknown as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      const req = makeJsonRequest('/api/feed/share', {
        itemId: MOCK_TRIP_ID,
        itemType: 'trip',
        message: 'Check this out!',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.shared).toBe(true);
      expect(body.data.itemType).toBe('trip');
      expect(body.data.shareUrl).toBe(`/trips/${MOCK_TRIP_ID}`);
    });

    it('returns 404 when trip is not found or not accessible', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/share', {
        itemId: 'private-inaccessible-trip',
        itemType: 'trip',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(404);
      expect(body.error).toBe('Trip not found or not accessible');
    });
  });

  describe('share activity — happy path', () => {
    it('returns 200 with shareUrl when sharing a public activity', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const mockActivity = {
        id: MOCK_ACTIVITY_ID,
        name: 'Snorkeling Tour',
      };

      mockPrismaActivity.findFirst.mockResolvedValueOnce(
        mockActivity as unknown as Awaited<ReturnType<typeof prisma.activity.findFirst>>
      );

      const req = makeJsonRequest('/api/feed/share', {
        itemId: MOCK_ACTIVITY_ID,
        itemType: 'activity',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.shared).toBe(true);
      expect(body.data.itemType).toBe('activity');
      expect(body.data.shareUrl).toBe(`/activities/${MOCK_ACTIVITY_ID}`);
    });

    it('returns 404 when activity is not found or not public', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaActivity.findFirst.mockResolvedValueOnce(null);

      const req = makeJsonRequest('/api/feed/share', {
        itemId: 'private-activity-999',
        itemType: 'activity',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(404);
      expect(body.error).toBe('Activity not found or not accessible');
    });

    it('returns 200 when sharing a trip owned by the current user (no notification)', async () => {
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

      const mockTrip = {
        id: MOCK_TRIP_ID,
        title: 'My Own Trip',
        isPublic: true,
      };
      const mockTripFull = {
        ownerId: MOCK_USER_ID, // same as session user — no notification
        title: 'My Own Trip',
      };

      mockPrismaTrip.findFirst.mockResolvedValueOnce(
        mockTrip as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
      );
      mockPrismaTrip.findUnique.mockResolvedValueOnce(
        mockTripFull as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
      );

      const req = makeJsonRequest('/api/feed/share', {
        itemId: MOCK_TRIP_ID,
        itemType: 'trip',
      });
      const res = await sharePOST(req);
      const body = await parseJson(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockPrismaNotification.create).not.toHaveBeenCalled();
    });
  });
});
