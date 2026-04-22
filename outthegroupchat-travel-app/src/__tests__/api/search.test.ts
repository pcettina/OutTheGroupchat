/**
 * Unit tests for the Global Search API route handler.
 *
 * Route: GET /api/search
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked via setup.ts.
 * - The handler is called directly with minimal Request objects.
 * - Tests cover: auth guard, Zod validation, short-query early return,
 *   people-first ordering for type=all, type filtering (people/meetups/venues/trips/activities),
 *   privacy (email not exposed), and DB error → 500.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/search/route';

const mockGetServerSession = vi.mocked(getServerSession);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  user: { id: 'user-search-001', name: 'Search Tester', email: 'search@example.com' },
  expires: '2099-01-01',
};

const MOCK_USER = {
  id: 'user-other-001',
  name: 'Alex Chicago',
  image: null,
  city: 'Chicago',
  bio: 'Loves live music',
  _count: { followers: 50, ownedTrips: 5 },
};

const MOCK_MEETUP = {
  id: 'meetup-search-001',
  title: 'Chicago Jazz Night',
  scheduledAt: new Date('2026-06-10T20:00:00Z'),
  venue: { name: 'Green Mill' },
};

const MOCK_VENUE = {
  id: 'venue-search-001',
  name: 'Green Mill Cocktail Lounge',
  address: '4802 N Broadway',
  city: 'Chicago',
  category: 'Bar',
};

const MOCK_TRIP = {
  id: 'trip-search-001',
  title: 'Chicago Weekend',
  description: 'Quick trip to Chicago',
  destination: { city: 'Chicago', country: 'USA' },
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-07-03'),
  status: 'PLANNING',
  isPublic: true,
  owner: { id: 'user-search-001', name: 'Search Tester', image: null },
  _count: { members: 2 },
};

const MOCK_ACTIVITY = {
  id: 'activity-search-001',
  name: 'Chicago Architecture Boat Tour',
  description: 'See Chicago from the river',
  category: 'Sightseeing',
  location: { city: 'Chicago' },
  cost: 45,
  priceRange: 'MODERATE',
  trip: { id: 'trip-search-001', title: 'Chicago Weekend', destination: { city: 'Chicago' } },
  _count: { savedBy: 12, ratings: 8 },
};

function makeRequest(path: string): Request {
  return new Request(`http://localhost:3000${path}`, { method: 'GET' });
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findMany).mockResolvedValue([]);
  vi.mocked(prisma.meetup.findMany).mockResolvedValue([]);
  vi.mocked(prisma.venue.findMany).mockResolvedValue([]);
  vi.mocked(prisma.trip.findMany).mockResolvedValue([]);
  vi.mocked(prisma.activity.findMany).mockResolvedValue([]);
});

// ===========================================================================
// Auth guard
// ===========================================================================
describe('GET /api/search — auth guard', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest('/api/search?q=chicago'));
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
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('returns 400 for an invalid type parameter', async () => {
    const res = await GET(makeRequest('/api/search?q=chicago&type=invalid'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 when limit exceeds 50', async () => {
    const res = await GET(makeRequest('/api/search?q=chicago&limit=100'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 when limit is less than 1', async () => {
    const res = await GET(makeRequest('/api/search?q=chicago&limit=0'));
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
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('returns empty arrays without querying DB when q is missing', async () => {
    const res = await GET(makeRequest('/api/search'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ trips: [], activities: [], users: [], meetups: [], venues: [] });
    expect(vi.mocked(prisma.user.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.meetup.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.venue.findMany)).not.toHaveBeenCalled();
  });

  it('returns empty arrays without querying DB when q is 1 character', async () => {
    const res = await GET(makeRequest('/api/search?q=c'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ trips: [], activities: [], users: [], meetups: [], venues: [] });
    expect(vi.mocked(prisma.user.findMany)).not.toHaveBeenCalled();
  });

  it('queries DB when q is 2 or more characters', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.meetup.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.activity.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeRequest('/api/search?q=ch'));

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.findMany)).toHaveBeenCalled();
  });
});

// ===========================================================================
// type=all — people-first ordering
// ===========================================================================
describe('GET /api/search — type=all (people-first ordering)', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('returns users, meetups, venues, trips, and activities with people-first key order', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([MOCK_USER as never]);
    vi.mocked(prisma.meetup.findMany).mockResolvedValueOnce([MOCK_MEETUP as never]);
    vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([MOCK_VENUE as never]);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([MOCK_TRIP as never]);
    vi.mocked(prisma.activity.findMany).mockResolvedValueOnce([MOCK_ACTIVITY as never]);

    const res = await GET(makeRequest('/api/search?q=chicago'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.users).toHaveLength(1);
    expect(body.data.meetups).toHaveLength(1);
    expect(body.data.venues).toHaveLength(1);
    expect(body.data.trips).toHaveLength(1);
    expect(body.data.activities).toHaveLength(1);
  });

  it('people-first: response keys appear with users before meetups', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([MOCK_USER as never]);
    vi.mocked(prisma.meetup.findMany).mockResolvedValueOnce([MOCK_MEETUP as never]);
    vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.activity.findMany).mockResolvedValueOnce([]);

    const res = await GET(makeRequest('/api/search?q=chicago'));
    const body = await parseJson(res);

    const keys = Object.keys(body.data);
    expect(keys.indexOf('users')).toBeLessThan(keys.indexOf('meetups'));
    expect(keys.indexOf('meetups')).toBeLessThan(keys.indexOf('venues'));
  });

  it('passes limit to all Prisma queries', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.meetup.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.activity.findMany).mockResolvedValueOnce([]);

    await GET(makeRequest('/api/search?q=chicago&limit=5'));

    expect(vi.mocked(prisma.user.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
    expect(vi.mocked(prisma.meetup.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
    expect(vi.mocked(prisma.venue.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });

  it('defaults to limit=10 when not specified', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.meetup.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.activity.findMany).mockResolvedValueOnce([]);

    await GET(makeRequest('/api/search?q=chicago'));

    expect(vi.mocked(prisma.user.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });
});

// ===========================================================================
// type=people (alias for users)
// ===========================================================================
describe('GET /api/search — type=people', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('only queries users when type=people', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([MOCK_USER as never]);

    const res = await GET(makeRequest('/api/search?q=chicago&type=people'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.users).toHaveLength(1);
    expect(body.data.meetups).toBeUndefined();
    expect(body.data.venues).toBeUndefined();
    expect(body.data.trips).toBeUndefined();
    expect(vi.mocked(prisma.meetup.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.venue.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.trip.findMany)).not.toHaveBeenCalled();
  });

  it('does not expose email in user results (privacy)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([MOCK_USER as never]);

    const res = await GET(makeRequest('/api/search?q=chicago&type=people'));
    const body = await parseJson(res);

    body.data.users.forEach((u: Record<string, unknown>) => {
      expect(u.email).toBeUndefined();
    });
  });
});

// ===========================================================================
// type=users
// ===========================================================================
describe('GET /api/search — type=users', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('only queries users when type=users', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([MOCK_USER as never]);

    const res = await GET(makeRequest('/api/search?q=chicago&type=users'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.users).toHaveLength(1);
    expect(body.data.trips).toBeUndefined();
    expect(body.data.meetups).toBeUndefined();
    expect(vi.mocked(prisma.trip.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.meetup.findMany)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// type=meetups
// ===========================================================================
describe('GET /api/search — type=meetups', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('only queries meetups when type=meetups', async () => {
    vi.mocked(prisma.meetup.findMany).mockResolvedValueOnce([MOCK_MEETUP as never]);

    const res = await GET(makeRequest('/api/search?q=jazz&type=meetups'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.meetups).toHaveLength(1);
    expect(body.data.meetups[0].title).toBe('Chicago Jazz Night');
    expect(body.data.meetups[0].venue).toEqual({ name: 'Green Mill' });
    expect(body.data.users).toBeUndefined();
    expect(body.data.venues).toBeUndefined();
    expect(vi.mocked(prisma.user.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.venue.findMany)).not.toHaveBeenCalled();
  });

  it('queries meetups by title contains', async () => {
    vi.mocked(prisma.meetup.findMany).mockResolvedValueOnce([]);

    await GET(makeRequest('/api/search?q=jazz&type=meetups'));

    expect(vi.mocked(prisma.meetup.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          title: expect.objectContaining({ contains: 'jazz', mode: 'insensitive' }),
        }),
      })
    );
  });
});

// ===========================================================================
// type=venues
// ===========================================================================
describe('GET /api/search — type=venues', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('only queries venues when type=venues', async () => {
    vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([MOCK_VENUE as never]);

    const res = await GET(makeRequest('/api/search?q=green+mill&type=venues'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.venues).toHaveLength(1);
    expect(body.data.venues[0].name).toBe('Green Mill Cocktail Lounge');
    expect(body.data.venues[0].city).toBe('Chicago');
    expect(body.data.venues[0].category).toBe('Bar');
    expect(body.data.users).toBeUndefined();
    expect(body.data.meetups).toBeUndefined();
    expect(vi.mocked(prisma.user.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.meetup.findMany)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// type=trips
// ===========================================================================
describe('GET /api/search — type=trips', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('only queries trips when type=trips', async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([MOCK_TRIP as never]);

    const res = await GET(makeRequest('/api/search?q=chicago&type=trips'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trips).toHaveLength(1);
    expect(body.data.users).toBeUndefined();
    expect(body.data.meetups).toBeUndefined();
    expect(vi.mocked(prisma.user.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.meetup.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.activity.findMany)).not.toHaveBeenCalled();
  });

  it('passes session user id to trip query for access control', async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    await GET(makeRequest('/api/search?q=chicago&type=trips'));

    expect(vi.mocked(prisma.trip.findMany)).toHaveBeenCalledWith(
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
// type=activities
// ===========================================================================
describe('GET /api/search — type=activities', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('only queries activities when type=activities', async () => {
    vi.mocked(prisma.activity.findMany).mockResolvedValueOnce([MOCK_ACTIVITY as never]);

    const res = await GET(makeRequest('/api/search?q=tour&type=activities'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.trips).toBeUndefined();
    expect(body.data.users).toBeUndefined();
    expect(vi.mocked(prisma.trip.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.findMany)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Error handling
// ===========================================================================
describe('GET /api/search — error handling', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('returns 500 when a DB query throws', async () => {
    vi.mocked(prisma.user.findMany).mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await GET(makeRequest('/api/search?q=chicago'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Search failed');
  });
});
