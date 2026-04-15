/**
 * Edge-case tests for users API routes.
 *
 * Routes covered:
 *  - GET   /api/users/[userId]   — public profile, email visibility, follow status
 *  - POST  /api/users/[userId]   — follow/unfollow toggle semantics
 *  - PATCH /api/users/[userId]   — owner-only profile update, Zod validation
 *  - GET   /api/users/me         — current user profile with counts
 *  - PATCH /api/users/me         — partial updates, preferences merge
 *
 * All tests use mockResolvedValueOnce — never mockResolvedValue.
 * vi.clearAllMocks() runs before each test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import * as userIdRoute from '@/app/api/users/[userId]/route';
import { GET as getMeHandler, PATCH as patchMeHandler } from '@/app/api/users/me/route';

// ---------------------------------------------------------------------------
// Module-level mocks — use importOriginal pattern (same as users-follow.test.ts)
// so the full prisma object is available with all methods we need.
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
      savedActivity: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

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
// Test IDs (plain strings — routes accept any string id in params)
// ---------------------------------------------------------------------------
const VIEWER_ID = 'viewer-user-id';
const TARGET_ID = 'target-user-id';
const FOLLOW_RECORD_ID = 'follow-record-id';

// ---------------------------------------------------------------------------
// Typed mock accessor for follow (findFirst not always in intersection type)
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
  user: { id: VIEWER_ID, name: 'Viewer User', email: 'viewer@example.com' },
};

const TARGET_USER_DB = {
  id: TARGET_ID,
  name: 'Target User',
  email: 'target@example.com',
  emailVerified: null,
  password: null,
  image: 'https://example.com/avatar.jpg',
  bio: 'Travel enthusiast',
  city: 'Barcelona',
  phone: null,
  preferences: null,
  createdAt: new Date('2025-01-15'),
  updatedAt: new Date('2025-03-01'),
  lastActive: new Date('2025-03-01'),
  betaSignupDate: null,
  newsletterSubscribed: false,
  newsletterSubscribedAt: null,
  passwordInitialized: true,
  betaLaunchEmailSent: false,
  _count: { followers: 12, following: 8, ownedTrips: 5 },
};

const EXISTING_FOLLOW = {
  id: FOLLOW_RECORD_ID,
  followerId: VIEWER_ID,
  followingId: TARGET_ID,
  createdAt: new Date('2025-06-01'),
};

const ME_USER_DB = {
  id: VIEWER_ID,
  name: 'Viewer User',
  email: 'viewer@example.com',
  image: null,
  bio: 'Love road trips',
  city: 'Austin',
  phone: '+1-555-0100',
  preferences: { travelStyle: 'adventure', language: 'en' },
  createdAt: new Date('2025-02-01'),
  lastActive: new Date('2025-04-01'),
  _count: {
    followers: 4,
    following: 7,
    ownedTrips: 3,
    tripMemberships: 2,
    savedActivities: 10,
  },
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeGetRequest(userId: string): Request {
  return new Request(`http://localhost/api/users/${userId}`, { method: 'GET' });
}

function makePostRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function makePatchUserIdRequest(userId: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeMePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ============================================================================
// GET /api/users/[userId] — edge cases
// ============================================================================
describe('GET /api/users/[userId] — edge cases', () => {
  const GET = userIdRoute.GET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 (no auth required) for unauthenticated request to valid user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('does NOT include email in response when viewer is a different user', async () => {
    // Route passes email: false to Prisma select when viewer != userId.
    // The mock returns the DB object as-is; verify the response shape omits email.
    // Since Prisma is mocked and returns what we give it, we simulate Prisma's
    // behavior by returning a user object WITHOUT the email field.
    const userWithoutEmail = { ...TARGET_USER_DB, email: undefined };
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      userWithoutEmail as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });
    const json = await res.json();

    expect(json.success).toBe(true);
    // email not present in the response data
    expect(json.data.email).toBeUndefined();
  });

  it('includes follower and following counts in _count', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });
    const json = await res.json();

    expect(json.data._count.followers).toBe(12);
    expect(json.data._count.following).toBe(8);
    expect(json.data._count.ownedTrips).toBe(5);
  });

  it('sets isFollowing=true when authenticated viewer follows target', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });
    const json = await res.json();

    expect(json.data.isFollowing).toBe(true);
  });

  it('sets isFollowing=false when authenticated viewer does not follow target', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });
    const json = await res.json();

    expect(json.data.isFollowing).toBe(false);
  });

  it('sets isFollowing=false and skips follow check when viewing own profile', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    const ownProfile = { ...TARGET_USER_DB, id: VIEWER_ID };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ownProfile as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(VIEWER_ID), { params: { userId: VIEWER_ID } });
    const json = await res.json();

    expect(json.data.isFollowing).toBe(false);
    // follow.findFirst should NOT have been called for own profile
    expect(followMock().findFirst).not.toHaveBeenCalled();
  });

  it('returns empty publicTrips array when user has no public trips', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });
    const json = await res.json();

    expect(Array.isArray(json.data.publicTrips)).toBe(true);
    expect(json.data.publicTrips).toHaveLength(0);
  });

  it('returns 404 for non-existent user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest('nonexistent-user-id'), {
      params: { userId: 'nonexistent-user-id' },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('User not found');
  });

  it('returns 500 on unexpected DB error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('connection refused'));

    const res = await GET(makeGetRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

// ============================================================================
// POST /api/users/[userId] — follow/unfollow edge cases
// ============================================================================
describe('POST /api/users/[userId] — follow/unfollow edge cases', () => {
  const POST = userIdRoute.POST;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 400 when attempting to follow yourself', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await POST(makePostRequest(VIEWER_ID), { params: { userId: VIEWER_ID } });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/yourself/i);
  });

  it('returns 404 when target user does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('User not found');
  });

  it('follow: creates follow record and returns isFollowing=true', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: 'new-follow',
      followerId: VIEWER_ID,
      followingId: TARGET_ID,
      createdAt: new Date(),
    });
    vi.mocked(prisma.notification.create).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof prisma.notification.create>>
    );

    const res = await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFollowing).toBe(true);
    expect(json.message).toBe('Following');
  });

  it('follow: notification title is "New Follower" and type is "FOLLOW"', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockResolvedValueOnce({
      id: 'new-follow',
      followerId: VIEWER_ID,
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
          type: 'FOLLOW',
          title: 'New Follower',
          userId: TARGET_ID,
        }),
      })
    );
  });

  it('unfollow: deletes follow record and returns isFollowing=false', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    followMock().delete.mockResolvedValueOnce(EXISTING_FOLLOW);

    const res = await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFollowing).toBe(false);
    expect(json.message).toBe('Unfollowed');
  });

  it('unfollow: does NOT create a notification', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(
      EXISTING_FOLLOW as Awaited<ReturnType<typeof prisma.follow.findFirst>>
    );
    followMock().delete.mockResolvedValueOnce(EXISTING_FOLLOW);

    await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('does not call prisma.user.findUnique when self-follow is detected', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    await POST(makePostRequest(VIEWER_ID), { params: { userId: VIEWER_ID } });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 500 when follow.create throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      TARGET_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    followMock().findFirst.mockResolvedValueOnce(null);
    followMock().create.mockRejectedValueOnce(new Error('Unique constraint violation'));

    const res = await POST(makePostRequest(TARGET_ID), { params: { userId: TARGET_ID } });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

// ============================================================================
// PATCH /api/users/[userId] — owner-only update edge cases
// ============================================================================
describe('PATCH /api/users/[userId] — owner-only update', () => {
  const PATCH = userIdRoute.PATCH;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await PATCH(makePatchUserIdRequest(TARGET_ID, { name: 'New Name' }), {
      params: { userId: TARGET_ID },
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  it('returns 403 when authenticated user tries to patch another user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await PATCH(makePatchUserIdRequest(TARGET_ID, { name: 'Hacker' }), {
      params: { userId: TARGET_ID },
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/forbidden/i);
  });

  it('returns 400 when name is empty string (Zod min(1))', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await PATCH(makePatchUserIdRequest(VIEWER_ID, { name: '' }), {
      params: { userId: VIEWER_ID },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await PATCH(makePatchUserIdRequest(VIEWER_ID, { name: 'A'.repeat(101) }), {
      params: { userId: VIEWER_ID },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when bio exceeds 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await PATCH(makePatchUserIdRequest(VIEWER_ID, { bio: 'x'.repeat(501) }), {
      params: { userId: VIEWER_ID },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when image is not a valid URL', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await PATCH(makePatchUserIdRequest(VIEWER_ID, { image: 'not-a-url' }), {
      params: { userId: VIEWER_ID },
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 200 and updates name successfully (owner patching own profile)', async () => {
    const updatedUser = {
      id: VIEWER_ID,
      name: 'Updated Name',
      image: null,
      bio: null,
      city: null,
    };
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await PATCH(makePatchUserIdRequest(VIEWER_ID, { name: 'Updated Name' }), {
      params: { userId: VIEWER_ID },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Updated Name');
  });

  it('returns 200 for partial update with only bio provided', async () => {
    const updatedUser = {
      id: VIEWER_ID,
      name: 'Viewer User',
      image: null,
      bio: 'New bio',
      city: null,
    };
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await PATCH(makePatchUserIdRequest(VIEWER_ID, { bio: 'New bio' }), {
      params: { userId: VIEWER_ID },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.bio).toBe('New bio');
  });

  it('calls prisma.user.update with only city when only city is provided', async () => {
    const updatedUser = {
      id: VIEWER_ID,
      name: 'Viewer User',
      image: null,
      bio: null,
      city: 'Rome',
    };
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    await PATCH(makePatchUserIdRequest(VIEWER_ID, { city: 'Rome' }), {
      params: { userId: VIEWER_ID },
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ city: 'Rome' }),
        where: { id: VIEWER_ID },
      })
    );
    // name was not provided — should not appear in update data
    const callArg = vi.mocked(prisma.user.update).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(callArg.data).not.toHaveProperty('name');
  });

  it('returns 500 on database error during update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('update constraint'));

    const res = await PATCH(makePatchUserIdRequest(VIEWER_ID, { name: 'Valid Name' }), {
      params: { userId: VIEWER_ID },
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

// ============================================================================
// GET /api/users/me — edge cases
// ============================================================================
describe('GET /api/users/me — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await getMeHandler();

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 200 with email included (own profile)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await getMeHandler();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe('viewer@example.com');
  });

  it('includes follower, following, and ownedTrips counts', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await getMeHandler();
    const json = await res.json();

    expect(json.data._count.followers).toBe(4);
    expect(json.data._count.following).toBe(7);
    expect(json.data._count.ownedTrips).toBe(3);
  });

  it('returns empty arrays when user has no trips or saved activities', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await getMeHandler();
    const json = await res.json();

    expect(json.data.recentTrips).toEqual([]);
    expect(json.data.savedActivities).toEqual([]);
  });

  it('maps savedActivities to activity objects (not wrapper objects)', async () => {
    const savedActivityRecord = {
      id: 'saved-1',
      userId: VIEWER_ID,
      activityId: 'act-1',
      savedAt: new Date(),
      activity: {
        id: 'act-1',
        name: 'Snorkeling',
        category: 'NATURE',
        location: 'Maldives',
        cost: 80,
      },
    };

    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce(
      [savedActivityRecord] as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>
    );

    const res = await getMeHandler();
    const json = await res.json();

    // Route maps s => s.activity, so top-level object has name/category
    expect(json.data.savedActivities[0].name).toBe('Snorkeling');
    expect(json.data.savedActivities[0].category).toBe('NATURE');
    // Wrapper fields should not be present
    expect(json.data.savedActivities[0].savedAt).toBeUndefined();
  });

  it('returns 404 when session user is not found in DB', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await getMeHandler();

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('User not found');
  });
});

// ============================================================================
// PATCH /api/users/me — edge cases
// ============================================================================
describe('PATCH /api/users/me — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await patchMeHandler(makeMePatchRequest({ name: 'Test' }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 for empty name (Zod min(1))', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await patchMeHandler(makeMePatchRequest({ name: '' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
    expect(json.details).toBeDefined();
  });

  it('returns 400 for bio exceeding 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await patchMeHandler(makeMePatchRequest({ bio: 'B'.repeat(501) }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 for invalid travelStyle enum value', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);

    const res = await patchMeHandler(
      makeMePatchRequest({ preferences: { travelStyle: 'extreme' } })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 200 when updating display name only', async () => {
    const updatedUser = {
      id: VIEWER_ID,
      name: 'New Display Name',
      email: 'viewer@example.com',
      image: null,
      bio: null,
      city: null,
      phone: null,
      preferences: null,
    };
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await patchMeHandler(makeMePatchRequest({ name: 'New Display Name' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('New Display Name');
  });

  it('returns 200 when updating bio only', async () => {
    const updatedUser = {
      id: VIEWER_ID,
      name: 'Viewer User',
      email: 'viewer@example.com',
      image: null,
      bio: 'My updated bio',
      city: null,
      phone: null,
      preferences: null,
    };
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await patchMeHandler(makeMePatchRequest({ bio: 'My updated bio' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.bio).toBe('My updated bio');
  });

  it('merges new preferences with existing user preferences', async () => {
    const userWithPrefs = {
      ...ME_USER_DB,
      preferences: { travelStyle: 'adventure', language: 'en', timezone: 'UTC' },
    };
    const updatedUser = {
      id: VIEWER_ID,
      name: 'Viewer User',
      email: 'viewer@example.com',
      image: null,
      bio: null,
      city: null,
      phone: null,
      preferences: { travelStyle: 'cultural', language: 'en', timezone: 'UTC' },
    };

    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      userWithPrefs as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    await patchMeHandler(makeMePatchRequest({ preferences: { travelStyle: 'cultural' } }));

    // Merged preferences should preserve existing fields and override travelStyle
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preferences: expect.objectContaining({
            travelStyle: 'cultural',
            language: 'en',
            timezone: 'UTC',
          }),
        }),
      })
    );
  });

  it('does not include preferences in update data when preferences not provided', async () => {
    const updatedUser = {
      id: VIEWER_ID,
      name: 'New Name',
      email: 'viewer@example.com',
      image: null,
      bio: null,
      city: null,
      phone: null,
      preferences: { travelStyle: 'adventure', language: 'en' },
    };

    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      updatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    await patchMeHandler(makeMePatchRequest({ name: 'New Name' }));

    const callArg = vi.mocked(prisma.user.update).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // mergedPreferences is undefined when preferences not provided
    expect(callArg.data.preferences).toBeUndefined();
  });

  it('accepts all valid travelStyle enum values without validation error', async () => {
    const validStyles = ['adventure', 'relaxation', 'cultural', 'family', 'solo'] as const;

    for (const style of validStyles) {
      vi.clearAllMocks();
      vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );
      vi.mocked(prisma.user.update).mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.user.update>>
      );

      const res = await patchMeHandler(
        makeMePatchRequest({ preferences: { travelStyle: style } })
      );
      expect(res.status).toBe(200);
    }
  });

  it('returns 500 on database error during update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(VIEWER_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER_DB as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB write failed'));

    const res = await patchMeHandler(makeMePatchRequest({ bio: 'test' }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to update profile');
  });
});
