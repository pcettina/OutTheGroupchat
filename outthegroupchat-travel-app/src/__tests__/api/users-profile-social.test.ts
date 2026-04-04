/**
 * Unit tests for profile social-state gaps in user routes.
 *
 * Routes:
 *  - GET   /api/users/[userId]  — email visibility, isFollowing state, _count, own-profile checks
 *  - PATCH /api/users/[userId]  — owner-only update, validation, image URL, 403/401/500 paths
 *  - GET   /api/users/me        — follower/following counts, empty recentTrips/savedActivities
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger, rate-limit) are mocked locally.
 * - Each test uses mockResolvedValueOnce() for independent setup.
 * - vi.clearAllMocks() in beforeEach prevents state leakage.
 * - Routes use plain Request (not NextRequest) — helpers use new Request().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import * as usersRoute from '@/app/api/users/[userId]/route';
import { GET as meGET } from '@/app/api/users/me/route';

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — local override so follow.findFirst is available
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
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
    trip: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    savedActivity: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
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
// Mock: next-auth — local instance so vi.mocked(getServerSession) works reliably
// ---------------------------------------------------------------------------
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/auth
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/logger — silence output
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
// Mock: rate-limit — preemptive, required by any route that calls checkRateLimit
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, { method: 'GET' });
}

function makePatchRequest(userId: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeMeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/users/me', { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Type helpers for follow mock methods
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
// Fixtures
// ---------------------------------------------------------------------------
const VIEWER_SESSION = {
  user: { id: 'viewer-id', name: 'Viewer User', email: 'viewer@example.com' },
};

const OWNER_SESSION = {
  user: { id: 'owner-id', name: 'Owner User', email: 'owner@example.com' },
};

const TARGET_USER_FULL = {
  id: 'target-id',
  name: 'Target User',
  email: 'target@example.com',
  emailVerified: null,
  password: null,
  image: 'https://example.com/avatar.png',
  bio: 'Avid traveler',
  city: 'Barcelona',
  phone: null,
  preferences: null,
  createdAt: new Date('2025-03-01'),
  updatedAt: new Date('2025-03-01'),
  lastActive: new Date('2025-03-01'),
  betaSignupDate: null,
  newsletterSubscribed: false,
  newsletterSubscribedAt: null,
  passwordInitialized: false,
  betaLaunchEmailSent: false,
  _count: { followers: 8, following: 4, ownedTrips: 2 },
};

const OWN_USER = {
  ...TARGET_USER_FULL,
  id: 'owner-id',
  email: 'owner@example.com',
};

const MOCK_ME_USER = {
  id: 'viewer-id',
  name: 'Viewer User',
  email: 'viewer@example.com',
  image: null,
  bio: 'Explorer',
  city: 'Denver',
  phone: null,
  preferences: null,
  createdAt: new Date('2025-01-15'),
  lastActive: new Date('2025-06-15'),
  _count: {
    followers: 12,
    following: 7,
    ownedTrips: 3,
    tripMemberships: 5,
    savedActivities: 0,
  },
};

// ---------------------------------------------------------------------------
// GET /api/users/[userId] — email visibility & social state
// ---------------------------------------------------------------------------
describe('GET /api/users/[userId] — email visibility & social state', () => {
  const GET = usersRoute.GET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when session user is viewing own profile', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      { ...OWN_USER } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest('owner-id'), { params: { userId: 'owner-id' } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('owner-id');
  });

  it('does NOT call follow.findFirst when viewing own profile', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      { ...OWN_USER } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    await GET(makeGetRequest('owner-id'), { params: { userId: 'owner-id' } });

    expect(followMock().findFirst).not.toHaveBeenCalled();
  });

  it('does NOT call follow.findFirst when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    await GET(makeGetRequest('target-id'), { params: { userId: 'target-id' } });

    expect(followMock().findFirst).not.toHaveBeenCalled();
  });

  it('calls follow.findFirst with correct followerId and followingId when authenticated and viewing other user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    await GET(makeGetRequest('target-id'), { params: { userId: 'target-id' } });

    expect(followMock().findFirst).toHaveBeenCalledWith({
      where: {
        followerId: 'viewer-id',
        followingId: 'target-id',
      },
    });
  });

  it('returns isFollowing: false in response when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest('target-id'), { params: { userId: 'target-id' } });
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.isFollowing).toBe(false);
  });

  it('response includes _count with followers, following, ownedTrips', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest('target-id'), { params: { userId: 'target-id' } });
    const json = await res.json();

    expect(json.data._count).toMatchObject({
      followers: 8,
      following: 4,
      ownedTrips: 2,
    });
  });

  it('response includes publicTrips array (empty when none exist)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest('target-id'), { params: { userId: 'target-id' } });
    const json = await res.json();

    expect(Array.isArray(json.data.publicTrips)).toBe(true);
    expect(json.data.publicTrips).toHaveLength(0);
  });

  it('queries public trips filtered by ownerId and isPublic: true', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_FULL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    await GET(makeGetRequest('target-id'), { params: { userId: 'target-id' } });

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: 'target-id',
          isPublic: true,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/[userId] — owner-only updates, validation, error paths
// ---------------------------------------------------------------------------
describe('PATCH /api/users/[userId] — owner-only profile updates', () => {
  const PATCH = usersRoute.PATCH;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await PATCH(makePatchRequest('owner-id', { name: 'New Name' }), {
      params: { userId: 'owner-id' },
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when authenticated user tries to update a different user profile', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await PATCH(makePatchRequest('owner-id', { name: 'Hacked Name' }), {
      params: { userId: 'owner-id' },
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/forbidden/i);
  });

  it('returns 403 and does not call prisma.user.update when updating another user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    await PATCH(makePatchRequest('owner-id', { bio: 'Injected bio' }), {
      params: { userId: 'owner-id' },
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 when bio exceeds 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

    const res = await PATCH(makePatchRequest('owner-id', { bio: 'b'.repeat(501) }), {
      params: { userId: 'owner-id' },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when name is an empty string', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

    const res = await PATCH(makePatchRequest('owner-id', { name: '' }), {
      params: { userId: 'owner-id' },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when image is not a valid URL', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);

    const res = await PATCH(makePatchRequest('owner-id', { image: 'not-a-url' }), {
      params: { userId: 'owner-id' },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 200 when updating bio and city successfully', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'owner-id',
      name: 'Owner User',
      image: null,
      bio: 'Updated bio here',
      city: 'Miami',
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const res = await PATCH(
      makePatchRequest('owner-id', { bio: 'Updated bio here', city: 'Miami' }),
      { params: { userId: 'owner-id' } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.bio).toBe('Updated bio here');
    expect(json.data.city).toBe('Miami');
  });

  it('returns 200 when updating with a valid image URL', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'owner-id',
      name: 'Owner User',
      image: 'https://cdn.example.com/profile.jpg',
      bio: null,
      city: null,
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const res = await PATCH(
      makePatchRequest('owner-id', { image: 'https://cdn.example.com/profile.jpg' }),
      { params: { userId: 'owner-id' } }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('calls prisma.user.update with the correct userId in where clause', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'owner-id',
      name: 'Owner User',
      image: null,
      bio: 'Some bio',
      city: null,
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    await PATCH(makePatchRequest('owner-id', { bio: 'Some bio' }), {
      params: { userId: 'owner-id' },
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'owner-id' },
      })
    );
  });

  it('response data does NOT include email field (select: email: false)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'owner-id',
      name: 'Owner User',
      image: null,
      bio: 'Bio text',
      city: 'Chicago',
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const res = await PATCH(makePatchRequest('owner-id', { city: 'Chicago' }), {
      params: { userId: 'owner-id' },
    });
    const json = await res.json();

    // The route selects email: false and our mock omits email to reflect actual select behavior.
    expect(json.data.email).toBeUndefined();
  });

  it('returns 500 on database error during update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(OWNER_SESSION);
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB write failed'));

    const res = await PATCH(makePatchRequest('owner-id', { name: 'Valid Name' }), {
      params: { userId: 'owner-id' },
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/failed to update user/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/me — follower/following counts and edge cases
// ---------------------------------------------------------------------------
describe('GET /api/users/me — follower/following counts and edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes follower and following counts in _count', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      MOCK_ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGET(makeMeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data._count.followers).toBe(12);
    expect(json.data._count.following).toBe(7);
  });

  it('returns recentTrips as empty array when user has no trips', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      MOCK_ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGET(makeMeGetRequest());
    const json = await res.json();

    expect(Array.isArray(json.data.recentTrips)).toBe(true);
    expect(json.data.recentTrips).toHaveLength(0);
  });

  it('returns savedActivities as empty array when user has no saved activities', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      MOCK_ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGET(makeMeGetRequest());
    const json = await res.json();

    expect(Array.isArray(json.data.savedActivities)).toBe(true);
    expect(json.data.savedActivities).toHaveLength(0);
  });

  it('response does NOT include isFollowing field (own profile route)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      MOCK_ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGET(makeMeGetRequest());
    const json = await res.json();

    expect(json.data.isFollowing).toBeUndefined();
  });

  it('includes tripMemberships and savedActivities counts in _count', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      MOCK_ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGET(makeMeGetRequest());
    const json = await res.json();

    expect(json.data._count.tripMemberships).toBe(5);
    expect(json.data._count.savedActivities).toBe(0);
  });
});
