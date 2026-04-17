/**
 * Unit tests for the Users API route handlers.
 *
 * Routes:
 *  - GET   /api/users/[userId]   — fetch public user profile (with crewCount)
 *  - PATCH /api/users/[userId]   — owner updates name / bio / city / crewLabel
 *  - GET   /api/health           — health check endpoint
 *
 * The POST follow/unfollow branch was removed in Phase 3 Part B —
 * Crew requests now happen via /api/crew/request and are wired through
 * <CrewButton>. isFollowing / publicTrips are no longer returned by GET.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import * as healthRoute from '@/app/api/health/route';
import * as usersRoute from '@/app/api/users/[userId]/route';

// ---------------------------------------------------------------------------
// Prisma mock extension (crew.count needed for the new GET response shape).
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
      crew: {
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
  };
});

function makeGetRequest(userId: string): Request {
  return new Request(`http://localhost/api/users/${userId}`);
}

function makePatchRequest(userId: string, body: unknown): Request {
  return new Request(`http://localhost/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockSession = { user: { id: 'user-1', name: 'Tester', email: 'test@test.com' } };

const mockUser = {
  id: 'user-2',
  name: 'Target User',
  email: 'target@example.com',
  emailVerified: null,
  password: null,
  image: null,
  bio: 'I love travel',
  city: 'New York',
  crewLabel: null as string | null,
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
  _count: { ownedTrips: 10 },
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

  it('returns 200 with user data and crewCount when found (unauthenticated)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.crew.count).mockResolvedValue(4);

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Target User');
    expect(json.data.crewCount).toBe(4);
  });

  it('crew.count filters by ACCEPTED status and either side of the pair', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.crew.count).mockResolvedValue(0);

    await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });

    expect(prisma.crew.count).toHaveBeenCalledWith({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: 'user-2' }, { userBId: 'user-2' }],
      },
    });
  });

  it('does not include isFollowing field on the response (removed in Phase 3 Part B)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.crew.count).mockResolvedValue(0);

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    const json = await res.json();
    expect(json.data.isFollowing).toBeUndefined();
    expect(json.data.publicTrips).toBeUndefined();
  });

  it('exposes crewLabel field on the response', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      crewLabel: 'Squad',
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.crew.count).mockResolvedValue(2);

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    const json = await res.json();
    expect(json.data.crewLabel).toBe('Squad');
  });

  it('returns 500 on database error', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('DB error'));

    const res = await GET(makeGetRequest('user-2'), { params: { userId: 'user-2' } });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/[userId]
// ---------------------------------------------------------------------------
describe('PATCH /api/users/[userId]', () => {
  const PATCH = usersRoute.PATCH;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest('user-2', { name: 'New' }), {
      params: { userId: 'user-2' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when updating someone else', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await PATCH(makePatchRequest('user-2', { name: 'New' }), {
      params: { userId: 'user-2' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid crewLabel (symbols)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await PATCH(makePatchRequest('user-1', { crewLabel: 'Squad!!' }), {
      params: { userId: 'user-1' },
    });
    expect(res.status).toBe(400);
  });

  it('accepts a valid crewLabel and returns updated row', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'user-1',
      name: 'Tester',
      image: null,
      bio: null,
      city: null,
      crewLabel: 'Squad',
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const res = await PATCH(makePatchRequest('user-1', { crewLabel: 'Squad' }), {
      params: { userId: 'user-1' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.crewLabel).toBe('Squad');
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
