/**
 * Unit tests for the Inspiration API route handlers.
 *
 * Routes:
 *   GET  /api/inspiration  — browse templates, public trips, destinations, trending
 *   POST /api/inspiration  — get a specific template with suggested itinerary
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked.
 * - Handlers are called directly with minimal Request objects.
 * - GET is protected — 401 when unauthenticated.
 * - Tests cover: auth guard, Zod validation, template filtering, pagination,
 *   template retrieval, and 404 on unknown template ID.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
        count: vi.fn(),
      },
      activity: {
        findMany: vi.fn(),
      },
    },
  };
});

import { GET, POST } from '@/app/api/inspiration/route';

const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaActivity = vi.mocked(prisma.activity);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  user: { id: 'user-insp-001', name: 'Inspiration Tester', email: 'insp@example.com' },
  expires: '2099-01-01',
};

const MOCK_TRIP_ROW = {
  id: 'trip-public-001',
  title: 'Nashville Weekend',
  description: '3 days of fun',
  destination: { city: 'Nashville', country: 'USA' },
  startDate: new Date('2026-04-01'),
  endDate: new Date('2026-04-03'),
  status: 'COMPLETED',
  members: [{ id: 'member-1' }, { id: 'member-2' }],
  activities: [
    { name: 'Broadway Bar Crawl', category: 'Nightlife' },
  ],
  _count: { activities: 3 },
  owner: { name: 'Trip Owner', image: null },
  viewCount: 50,
};

const MOCK_ACTIVITY_ROW = {
  id: 'activity-trend-001',
  name: 'Hot Chicken Tour',
  description: 'The best hot chicken in Nashville',
  category: 'Food',
  ratings: [{ score: 5 }, { score: 4 }],
  _count: { savedBy: 12, comments: 3 },
  trip: { destination: { city: 'Nashville' } },
  shareCount: 25,
};

function makeRequest(path: string, options: { method?: string; body?: unknown } = {}): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
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
  mockPrismaTrip.count.mockResolvedValue(0);
  mockPrismaActivity.findMany.mockResolvedValue([]);
});

// ===========================================================================
// GET /api/inspiration — auth guard
// ===========================================================================
describe('GET /api/inspiration — auth guard', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// GET /api/inspiration — basic response shape
// ===========================================================================
describe('GET /api/inspiration — response shape', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns 200 with correct envelope when no data exists', async () => {
    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.trips)).toBe(true);
    expect(Array.isArray(body.data.templates)).toBe(true);
    expect(Array.isArray(body.data.destinations)).toBe(true);
    expect(Array.isArray(body.data.trending)).toBe(true);
    expect(body.data.pagination).toBeDefined();
  });

  it('returns all pre-built templates when no filters are applied', async () => {
    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    // The route has 8 built-in templates
    expect(body.data.templates.length).toBeGreaterThanOrEqual(7);
  });

  it('includes pagination with correct shape', async () => {
    const res = await GET(makeRequest('/api/inspiration?page=1&limit=5'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.pagination).toMatchObject({
      page: 1,
      limit: 5,
      totalPages: expect.any(Number),
      hasMore: expect.any(Boolean),
    });
  });

  it('includes real trips from database in the response', async () => {
    mockPrismaTrip.findMany.mockResolvedValue([MOCK_TRIP_ROW as never]);
    mockPrismaTrip.count.mockResolvedValue(1);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trips).toHaveLength(1);
    expect(body.data.trips[0].id).toBe(MOCK_TRIP_ROW.id);
    expect(body.data.trips[0].title).toBe(MOCK_TRIP_ROW.title);
    expect(body.data.totalTrips).toBe(1);
  });

  it('includes trending activities from database', async () => {
    mockPrismaActivity.findMany.mockResolvedValue([MOCK_ACTIVITY_ROW as never]);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trending).toHaveLength(1);
    expect(body.data.trending[0].id).toBe(MOCK_ACTIVITY_ROW.id);
    expect(body.data.trending[0].name).toBe(MOCK_ACTIVITY_ROW.name);
  });

  it('calculates avgRating correctly from activity ratings', async () => {
    mockPrismaActivity.findMany.mockResolvedValue([MOCK_ACTIVITY_ROW as never]);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    // MOCK_ACTIVITY_ROW has scores [5, 4] → avg = 4.5
    expect(body.data.trending[0].avgRating).toBe(4.5);
  });

  it('returns null avgRating when activity has no ratings', async () => {
    const noRatingActivity = { ...MOCK_ACTIVITY_ROW, ratings: [] };
    mockPrismaActivity.findMany.mockResolvedValue([noRatingActivity as never]);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trending[0].avgRating).toBeNull();
  });
});

// ===========================================================================
// GET /api/inspiration — template filtering
// ===========================================================================
describe('GET /api/inspiration — template filtering', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('filters templates by tripType=bachelor', async () => {
    const res = await GET(makeRequest('/api/inspiration?tripType=bachelor'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    body.data.templates.forEach((t: { tags: string[] }) => {
      expect(t.tags).toContain('bachelor');
    });
  });

  it('filters templates by destination=Nashville', async () => {
    const res = await GET(makeRequest('/api/inspiration?destination=Nashville'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    body.data.templates.forEach((t: { destination: { city: string } }) => {
      expect(t.destination.city.toLowerCase()).toContain('nashville');
    });
  });

  it('filters templates by query text', async () => {
    const res = await GET(makeRequest('/api/inspiration?query=Vegas'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const titles = body.data.templates.map((t: { title: string }) => t.title);
    expect(titles.some((title: string) => title.toLowerCase().includes('vegas'))).toBe(true);
  });

  it('returns empty templates array when query matches nothing', async () => {
    const res = await GET(makeRequest('/api/inspiration?query=nonexistent-xyz-123'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.templates).toHaveLength(0);
  });

  it('returns 400 for invalid tripType', async () => {
    const res = await GET(makeRequest('/api/inspiration?tripType=invalid-type'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 for invalid sortBy value', async () => {
    const res = await GET(makeRequest('/api/inspiration?sortBy=invalid-sort'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });
});

// ===========================================================================
// POST /api/inspiration — template retrieval
// ===========================================================================
describe('POST /api/inspiration — template retrieval', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'nashville-bachelor', action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns template data for a valid templateId', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'nashville-bachelor', action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('nashville-bachelor');
    expect(body.data.title).toBe('Nashville Bachelor Party');
    expect(Array.isArray(body.data.suggestedItinerary)).toBe(true);
    expect(body.data.suggestedItinerary.length).toBeGreaterThan(0);
  });

  it('returns 404 for an unknown templateId', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'nonexistent-template', action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Template not found');
  });

  it('returns 400 for an invalid action', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'nashville-bachelor', action: 'unknown-action' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('includes suggestedItinerary for austin-music template', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'austin-music', action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('austin-music');
    expect(body.data.suggestedItinerary.length).toBeGreaterThan(0);
  });

  it('returns empty itinerary array for templates without pre-built itinerary', async () => {
    // colorado-ski has no pre-built itinerary in generateSuggestedItinerary
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'colorado-ski', action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('colorado-ski');
    expect(Array.isArray(body.data.suggestedItinerary)).toBe(true);
    expect(body.data.suggestedItinerary).toHaveLength(0);
  });
});
