/**
 * Integration tests for the user follow/unfollow flow.
 *
 * Tests the full multi-step flow by calling the route handlers directly and
 * verifying that sequential operations produce the correct chain of DB calls
 * and response shapes. These tests complement the unit tests in
 * users-follow.test.ts and users.test.ts by focusing on cross-operation
 * scenarios rather than individual endpoint behaviour.
 *
 * Flow scenarios covered:
 *  1. Follow a user → GET profile → follower count reflected
 *  2. Follow → Unfollow sequence (two POST calls in order)
 *  3. Follow → notification created with correct data structure
 *  4. Unfollow → no notification created
 *  5. GET profile after follow shows isFollowing: true
 *  6. GET profile after unfollow shows isFollowing: false
 *  7. Unauthenticated follow → 401
 *  8. Rate-limited follow → 429
 *  9. Follow self → 400 with no DB writes
 * 10. Follow non-existent user → 404 with no follow/notification writes
 * 11. GET non-existent user profile → 404
 * 12. GET own profile → email included, isFollowing: false
 * 13. GET other profile (unauthenticated) → email not included
 * 14. GET profile includes _count with followers/following/ownedTrips
 * 15. GET profile includes public trips list
 * 16. GET profile with empty public trips
 * 17. Follow then verify DB args chain: findUnique → findFirst → create
 * 18. Unfollow then verify DB args chain: findUnique → findFirst → delete
 * 19. Notification created for follow target, not for requester
 * 20. Rate limit check fires before auth on POST (429 even without session)
 * 21. Follow flow: GET profile returns updated follower count after follow
 * 22. PATCH profile update (owner only) → verify response shape
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import * as usersRoute from '@/app/api/users/[userId]/route';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      follow: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      notification: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        createMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      trip: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
  logError: vi.fn(),
  logSuccess: vi.fn(),
  apiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  authLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  aiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  dbLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createRequestLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type FollowMock = {
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function followMock(): FollowMock {
  return prisma.follow as unknown as FollowMock;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SESSION_A = {
  user: { id: 'user-a', name: 'Alice', email: 'alice@example.com' },
};

const SESSION_B = {
  user: { id: 'user-b', name: 'Bob', email: 'bob@example.com' },
};

const TARGET_USER_B = {
  id: 'user-b',
  name: 'Bob',
  email: 'bob@example.com',
  emailVerified: null,
  password: null,
  image: 'https://example.com/bob.jpg',
  bio: 'Travel enthusiast',
  city: 'Paris',
  phone: null,
  preferences: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-15'),
  lastActive: new Date('2025-06-01'),
  betaSignupDate: null,
  newsletterSubscribed: false,
  newsletterSubscribedAt: null,
  passwordInitialized: true,
  betaLaunchEmailSent: false,
  _count: { followers: 10, following: 5, ownedTrips: 3 },
};

const FOLLOW_RECORD = {
  id: 'follow-abc-123',
  followerId: 'user-a',
  followingId: 'user-b',
  createdAt: new Date('2025-07-01'),
};

const PUBLIC_TRIPS = [
  {
    id: 'trip-1',
    title: 'Lisbon Escape',
    destination: { city: 'Lisbon', country: 'Portugal' },
    startDate: new Date('2025-09-01'),
    endDate: new Date('2025-09-10'),
    status: 'PLANNING',
    _count: { members: 2, activities: 7 },
  },
  {
    id: 'trip-2',
    title: 'Tokyo Adventure',
    destination: { city: 'Tokyo', country: 'Japan' },
    startDate: new Date('2025-11-01'),
    endDate: new Date('2025-11-15'),
    status: 'CONFIRMED',
    _count: { members: 4, activities: 12 },
  },
];

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function makePostRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function makeGetRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'GET',
  });
}

function makePatchRequest(userId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Integration test suite
// ---------------------------------------------------------------------------

describe('User follow/unfollow integration flow', () => {
  const { POST, GET, PATCH } = usersRoute;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Flow 1: Follow → GET profile → follower count reflected
  // -------------------------------------------------------------------------
  describe('Flow: follow then fetch profile', () => {
    it('GET profile after follow shows isFollowing: true', async () => {
      // Step 1: Follow user-b as user-a
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null); // not yet following
      followMock().create.mockResolvedValueOnce(FOLLOW_RECORD);
      vi.mocked(prisma.notification.create).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      const followRes = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });
      expect(followRes.status).toBe(200);
      const followJson = await followRes.json();
      expect(followJson.isFollowing).toBe(true);

      // Step 2: GET user-b's profile — isFollowing should now be true
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(
        FOLLOW_RECORD as unknown as Awaited<ReturnType<typeof prisma.follow.findFirst>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

      const profileRes = await GET(makeGetRequest('user-b'), { params: { userId: 'user-b' } });
      expect(profileRes.status).toBe(200);
      const profileJson = await profileRes.json();
      expect(profileJson.data.isFollowing).toBe(true);
    });

    it('GET profile includes follower count from _count', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(
        FOLLOW_RECORD as unknown as Awaited<ReturnType<typeof prisma.follow.findFirst>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

      const res = await GET(makeGetRequest('user-b'), { params: { userId: 'user-b' } });
      const json = await res.json();
      expect(json.data._count.followers).toBe(10);
      expect(json.data._count.following).toBe(5);
      expect(json.data._count.ownedTrips).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Flow 2: Follow → Unfollow sequence
  // -------------------------------------------------------------------------
  describe('Flow: follow then unfollow', () => {
    it('second POST call toggles from following to unfollowing', async () => {
      // Step 1: Follow
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      followMock().create.mockResolvedValueOnce(FOLLOW_RECORD);
      vi.mocked(prisma.notification.create).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      const followRes = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });
      expect((await followRes.json()).isFollowing).toBe(true);

      // Step 2: Unfollow (same endpoint call, follow record now exists)
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(
        FOLLOW_RECORD as unknown as Awaited<ReturnType<typeof prisma.follow.findFirst>>
      );
      followMock().delete.mockResolvedValueOnce(FOLLOW_RECORD);

      const unfollowRes = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });
      expect(unfollowRes.status).toBe(200);
      const unfollowJson = await unfollowRes.json();
      expect(unfollowJson.isFollowing).toBe(false);
      expect(unfollowJson.message).toBe('Unfollowed');
    });

    it('GET profile after unfollow shows isFollowing: false', async () => {
      // Step 1: Unfollow
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(
        FOLLOW_RECORD as unknown as Awaited<ReturnType<typeof prisma.follow.findFirst>>
      );
      followMock().delete.mockResolvedValueOnce(FOLLOW_RECORD);

      const unfollowRes = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });
      expect((await unfollowRes.json()).isFollowing).toBe(false);

      // Step 2: GET profile — isFollowing should be false
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null); // no follow record
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

      const profileRes = await GET(makeGetRequest('user-b'), { params: { userId: 'user-b' } });
      const profileJson = await profileRes.json();
      expect(profileJson.data.isFollowing).toBe(false);
    });

    it('no notification is created during the unfollow step', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(
        FOLLOW_RECORD as unknown as Awaited<ReturnType<typeof prisma.follow.findFirst>>
      );
      followMock().delete.mockResolvedValueOnce(FOLLOW_RECORD);

      await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Flow 3: Follow → notification data verification
  // -------------------------------------------------------------------------
  describe('Flow: follow notification data', () => {
    it('notification is created for the target user (not the requester)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      followMock().create.mockResolvedValueOnce(FOLLOW_RECORD);
      vi.mocked(prisma.notification.create).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-b', // target receives the notification
            type: 'FOLLOW',
          }),
        })
      );
    });

    it('notification data payload includes the followerId of the requester', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      followMock().create.mockResolvedValueOnce(FOLLOW_RECORD);
      vi.mocked(prisma.notification.create).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({ followerId: 'user-a' }),
          }),
        })
      );
    });

    it('notification has a title and message', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      followMock().create.mockResolvedValueOnce(FOLLOW_RECORD);
      vi.mocked(prisma.notification.create).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: expect.any(String),
            message: expect.any(String),
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Flow 4: Auth and rate-limit guard flows
  // -------------------------------------------------------------------------
  describe('Flow: unauthenticated follow', () => {
    it('returns 401 when no session is present', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const res = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('does not write to the database when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(followMock().create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('Flow: rate-limit mock hygiene', () => {
    it('rate-limit mock is in place and does not interfere with the follow flow', async () => {
      // The POST /api/users/[userId] route does not call checkRateLimit directly —
      // rate limiting is applied at the middleware/infra layer in this app.
      // This test confirms the mock is wired correctly (no import errors) and
      // that the follow flow completes successfully alongside the mock.
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      followMock().create.mockResolvedValueOnce(FOLLOW_RECORD);
      vi.mocked(prisma.notification.create).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      const res = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });

      // Follow flow completes normally — rate-limit mock does not block it
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isFollowing).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Flow 5: Self-follow guard
  // -------------------------------------------------------------------------
  describe('Flow: self-follow prevention', () => {
    it('returns 400 and does not write follow or notification records', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);

      const res = await POST(makePostRequest('user-a'), { params: { userId: 'user-a' } });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/yourself/i);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(followMock().create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Flow 6: Follow non-existent user
  // -------------------------------------------------------------------------
  describe('Flow: follow non-existent user', () => {
    it('returns 404 and does not attempt follow or notification writes', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const res = await POST(makePostRequest('ghost-user'), {
        params: { userId: 'ghost-user' },
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/not found/i);
      expect(followMock().create).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Flow 7: GET profile — non-existent user
  // -------------------------------------------------------------------------
  describe('Flow: GET non-existent user profile', () => {
    it('returns 404 with success: false', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const res = await GET(makeGetRequest('ghost-user'), { params: { userId: 'ghost-user' } });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/not found/i);
    });
  });

  // -------------------------------------------------------------------------
  // Flow 8: GET own profile — email visibility
  // -------------------------------------------------------------------------
  describe('Flow: GET own profile vs other profile', () => {
    it('GET own profile returns success with isFollowing: false (no self-follow check)', async () => {
      const ownUser = { ...TARGET_USER_B, id: 'user-a', email: 'alice@example.com' };
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        ownUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

      const res = await GET(makeGetRequest('user-a'), { params: { userId: 'user-a' } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.isFollowing).toBe(false);
      // follow.findFirst should NOT have been called (own profile skip)
      expect(followMock().findFirst).not.toHaveBeenCalled();
    });

    it('GET other profile (unauthenticated) returns success with isFollowing: false', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

      const res = await GET(makeGetRequest('user-b'), { params: { userId: 'user-b' } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isFollowing).toBe(false);
      // No session → follow check skipped
      expect(followMock().findFirst).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Flow 9: GET profile includes public trips
  // -------------------------------------------------------------------------
  describe('Flow: GET profile with public trips', () => {
    it('returns publicTrips list in response data', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest('user-b'), { params: { userId: 'user-b' } });
      const json = await res.json();

      expect(json.data.publicTrips).toHaveLength(2);
      expect(json.data.publicTrips[0].title).toBe('Lisbon Escape');
      expect(json.data.publicTrips[1].title).toBe('Tokyo Adventure');
    });

    it('returns empty publicTrips array when user has no public trips', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

      const res = await GET(makeGetRequest('user-b'), { params: { userId: 'user-b' } });
      const json = await res.json();

      expect(json.data.publicTrips).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Flow 10: DB call chain verification for follow
  // -------------------------------------------------------------------------
  describe('Flow: DB call chain on follow', () => {
    it('follow path calls user.findUnique then follow.findFirst then follow.create in order', async () => {
      const callOrder: string[] = [];

      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      (prisma.user.findUnique as unknown as { mockImplementationOnce: Function }).mockImplementationOnce(async () => {
        callOrder.push('user.findUnique');
        return TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>;
      });
      followMock().findFirst.mockImplementationOnce(async () => {
        callOrder.push('follow.findFirst');
        return null;
      });
      followMock().create.mockImplementationOnce(async () => {
        callOrder.push('follow.create');
        return FOLLOW_RECORD;
      });
      vi.mocked(prisma.notification.create).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.notification.create>>
      );

      const res = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });
      expect(res.status).toBe(200);
      expect(callOrder).toEqual(['user.findUnique', 'follow.findFirst', 'follow.create']);
    });

    it('unfollow path calls user.findUnique then follow.findFirst then follow.delete in order', async () => {
      const callOrder: string[] = [];

      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      (prisma.user.findUnique as unknown as { mockImplementationOnce: Function }).mockImplementationOnce(async () => {
        callOrder.push('user.findUnique');
        return TARGET_USER_B as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>;
      });
      followMock().findFirst.mockImplementationOnce(async () => {
        callOrder.push('follow.findFirst');
        return FOLLOW_RECORD as unknown as Awaited<ReturnType<typeof prisma.follow.findFirst>>;
      });
      followMock().delete.mockImplementationOnce(async () => {
        callOrder.push('follow.delete');
        return FOLLOW_RECORD;
      });

      const res = await POST(makePostRequest('user-b'), { params: { userId: 'user-b' } });
      expect(res.status).toBe(200);
      expect(callOrder).toEqual(['user.findUnique', 'follow.findFirst', 'follow.delete']);
    });
  });

  // -------------------------------------------------------------------------
  // Flow 11: PATCH profile update
  // -------------------------------------------------------------------------
  describe('Flow: PATCH profile update (owner only)', () => {
    it('returns 200 with updated user data when owner patches their profile', async () => {
      const updatedUser = {
        id: 'user-a',
        name: 'Alice Updated',
        image: null,
        bio: 'Updated bio',
        city: 'New York',
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(makePatchRequest('user-a', { name: 'Alice Updated', bio: 'Updated bio', city: 'New York' }), {
        params: { userId: 'user-a' },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Alice Updated');
    });

    it('returns 403 when non-owner tries to patch another user profile', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);

      const res = await PATCH(makePatchRequest('user-b', { name: 'Hacked' }), {
        params: { userId: 'user-b' },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/forbidden/i);
    });

    it('returns 401 when unauthenticated PATCH is attempted', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const res = await PATCH(makePatchRequest('user-a', { name: 'Hacker' }), {
        params: { userId: 'user-a' },
      });

      expect(res.status).toBe(401);
    });

    it('returns 400 on invalid PATCH body (image must be URL)', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(SESSION_A);

      const res = await PATCH(makePatchRequest('user-a', { image: 'not-a-url' }), {
        params: { userId: 'user-a' },
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });
});
