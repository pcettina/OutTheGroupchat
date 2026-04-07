/**
 * Comprehensive unit tests for /api/users/[userId] route handlers.
 *
 * Routes under test:
 *  - GET   /api/users/[userId]  — fetch public user profile (no auth required)
 *  - POST  /api/users/[userId]  — follow / unfollow a user (auth required)
 *  - PATCH /api/users/[userId]  — update own profile (owner only)
 *
 * Mock strategy:
 *  - All dependencies mocked locally (prisma, next-auth, auth, logger, rate-limit).
 *  - vi.clearAllMocks() in beforeEach preserves factory defaults, clears call counts.
 *  - mockResolvedValueOnce used for per-test data so state does not leak.
 *  - Rate-limit mocked first to avoid real Upstash Redis calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET, POST, PATCH } from '@/app/api/users/[userId]/route';

// ---------------------------------------------------------------------------
// Mock: rate-limit — prevents real Upstash Redis calls in test environment
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — full local override with all methods used by route
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    follow: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    trip: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
  },
}));

// ---------------------------------------------------------------------------
// Mock: next-auth — control session returned by getServerSession()
// ---------------------------------------------------------------------------
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/auth — authOptions only passed as arg, no real providers needed
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/logger — silence pino output during tests
// ---------------------------------------------------------------------------
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
// Typed mock helpers for prisma.follow (findFirst not in setup.ts intersection)
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
// Shared constants
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';

const SELF_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Alice', email: 'alice@example.com' },
};
const OTHER_SESSION = {
  user: { id: OTHER_USER_ID, name: 'Bob', email: 'bob@example.com' },
};

const MOCK_USER_ROW = {
  id: MOCK_USER_ID,
  name: 'Alice',
  image: null,
  bio: 'Avid traveller',
  city: 'Seattle',
  preferences: null,
  createdAt: new Date('2025-01-01'),
  _count: { followers: 10, following: 5, ownedTrips: 3 },
};

const MOCK_TRIP_ROW = {
  id: 'trip-abc',
  title: 'Tokyo Adventure',
  destination: { city: 'Tokyo', country: 'Japan' },
  startDate: new Date('2025-06-01'),
  endDate: new Date('2025-06-10'),
  status: 'PLANNING',
  _count: { members: 2, activities: 7 },
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeRequest(
  method: 'GET' | 'POST' | 'PATCH',
  userId: string,
  body?: unknown
): NextRequest {
  const url = `http://localhost/api/users/${userId}`;
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(userId: string) {
  return { params: { userId } };
}

// Typed shorthand
type UserFindUnique = Awaited<ReturnType<typeof prisma.user.findUnique>>;
type TripFindMany = Awaited<ReturnType<typeof prisma.trip.findMany>>;
type FollowFindFirst = Awaited<ReturnType<typeof prisma.follow.findFirst>>;
type NotificationCreate = Awaited<ReturnType<typeof prisma.notification.create>>;
type UserUpdate = Awaited<ReturnType<typeof prisma.user.update>>;

// ===========================================================================
// GET /api/users/[userId]
// ===========================================================================
describe('GET /api/users/[userId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with user data when unauthenticated visitor requests public profile', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Alice');
    expect(json.data.city).toBe('Seattle');
    expect(json.data.isFollowing).toBe(false);
  });

  it('returns 404 when user does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/not found/i);
  });

  it('returns isFollowing: false when authenticated viewer is not following the target', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    const json = await res.json();
    expect(json.data.isFollowing).toBe(false);
  });

  it('returns isFollowing: true when authenticated viewer is following the target', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce({
      id: 'follow-001',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    } as unknown as FollowFindFirst);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    const json = await res.json();
    expect(json.data.isFollowing).toBe(true);
  });

  it('skips follow check when viewer is viewing their own profile (isFollowing: false)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.isFollowing).toBe(false);
    expect(followMock().findFirst).not.toHaveBeenCalled();
  });

  it('includes publicTrips array in response', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([MOCK_TRIP_ROW] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    const json = await res.json();
    expect(json.data.publicTrips).toHaveLength(1);
    expect(json.data.publicTrips[0].title).toBe('Tokyo Adventure');
  });

  it('returns empty publicTrips array when user has no public trips', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    const json = await res.json();
    expect(Array.isArray(json.data.publicTrips)).toBe(true);
    expect(json.data.publicTrips).toHaveLength(0);
  });

  it('exposes _count (followers, following, ownedTrips) in response', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    const json = await res.json();
    expect(json.data._count.followers).toBe(10);
    expect(json.data._count.following).toBe(5);
    expect(json.data._count.ownedTrips).toBe(3);
  });

  it('does not expose email to unauthenticated visitors', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([] as unknown as TripFindMany);

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    const json = await res.json();
    // Route selects email: false when viewer is not the owner
    expect(json.data.email).toBeUndefined();
  });

  it('returns 500 when prisma.user.findUnique throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB failure'));

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/failed to fetch/i);
  });

  it('returns 500 when prisma.trip.findMany throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    vi.mocked(prisma.trip.findMany).mockRejectedValueOnce(new Error('trip query failed'));

    const res = await GET(makeRequest('GET', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

// ===========================================================================
// POST /api/users/[userId] — follow / unfollow
// ===========================================================================
describe('POST /api/users/[userId] (follow/unfollow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when user tries to follow themselves', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);

    const res = await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/yourself/i);
  });

  it('returns 404 when target user does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it('follows target user when not already following and returns isFollowing: true', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: 'follow-new',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce({} as NotificationCreate);

    const res = await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFollowing).toBe(true);
    expect(json.message).toBe('Following');
  });

  it('unfollows target user when already following and returns isFollowing: false', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce({
      id: 'follow-existing',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    } as unknown as FollowFindFirst);
    followMock().delete.mockResolvedValueOnce({
      id: 'follow-existing',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });

    const res = await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFollowing).toBe(false);
    expect(json.message).toBe('Unfollowed');
  });

  it('creates a FOLLOW notification when following a user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: 'follow-new',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce({} as NotificationCreate);

    await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'FOLLOW',
          userId: MOCK_USER_ID,
        }),
      })
    );
  });

  it('does NOT create a notification when unfollowing', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce({
      id: 'follow-existing',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    } as unknown as FollowFindFirst);
    followMock().delete.mockResolvedValueOnce({
      id: 'follow-existing',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });

    await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('calls follow.create with correct followerId and followingId', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: 'follow-new',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce({} as NotificationCreate);

    await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(prisma.follow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          followerId: OTHER_USER_ID,
          followingId: MOCK_USER_ID,
        }),
      })
    );
  });

  it('calls follow.delete with the existing follow record id', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce({
      id: 'follow-to-delete',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    } as unknown as FollowFindFirst);
    followMock().delete.mockResolvedValueOnce({
      id: 'follow-to-delete',
      followerId: OTHER_USER_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });

    await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(prisma.follow.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'follow-to-delete' } })
    );
  });

  it('returns 500 when prisma.user.findUnique throws during follow', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB failure'));

    const res = await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/failed to follow/i);
  });

  it('returns 500 when follow.create throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(MOCK_USER_ROW as unknown as UserFindUnique);
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockRejectedValueOnce(new Error('create failed'));

    const res = await POST(makeRequest('POST', MOCK_USER_ID), makeParams(MOCK_USER_ID));

    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// PATCH /api/users/[userId] — update own profile (owner only)
// ===========================================================================
describe('PATCH /api/users/[userId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: 'Alice Updated' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when authenticated user tries to update another user profile', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: 'Hacked Name' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/forbidden/i);
  });

  it('returns 200 with updated user data when owner updates their own profile', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      name: 'Alice Updated',
      image: null,
      bio: 'Explorer',
      city: 'Portland',
    } as unknown as UserUpdate);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: 'Alice Updated', bio: 'Explorer', city: 'Portland' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Alice Updated');
    expect(json.data.city).toBe('Portland');
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    const longName = 'A'.repeat(101);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: longName }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/validation/i);
    expect(json.details).toBeDefined();
  });

  it('returns 400 when bio exceeds 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    const longBio = 'B'.repeat(501);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { bio: longBio }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/validation/i);
  });

  it('returns 400 when city exceeds 100 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    const longCity = 'C'.repeat(101);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { city: longCity }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/validation/i);
  });

  it('returns 400 when image is not a valid URL', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { image: 'not-a-valid-url' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 400 when name is an empty string', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: '' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/validation/i);
  });

  it('accepts a valid HTTPS image URL', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      name: 'Alice',
      image: 'https://example.com/avatar.jpg',
      bio: null,
      city: null,
    } as unknown as UserUpdate);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { image: 'https://example.com/avatar.jpg' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('allows partial updates with only name field', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      name: 'New Alice',
      image: null,
      bio: null,
      city: null,
    } as unknown as UserUpdate);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: 'New Alice' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.name).toBe('New Alice');
  });

  it('allows empty body (no-op update) without returning an error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      name: 'Alice',
      image: null,
      bio: null,
      city: null,
    } as unknown as UserUpdate);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, {}),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(200);
  });

  it('response data does not expose email field', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      name: 'Alice',
      image: null,
      bio: null,
      city: null,
    } as unknown as UserUpdate);

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: 'Alice' }),
      makeParams(MOCK_USER_ID)
    );

    const json = await res.json();
    // Route uses email: false in the select — email must not be present
    expect(json.data.email).toBeUndefined();
  });

  it('calls prisma.user.update with only the fields that were provided', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      name: 'Alice',
      image: null,
      bio: 'New bio',
      city: null,
    } as unknown as UserUpdate);

    await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { bio: 'New bio' }),
      makeParams(MOCK_USER_ID)
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_USER_ID },
        data: expect.objectContaining({ bio: 'New bio' }),
      })
    );
  });

  it('returns 500 when prisma.user.update throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(SELF_SESSION);
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB failure'));

    const res = await PATCH(
      makeRequest('PATCH', MOCK_USER_ID, { name: 'Alice' }),
      makeParams(MOCK_USER_ID)
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/failed to update/i);
  });
});
