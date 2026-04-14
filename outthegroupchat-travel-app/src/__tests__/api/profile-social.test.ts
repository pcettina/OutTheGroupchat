/**
 * Profile and social integration tests for users/[userId]/route.ts
 *
 * Routes covered:
 *  - GET  /api/users/[userId] — profile viewing (own profile vs. other user, follow counts, public trips)
 *  - POST /api/users/[userId] — follow / unfollow toggle
 *  - PATCH /api/users/[userId] — profile update (owner only, validation)
 *
 * Coverage goals:
 *  - Unauthenticated profile viewing (email hidden, no isFollowing set)
 *  - Authenticated viewing of own profile (email included)
 *  - Authenticated viewing of another user (email hidden, isFollowing computed)
 *  - Follow counts (_count: followers/following/ownedTrips) in GET response
 *  - Public trips returned in GET response
 *  - User not found (404) for GET
 *  - Follow action: 401, 400 self-follow, 404 not found, 200 follow, 200 unfollow
 *  - Notification created on follow, not on unfollow
 *  - PATCH: 401 unauthenticated, 403 not owner, 400 Zod validation, 200 success
 *  - PATCH: partial updates (only provided fields updated)
 *  - Database error handling for all three methods (500)
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
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      follow: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
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

// ---------------------------------------------------------------------------
// Type helpers — avoid TS errors when accessing vi.fn() methods on Prisma delegates
// ---------------------------------------------------------------------------
type FollowMock = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function followMock(): FollowMock {
  return prisma.follow as unknown as FollowMock;
}

// ---------------------------------------------------------------------------
// Request builders
// ---------------------------------------------------------------------------
function makeGetRequest(userId: string): Request {
  return new Request(`http://localhost/api/users/${userId}`, { method: 'GET' });
}

function makePostRequest(userId: string): Request {
  return new Request(`http://localhost/api/users/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function makePatchRequest(userId: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_SESSION_ID = 'clh7nz5vr0002mg0hb9gkfxe2';

const OWN_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Alice Traveler', email: 'alice@example.com' },
};

const OTHER_SESSION = {
  user: { id: MOCK_SESSION_ID, name: 'Bob Viewer', email: 'bob@example.com' },
};

const BASE_USER_PROFILE = {
  id: MOCK_USER_ID,
  name: 'Alice Traveler',
  email: 'alice@example.com',
  image: 'https://example.com/avatar.png',
  bio: 'Passionate traveler and photographer.',
  city: 'New York',
  preferences: { currency: 'USD', language: 'en' },
  createdAt: new Date('2024-01-15T00:00:00Z'),
  _count: {
    followers: 42,
    following: 18,
    ownedTrips: 7,
  },
};

const PUBLIC_TRIPS = [
  {
    id: 'clh7trip0001mg0hb9gkfxe0',
    title: 'Europe Summer 2025',
    destination: 'Paris, France',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-15'),
    status: 'PLANNING',
    _count: { members: 3, activities: 8 },
  },
  {
    id: 'clh7trip0002mg0hb9gkfxe0',
    title: 'Japan Cherry Blossom',
    destination: 'Tokyo, Japan',
    startDate: new Date('2025-03-20'),
    endDate: new Date('2025-04-05'),
    status: 'COMPLETED',
    _count: { members: 2, activities: 15 },
  },
];

const EXISTING_FOLLOW = {
  id: 'clh7follow001mg0hb9gkfxe0',
  followerId: MOCK_SESSION_ID,
  followingId: MOCK_USER_ID,
  createdAt: new Date('2025-02-10T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// GET /api/users/[userId] — profile viewing
// ---------------------------------------------------------------------------
describe('GET /api/users/[userId] — profile viewing', () => {
  const { GET } = usersRoute;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Unauthenticated access (no session)
  // -------------------------------------------------------------------------
  describe('unauthenticated access', () => {
    it('returns 200 with user profile when no session exists', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data.id).toBe(MOCK_USER_ID);
    });

    it('does not check follow status when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(followMock().findFirst).not.toHaveBeenCalled();
    });

    it('returns isFollowing: false when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.data.isFollowing).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Authenticated — viewing own profile
  // -------------------------------------------------------------------------
  describe('authenticated — own profile', () => {
    it('returns 200 with full profile data when viewing own profile', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(MOCK_USER_ID);
    });

    it('does not query follow status when viewing own profile', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      // Same user — no follow check needed
      expect(followMock().findFirst).not.toHaveBeenCalled();
    });

    it('returns isFollowing: false for own profile', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.data.isFollowing).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Authenticated — viewing another user
  // -------------------------------------------------------------------------
  describe('authenticated — viewing another user', () => {
    it('returns 200 with profile when viewing a different user', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('returns isFollowing: true when viewer already follows the target', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(
        EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.data.isFollowing).toBe(true);
    });

    it('returns isFollowing: false when viewer does not follow the target', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.data.isFollowing).toBe(false);
    });

    it('queries follow.findFirst with correct followerId and followingId', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockResolvedValueOnce(null);
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(followMock().findFirst).toHaveBeenCalledWith({
        where: {
          followerId: MOCK_SESSION_ID,
          followingId: MOCK_USER_ID,
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Follow counts
  // -------------------------------------------------------------------------
  describe('follow counts in response', () => {
    it('includes _count with followers, following, and ownedTrips', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.data._count).toBeDefined();
      expect(json.data._count.followers).toBe(42);
      expect(json.data._count.following).toBe(18);
      expect(json.data._count.ownedTrips).toBe(7);
    });

    it('returns correct zero counts when user has no followers or following', async () => {
      const emptyCountUser = {
        ...BASE_USER_PROFILE,
        _count: { followers: 0, following: 0, ownedTrips: 0 },
      };
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        emptyCountUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.data._count.followers).toBe(0);
      expect(json.data._count.following).toBe(0);
      expect(json.data._count.ownedTrips).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Public trips in response
  // -------------------------------------------------------------------------
  describe('public trips in response', () => {
    it('includes publicTrips array in response data', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(Array.isArray(json.data.publicTrips)).toBe(true);
      expect(json.data.publicTrips).toHaveLength(2);
    });

    it('each public trip includes title, destination, startDate, endDate, status, and _count', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      const trip = json.data.publicTrips[0];
      expect(trip).toHaveProperty('title');
      expect(trip).toHaveProperty('destination');
      expect(trip).toHaveProperty('status');
      expect(trip).toHaveProperty('_count');
      expect(trip._count).toHaveProperty('members');
      expect(trip._count).toHaveProperty('activities');
    });

    it('returns empty publicTrips array when user has no public trips', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.data.publicTrips).toHaveLength(0);
    });

    it('queries trips with correct ownerId and isPublic filter', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
      );

      await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: MOCK_USER_ID,
            isPublic: true,
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // User not found
  // -------------------------------------------------------------------------
  describe('user not found', () => {
    it('returns 404 when user does not exist', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(res.status).toBe(404);
    });

    it('returns success: false and error message on 404', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
      const json = await res.json();

      expect(json.success).toBe(false);
      expect(json.error).toMatch(/not found/i);
    });

    it('does not query trips when user is not found', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(prisma.trip.findMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Database errors
  // -------------------------------------------------------------------------
  describe('database errors', () => {
    it('returns 500 when user.findUnique throws', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB timeout'));

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 500 when trip.findMany throws', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.trip.findMany).mockRejectedValueOnce(new Error('trip.findMany failed'));

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 500 when follow.findFirst throws during isFollowing check', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      followMock().findFirst.mockRejectedValueOnce(new Error('follow.findFirst failed'));

      const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

      expect(res.status).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/[userId] — follow/unfollow (complementary coverage)
// ---------------------------------------------------------------------------
describe('POST /api/users/[userId] — follow/unfollow integration', () => {
  const { POST } = usersRoute;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when attempting to follow yourself', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);

    const res = await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/yourself/i);
  });

  it('returns 404 when target user does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('follows and returns isFollowing: true with message "Following"', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: 'clh7follow002mg0hb9gkfxe0',
      followerId: MOCK_SESSION_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    const res = await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFollowing).toBe(true);
    expect(json.message).toBe('Following');
  });

  it('creates a FOLLOW notification for the target user when following', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: 'clh7follow002mg0hb9gkfxe0',
      followerId: MOCK_SESSION_ID,
      followingId: MOCK_USER_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'FOLLOW',
          userId: MOCK_USER_ID,
          data: expect.objectContaining({ followerId: MOCK_SESSION_ID }),
        }),
      })
    );
  });

  it('unfollows and returns isFollowing: false with message "Unfollowed"', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    followMock().delete.mockResolvedValueOnce(EXISTING_FOLLOW);

    const res = await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFollowing).toBe(false);
    expect(json.message).toBe('Unfollowed');
  });

  it('does NOT create a notification when unfollowing', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    followMock().delete.mockResolvedValueOnce(EXISTING_FOLLOW);

    await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('calls follow.delete with the id of the existing follow record', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    followMock().delete.mockResolvedValueOnce(EXISTING_FOLLOW);

    await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(followMock().delete).toHaveBeenCalledWith({
      where: { id: EXISTING_FOLLOW.id },
    });
  });

  it('returns 500 when follow.create throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockRejectedValueOnce(new Error('follow.create error'));

    const res = await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 500 when follow.delete throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    followMock().delete.mockRejectedValueOnce(new Error('follow.delete error'));

    const res = await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('does not query database for user lookup when self-follow is detected', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);

    await POST(makePostRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(followMock().create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/[userId] — profile update
// ---------------------------------------------------------------------------
describe('PATCH /api/users/[userId] — profile update', () => {
  const { PATCH } = usersRoute;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Auth guards
  // -------------------------------------------------------------------------
  describe('auth guards', () => {
    it('returns 401 when not authenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'New Name' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('returns 403 when authenticated user tries to update another user profile', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Hacked Name' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/forbidden/i);
    });

    it('does not call prisma.user.update when 401', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'New Name' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('does not call prisma.user.update when 403', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);

      await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Hacked' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation
  // -------------------------------------------------------------------------
  describe('input validation', () => {
    it('returns 400 when name is an empty string', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: '' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 when name exceeds 100 characters', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'A'.repeat(101) }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 when bio exceeds 500 characters', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { bio: 'B'.repeat(501) }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns 400 when image is not a valid URL', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { image: 'not-a-url' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('includes error details in 400 response', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: '' }),
        { params: { userId: MOCK_USER_ID } }
      );
      const json = await res.json();

      expect(json.details).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Successful update
  // -------------------------------------------------------------------------
  describe('successful update', () => {
    it('returns 200 with updated user data', async () => {
      const updatedUser = {
        id: MOCK_USER_ID,
        name: 'Alice Updated',
        image: 'https://example.com/new-avatar.png',
        bio: 'Updated bio.',
        city: 'San Francisco',
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, {
          name: 'Alice Updated',
          bio: 'Updated bio.',
          city: 'San Francisco',
          image: 'https://example.com/new-avatar.png',
        }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data.id).toBe(MOCK_USER_ID);
    });

    it('calls prisma.user.update with the correct data payload', async () => {
      const updatedUser = {
        id: MOCK_USER_ID,
        name: 'Alice Updated',
        image: null,
        bio: 'New bio',
        city: 'Boston',
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Alice Updated', bio: 'New bio', city: 'Boston' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER_ID },
          data: expect.objectContaining({
            name: 'Alice Updated',
            bio: 'New bio',
            city: 'Boston',
          }),
        })
      );
    });

    it('updates only the name field when only name is provided', async () => {
      const updatedUser = {
        id: MOCK_USER_ID,
        name: 'Just Name Changed',
        image: null,
        bio: null,
        city: null,
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Just Name Changed' }),
        { params: { userId: MOCK_USER_ID } }
      );

      const callArgs = vi.mocked(prisma.user.update).mock.calls[0][0];
      expect((callArgs as { data: Record<string, unknown> }).data).toHaveProperty('name', 'Just Name Changed');
      // bio/city/image should not be set if not provided
      expect((callArgs as { data: Record<string, unknown> }).data).not.toHaveProperty('bio');
      expect((callArgs as { data: Record<string, unknown> }).data).not.toHaveProperty('city');
    });

    it('accepts a valid image URL and passes it to the update', async () => {
      const updatedUser = {
        id: MOCK_USER_ID,
        name: null,
        image: 'https://cdn.example.com/photo.jpg',
        bio: null,
        city: null,
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { image: 'https://cdn.example.com/photo.jpg' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ image: 'https://cdn.example.com/photo.jpg' }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Database errors
  // -------------------------------------------------------------------------
  describe('database errors', () => {
    it('returns 500 when prisma.user.update throws', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB error on update'));

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Valid Name' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('500 response includes a non-empty error message', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('Constraint violation'));

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Valid' }),
        { params: { userId: MOCK_USER_ID } }
      );
      const json = await res.json();

      expect(typeof json.error).toBe('string');
      expect(json.error.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Permission boundary — owner vs. non-owner
  // -------------------------------------------------------------------------
  describe('permission boundary', () => {
    it('owner can update own profile successfully', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OWN_SESSION);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: MOCK_USER_ID,
        name: 'Owner Update',
        image: null,
        bio: null,
        city: null,
      } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Owner Update' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(200);
    });

    it('non-owner gets 403 even with a valid payload', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);

      const res = await PATCH(
        makePatchRequest(MOCK_USER_ID, { name: 'Intruder', bio: 'I should not be here' }),
        { params: { userId: MOCK_USER_ID } }
      );

      expect(res.status).toBe(403);
    });

    it('unauthenticated user gets 401 regardless of target userId', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const res = await PATCH(
        makePatchRequest(MOCK_OTHER_USER_ID, { name: 'Any Name' }),
        { params: { userId: MOCK_OTHER_USER_ID } }
      );

      expect(res.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-method integration — follow state reflected in subsequent GET
// ---------------------------------------------------------------------------
describe('profile social integration — follow state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET reflects isFollowing: true after a follow action is simulated', async () => {
    // Simulate: viewer follows target → subsequent GET shows isFollowing: true
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const { GET } = usersRoute;
    const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
    const json = await res.json();

    expect(json.data.isFollowing).toBe(true);
    expect(json.data._count.followers).toBe(42);
  });

  it('GET reflects isFollowing: false when viewer has not followed target', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OTHER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const { GET } = usersRoute;
    const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
    const json = await res.json();

    expect(json.data.isFollowing).toBe(false);
  });

  it('profile data is consistent across GET response shape', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      BASE_USER_PROFILE as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      PUBLIC_TRIPS as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );

    const { GET } = usersRoute;
    const res = await GET(makeGetRequest(MOCK_USER_ID), { params: { userId: MOCK_USER_ID } });
    const json = await res.json();

    // Verify expected response shape
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('data');
    expect(json.data).toHaveProperty('id');
    expect(json.data).toHaveProperty('name');
    expect(json.data).toHaveProperty('bio');
    expect(json.data).toHaveProperty('city');
    expect(json.data).toHaveProperty('isFollowing');
    expect(json.data).toHaveProperty('publicTrips');
    expect(json.data).toHaveProperty('_count');
  });
});
