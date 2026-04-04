/**
 * Unit tests for the Users API route handlers.
 *
 * Routes:
 *  - GET  /api/users/[userId]   — fetch public user profile
 *  - POST /api/users/[userId]   — follow / unfollow user
 *  - GET  /api/health           — health check endpoint
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked.
 * - Handlers are invoked directly with a minimal Request object.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import * as healthRoute from '@/app/api/health/route';
import * as usersRoute from '@/app/api/users/[userId]/route';

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — extend global setup
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
      },
      follow: {
        findFirst: vi.fn(),
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
      },
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, { method: 'GET' });
}

function makePostRequest(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/users/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

const mockSession = { user: { id: 'user-1', name: 'Tester', email: 'test@test.com' } };
const otherSession = { user: { id: 'user-2', name: 'Other', email: 'other@test.com' } };

const mockUser = {
  id: 'user-2',
  name: 'Target User',
  email: 'target@example.com',
  emailVerified: null,
  password: null,
  image: null,
  bio: 'I love travel',
  city: 'New York',
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
  _count: { followers: 5, following: 3, ownedTrips: 10 },
};

// ---------------------------------------------------------------------------
// GET /api/users/[userId]
// ---------------------------------------------------------------------------
describe('GET /api/users/[userId]', () => {
  const GET = usersRoute.GET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when user does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await GET(makeGetRequest('nonexistent'), { params: { userId: 'nonexistent' } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 200 with user data when found (unauthenticated)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([]);

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Target User');
  });

  it('returns isFollowing: false when not following', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.follow.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([]);

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    const json = await res.json();
    expect(json.data.isFollowing).toBe(false);
  });

  it('returns isFollowing: true when following', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.follow.findFirst).mockResolvedValue({ id: 'follow-1', followerId: 'user-1', followingId: 'user-2', createdAt: new Date() } as Awaited<ReturnType<typeof prisma.follow.findFirst>>);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([]);

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    const json = await res.json();
    expect(json.data.isFollowing).toBe(true);
  });

  it('hides isFollowing check when viewing own profile', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const ownUser = { ...mockUser, id: 'user-1' };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ownUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([]);

    const res = await GET(makeGetRequest('user-1'), { params: { userId: 'user-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    // follow check is skipped for own profile — isFollowing should be false
    expect(json.data.isFollowing).toBe(false);
  });

  it('includes public trips in response', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { id: 'trip-1', title: 'Paris Trip', destination: { city: 'Paris', country: 'France' }, startDate: new Date(), endDate: new Date(), status: 'PLANNING', _count: { members: 3, activities: 5 } },
    ] as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>);

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    const json = await res.json();
    expect(json.data.publicTrips).toHaveLength(1);
  });

  it('returns 500 on database error', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB error'));

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/[userId] — follow / unfollow
// ---------------------------------------------------------------------------
describe('POST /api/users/[userId] (follow/unfollow)', () => {
  const POST = usersRoute.POST;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makePostRequest('user-2'), { params: { userId: 'user-2' } });
    expect(res.status).toBe(401);
  });

  it('returns 400 when trying to follow yourself', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makePostRequest('user-1'), { params: { userId: 'user-1' } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/yourself/i);
  });

  it('returns 404 when target user does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await POST(makePostRequest('nonexistent'), { params: { userId: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('follows a user when not already following', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.follow.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.follow.create).mockResolvedValue({ id: 'follow-1', followerId: 'user-1', followingId: 'user-2', createdAt: new Date() });
    vi.mocked(prisma.notification.create).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.notification.create>>);

    const res = await POST(makePostRequest('user-2'), { params: { userId: 'user-2' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isFollowing).toBe(true);
    expect(json.message).toBe('Following');
  });

  it('unfollows a user when already following', async () => {
    vi.mocked(getServerSession).mockResolvedValue(otherSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, id: 'user-1' } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.follow.findFirst).mockResolvedValue({ id: 'follow-1', followerId: 'user-2', followingId: 'user-1', createdAt: new Date() } as Awaited<ReturnType<typeof prisma.follow.findFirst>>);
    vi.mocked(prisma.follow.delete).mockResolvedValue({ id: 'follow-1', followerId: 'user-2', followingId: 'user-1', createdAt: new Date() });

    const res = await POST(makePostRequest('user-1'), { params: { userId: 'user-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isFollowing).toBe(false);
    expect(json.message).toBe('Unfollowed');
  });

  it('creates a FOLLOW notification when following', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.follow.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.follow.create).mockResolvedValue({ id: 'follow-1', followerId: 'user-1', followingId: 'user-2', createdAt: new Date() });
    vi.mocked(prisma.notification.create).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.notification.create>>);

    await POST(makePostRequest('user-2'), { params: { userId: 'user-2' } });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'FOLLOW', userId: 'user-2' }),
      })
    );
  });

  it('returns 500 on database error', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB error'));

    const res = await POST(makePostRequest('user-2'), { params: { userId: 'user-2' } });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
describe('GET /api/health', () => {
  const GET = healthRoute.GET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with ok status when database is healthy', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.database).toBe('connected');
  });

  it('returns 503 with degraded status when database is down', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Connection refused'));

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe('degraded');
    expect(json.database).toBe('error');
  });

  it('includes timestamp in response', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();
    expect(json.timestamp).toBeDefined();
    expect(new Date(json.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('returns minimal response shape (no environment or nested checks)', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();
    // Health route intentionally omits NODE_ENV/version to reduce info exposure
    expect(json.environment).toBeUndefined();
    expect(json.checks).toBeUndefined();
    expect(json.database).toBeDefined();
  });

  it('includes database field in response on success', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();
    expect(json.database).toBe('connected');
  });
});
