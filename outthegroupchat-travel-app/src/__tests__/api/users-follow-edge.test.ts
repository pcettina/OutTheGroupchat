/**
 * Edge-case tests for follow/unfollow and profile GET in users/[userId]/route.ts
 *
 * These tests cover gaps NOT present in users-follow.test.ts:
 *  - GET /api/users/[userId] endpoint (entirely uncovered in existing tests)
 *  - GET follow-status logic (authenticated vs unauthenticated, own profile, etc.)
 *  - Notification failure resilience on follow
 *  - follow.findFirst query shape validation
 *  - GET DB errors
 *  - Self-follow uses CUID-valid IDs
 *  - Viewing own profile skips follow check (isFollowing always false)
 *  - Rate limiting is NOT applied on this route (no 429 case)
 *  - GET public trips included in response
 *  - GET non-existent user returns 404
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
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
        update: vi.fn(),
      },
      follow: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
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
}));

// ---------------------------------------------------------------------------
// Typed helpers for follow model (not in setup.ts intersection types)
// ---------------------------------------------------------------------------
type FollowMock = {
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function followMock(): FollowMock {
  return prisma.follow as unknown as FollowMock;
}

// ---------------------------------------------------------------------------
// Constants — use valid CUIDs per project conventions
// ---------------------------------------------------------------------------
const REQUESTER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const TARGET_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const FOLLOW_RECORD_ID = 'clh7nz5vr0002mg0hb9gkfxe2';

const REQUESTER_SESSION = {
  user: { id: REQUESTER_ID, name: 'Requester', email: 'req@example.com' },
};

const TARGET_USER_FULL = {
  id: TARGET_ID,
  name: 'Target User',
  email: 'target@example.com',
  emailVerified: null,
  password: null,
  image: null,
  bio: 'Explorer',
  city: 'Paris',
  phone: null,
  preferences: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  lastActive: new Date('2025-01-01'),
  betaSignupDate: null,
  newsletterSubscribed: false,
  newsletterSubscribedAt: null,
  passwordInitialized: false,
  betaLaunchEmailSent: false,
  _count: { followers: 7, following: 3, ownedTrips: 2 },
};

// Minimal shape returned by the SELECT in GET (no email for other users)
const TARGET_USER_SELECT = {
  id: TARGET_ID,
  name: 'Target User',
  image: null,
  bio: 'Explorer',
  city: 'Paris',
  preferences: null,
  createdAt: new Date('2025-01-01'),
  _count: { followers: 7, following: 3, ownedTrips: 2 },
};

const SAMPLE_PUBLIC_TRIPS = [
  {
    id: 'clh7nz5vr0003mg0hb9gkfxe3',
    title: 'Euro Trip',
    destination: 'Europe',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-15'),
    status: 'PLANNING',
    _count: { members: 3, activities: 8 },
  },
];

const EXISTING_FOLLOW = {
  id: FOLLOW_RECORD_ID,
  followerId: REQUESTER_ID,
  followingId: TARGET_ID,
  createdAt: new Date('2025-07-01'),
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeGetRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'GET',
  });
}

function makePostRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

// ---------------------------------------------------------------------------
// GET /api/users/[userId] — profile fetch with follow status
// ---------------------------------------------------------------------------
describe('GET /api/users/[userId] — profile and follow status', () => {
  const GET = usersRoute.GET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Returns 404 for non-existent user
  it('returns 404 when the target user does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/not found/i);
  });

  // 2. Returns profile with isFollowing: true when requester follows target
  it('returns isFollowing: true when the authenticated user follows the target', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(EXISTING_FOLLOW);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      SAMPLE_PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.isFollowing).toBe(true);
  });

  // 3. Returns isFollowing: false when requester does not follow target
  it('returns isFollowing: false when the authenticated user does not follow the target', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      SAMPLE_PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.isFollowing).toBe(false);
  });

  // 4. Viewing own profile — isFollowing is always false (no follow check performed)
  it('returns isFollowing: false when the authenticated user views their own profile', async () => {
    const ownSession = { user: { id: TARGET_ID, name: 'Target', email: 'target@example.com' } };
    vi.mocked(getServerSession).mockResolvedValueOnce(ownSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.isFollowing).toBe(false);
    // follow.findFirst should NOT be called for own-profile view
    expect(followMock().findFirst).not.toHaveBeenCalled();
  });

  // 5. Unauthenticated GET — still returns profile, isFollowing: false, no follow check
  it('returns profile with isFollowing: false when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      SAMPLE_PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.isFollowing).toBe(false);
    expect(followMock().findFirst).not.toHaveBeenCalled();
  });

  // 6. GET response includes publicTrips array
  it('includes publicTrips array in the response data', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      SAMPLE_PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });
    const json = await res.json();

    expect(json.data.publicTrips).toBeDefined();
    expect(Array.isArray(json.data.publicTrips)).toBe(true);
    expect(json.data.publicTrips).toHaveLength(1);
    expect(json.data.publicTrips[0].title).toBe('Euro Trip');
  });

  // 7. GET response includes _count with followers and following
  it('includes _count with followers and following in the response', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });
    const json = await res.json();

    expect(json.data._count).toBeDefined();
    expect(json.data._count.followers).toBe(7);
    expect(json.data._count.following).toBe(3);
  });

  // 8. GET — follow.findFirst called with correct followerId and followingId
  it('queries follow.findFirst with the correct followerId and followingId', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(followMock().findFirst).toHaveBeenCalledWith({
      where: {
        followerId: REQUESTER_ID,
        followingId: TARGET_ID,
      },
    });
  });

  // 9. GET returns 500 on database error from user.findUnique
  it('returns 500 when user.findUnique throws during GET', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB failure'));

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // 10. GET returns 500 on database error from trip.findMany
  it('returns 500 when trip.findMany throws during GET', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_SELECT as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockRejectedValueOnce(new Error('trip DB failure'));

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/[userId] — follow/unfollow edge cases not in existing tests
// ---------------------------------------------------------------------------
describe('POST /api/users/[userId] — follow/unfollow edge cases', () => {
  const POST = usersRoute.POST;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 11. Notification failure does NOT cause the follow to return 500
  // The route uses await on notification.create; if it throws the whole handler throws.
  // This test documents the current behavior: notification error propagates as 500.
  it('returns 500 when notification.create throws after successful follow.create', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: FOLLOW_RECORD_ID,
      followerId: REQUESTER_ID,
      followingId: TARGET_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockRejectedValueOnce(new Error('Notification DB error'));

    const res = await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // 12. Self-follow with CUID-valid IDs still returns 400
  it('returns 400 when userId param matches session user id (using CUID)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);

    const res = await POST(makePostRequest(REQUESTER_ID), {
      params: { userId: REQUESTER_ID },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/yourself/i);
  });

  // 13. follow.create is called with the session user's id as followerId
  it('creates follow with the session user id as followerId', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: FOLLOW_RECORD_ID,
      followerId: REQUESTER_ID,
      followingId: TARGET_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(followMock().create).toHaveBeenCalledWith({
      data: {
        followerId: REQUESTER_ID,
        followingId: TARGET_ID,
      },
    });
  });

  // 14. follow.findFirst is called with correct where clause
  it('queries follow.findFirst with correct followerId/followingId on toggle check', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: FOLLOW_RECORD_ID,
      followerId: REQUESTER_ID,
      followingId: TARGET_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(followMock().findFirst).toHaveBeenCalledWith({
      where: {
        followerId: REQUESTER_ID,
        followingId: TARGET_ID,
      },
    });
  });

  // 15. follow.delete is called with the follow record's own id (not the userId)
  it('deletes follow by the follow record id, not by userId', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(EXISTING_FOLLOW);
    followMock().delete.mockResolvedValueOnce(EXISTING_FOLLOW);

    await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(followMock().delete).toHaveBeenCalledWith({
      where: { id: FOLLOW_RECORD_ID },
    });
  });

  // 16. Notification data contains the correct userId (target) and followerId (requester)
  it('creates notification with correct userId (target) and followerId (requester) in data', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: FOLLOW_RECORD_ID,
      followerId: REQUESTER_ID,
      followingId: TARGET_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: TARGET_ID,
          type: 'FOLLOW',
          data: expect.objectContaining({ followerId: REQUESTER_ID }),
        }),
      })
    );
  });

  // 17. user.findUnique is NOT called when self-follow is detected early
  it('short-circuits before any DB query on self-follow', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(REQUESTER_SESSION);

    await POST(makePostRequest(REQUESTER_ID), { params: { userId: REQUESTER_ID } });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(followMock().findFirst).not.toHaveBeenCalled();
    expect(followMock().create).not.toHaveBeenCalled();
    expect(followMock().delete).not.toHaveBeenCalled();
  });
});
