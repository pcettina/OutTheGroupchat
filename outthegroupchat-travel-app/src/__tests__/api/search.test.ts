/**
 * Unit tests for the Global Search API route handler.
 *
 * Route: GET /api/search
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked.
 * - The handler is called directly with minimal Request objects.
 * - Tests cover: auth guard, Zod validation, short-query early return,
 *   trip search, activity search, user search, type filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      trip: {
        findMany: vi.fn(),
      },
      activity: {
        findMany: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from '@/app/api/search/route';

const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaUser = vi.mocked(prisma.user);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  user: { id: 'user-search-001', name: 'Search Tester', email: 'search@example.com' },
  expires: '2099-01-01',
};

const MOCK_TRIP = {
  id: 'trip-search-001',
  title: 'Tokyo Adventure',
  description: 'A week in Tokyo',
  destination: { city: 'Tokyo', country: 'Japan' },
  startDate: new Date('2026-05-01'),
  endDate: new Date('2026-05-08'),
  status: 'PLANNING',
  isPublic: true,
  owner: { id: 'user-search-001', name: 'Search Tester', image: null },
  _count: { members: 3 },
};

const MOCK_ACTIVITY = {
  id: 'activity-search-001',
  name: 'Shibuya Crossing',
  description: 'Famous Tokyo crossing',
  category: 'Sightseeing',
  location: { city: 'Tokyo' },
  cost: 0,
  priceRange: 'FREE',
  trip: { id: 'trip-search-001', title: 'Tokyo Adventure', destination: { city: 'Tokyo' } },
  _count: { savedBy: 10, ratings: 5 },
};

const MOCK_USER = {
  id: 'user-other-001',
  name: 'Tokyo Traveler',
  image: null,
  city: 'Tokyo',
  bio: 'Loves Japan',
  _count: { followers: 50, ownedTrips: 5 },
};

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { method: 'GET' });
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockPrismaTrip.findMany.mockResolvedValue([]);
  mockPrismaActivity.findMany.mockResolvedValue([]);
  mockPrismaUser.findMany.mockResolvedValue([]);
});

// ===========================================================================
// Auth guard
// ===========================================================================
describe('GET /api/search — auth guard', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await GET(makeRequest('/api/search?q=tokyo'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// Input validation (Zod)
// ===========================================================================
describe('GET /api/search — input validation', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns 400 for an invalid type parameter', async () => {
    const res = await GET(makeRequest('/api/search?q=tokyo&type=invalid'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 when limit exceeds 50', async () => {
    const res = await GET(makeRequest('/api/search?q=tokyo&limit=100'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 when limit is less than 1', async () => {
    const res = await GET(makeRequest('/api/search?q=tokyo&limit=0'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });
});

// ===========================================================================
// Short-query early return
// ===========================================================================
describe('GET /api/search — short query handling', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns empty results without querying DB when q is empty', async () => {
    const res = await GET(makeRequest('/api/search?q='));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ trips: [], activities: [], users: [] });
    expect(mockPrismaTrip.findMany).not.toHaveBeenCalled();
  });

  it('returns empty results without querying DB when q is 1 character', async () => {
    const res = await GET(makeRequest('/api/search?q=t'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ trips: [], activities: [], users: [] });
    expect(mockPrismaTrip.findMany).not.toHaveBeenCalled();
  });

  it('queries DB when q is 2 characters or more', async () => {
    const res = await GET(makeRequest('/api/search?q=to'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(mockPrismaTrip.findMany).toHaveBeenCalled();
  });
});

// ===========================================================================
// Search — all types
// ===========================================================================
describe('GET /api/search — type=all (default)', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns trips, activities, and users when type=all', async () => {
    mockPrismaTrip.findMany.mockResolvedValue([MOCK_TRIP as never]);
    mockPrismaActivity.findMany.mockResolvedValue([MOCK_ACTIVITY as never]);
    mockPrismaUser.findMany.mockResolvedValue([MOCK_USER as never]);

    const res = await GET(makeRequest('/api/search?q=tokyo'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.trips).toHaveLength(1);
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.users).toHaveLength(1);
  });

  it('passes the session user id to trip query for access control', async () => {
    await GET(makeRequest('/api/search?q=tokyo'));

    expect(mockPrismaTrip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ ownerId: MOCK_SESSION.user.id }),
            ]),
          }),
        }),
      })
    );
  });
});

// ===========================================================================
// Search — type=trips
// ===========================================================================
describe('GET /api/search — type=trips', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    mockPrismaTrip.findMany.mockResolvedValue([MOCK_TRIP as never]);
  });

  it('only queries trips when type=trips', async () => {
    const res = await GET(makeRequest('/api/search?q=tokyo&type=trips'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trips).toHaveLength(1);
    expect(body.data.activities).toBeUndefined();
    expect(body.data.users).toBeUndefined();
    expect(mockPrismaActivity.findMany).not.toHaveBeenCalled();
    expect(mockPrismaUser.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Search — type=activities
// ===========================================================================
describe('GET /api/search — type=activities', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    mockPrismaActivity.findMany.mockResolvedValue([MOCK_ACTIVITY as never]);
  });

  it('only queries activities when type=activities', async () => {
    const res = await GET(makeRequest('/api/search?q=shibuya&type=activities'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.trips).toBeUndefined();
    expect(body.data.users).toBeUndefined();
    expect(mockPrismaTrip.findMany).not.toHaveBeenCalled();
    expect(mockPrismaUser.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Search — type=users
// ===========================================================================
describe('GET /api/search — type=users', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    mockPrismaUser.findMany.mockResolvedValue([MOCK_USER as never]);
  });

  it('only queries users when type=users', async () => {
    const res = await GET(makeRequest('/api/search?q=tokyo&type=users'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.users).toHaveLength(1);
    expect(body.data.trips).toBeUndefined();
    expect(body.data.activities).toBeUndefined();
    expect(mockPrismaTrip.findMany).not.toHaveBeenCalled();
    expect(mockPrismaActivity.findMany).not.toHaveBeenCalled();
  });

  it('does not expose user email in results (privacy)', async () => {
    const res = await GET(makeRequest('/api/search?q=tokyo&type=users'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    body.data.users.forEach((u: Record<string, unknown>) => {
      expect(u.email).toBeUndefined();
    });
  });
});

// ===========================================================================
// Limit parameter
// ===========================================================================
describe('GET /api/search — limit parameter', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('passes limit to Prisma take parameter', async () => {
    await GET(makeRequest('/api/search?q=tokyo&limit=5'));

    expect(mockPrismaTrip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it('defaults to limit=10 when not specified', async () => {
    await GET(makeRequest('/api/search?q=tokyo'));

    expect(mockPrismaTrip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });
});
