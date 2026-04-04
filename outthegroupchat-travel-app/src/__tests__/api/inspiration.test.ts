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
        count: vi.fn(),
      },
      activity: {
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

function makeRequest(path: string, options: { method?: string; body?: unknown } = {}): NextRequest {
  const url = `http://localhost:3000${path}`;
  const method = options.method ?? 'GET';
  if (options.body !== undefined) {
    return new NextRequest(url, {
      method,
      body: JSON.stringify(options.body),
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new NextRequest(url, { method });
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

  it('returns 400 when templateId is missing', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when action is missing', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'nashville-bachelor' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when body is completely empty', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: {},
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns template data for miami-beach with itinerary', async () => {
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'miami-beach', action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('miami-beach');
    expect(body.data.suggestedItinerary.length).toBeGreaterThan(0);
  });

  it('returns template data for nola-jazz with empty itinerary', async () => {
    // nola-jazz has no pre-built itinerary
    const res = await POST(makeRequest('/api/inspiration', {
      method: 'POST',
      body: { templateId: 'nola-jazz', action: 'get-template' },
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('nola-jazz');
    expect(Array.isArray(body.data.suggestedItinerary)).toBe(true);
  });

  it('returns 500 when an unexpected error occurs during POST', async () => {
    // Force req.json() to throw by passing an invalid content-type body
    const url = 'http://localhost:3000/api/inspiration';
    const badReq = new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });

    const res = await POST(badReq);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to process request');
  });
});

// ===========================================================================
// GET /api/inspiration — sorting
// ===========================================================================
describe('GET /api/inspiration — sorting', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('sorts templates by usageCount desc when sortBy=popular', async () => {
    const res = await GET(makeRequest('/api/inspiration?sortBy=popular'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const templates = body.data.templates as Array<{ usageCount: number }>;
    for (let i = 0; i < templates.length - 1; i++) {
      expect(templates[i].usageCount).toBeGreaterThanOrEqual(templates[i + 1].usageCount);
    }
  });

  it('sorts templates by rating desc when sortBy=rating', async () => {
    const res = await GET(makeRequest('/api/inspiration?sortBy=rating'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const templates = body.data.templates as Array<{ rating: number }>;
    for (let i = 0; i < templates.length - 1; i++) {
      expect(templates[i].rating).toBeGreaterThanOrEqual(templates[i + 1].rating);
    }
  });

  it('accepts sortBy=recent without error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const res = await GET(makeRequest('/api/inspiration?sortBy=recent'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.templates)).toBe(true);
  });

  it('accepts sortBy=budget-low without error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const res = await GET(makeRequest('/api/inspiration?sortBy=budget-low'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('accepts sortBy=budget-high without error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const res = await GET(makeRequest('/api/inspiration?sortBy=budget-high'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ===========================================================================
// GET /api/inspiration — pagination
// ===========================================================================
describe('GET /api/inspiration — pagination', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('defaults to page=1 and limit=12', async () => {
    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(12);
  });

  it('correctly calculates hasMore=true when more trips exist', async () => {
    // 3 trips returned, but totalCount is 10 — page=1, limit=3 → hasMore=true
    const tripRows = [MOCK_TRIP_ROW, MOCK_TRIP_ROW, MOCK_TRIP_ROW];
    mockPrismaTrip.findMany.mockResolvedValueOnce(tripRows as never[]);
    mockPrismaTrip.count.mockResolvedValueOnce(10);

    const res = await GET(makeRequest('/api/inspiration?page=1&limit=3'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.pagination.hasMore).toBe(true);
    expect(body.data.pagination.totalPages).toBe(4); // ceil(10/3) = 4
  });

  it('correctly calculates hasMore=false on last page', async () => {
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_TRIP_ROW] as never[]);
    mockPrismaTrip.count.mockResolvedValueOnce(4);

    // page=2, limit=3 → skip=3, 1 result returned → 3+1=4 == totalCount → no more
    const res = await GET(makeRequest('/api/inspiration?page=2&limit=3'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.pagination.hasMore).toBe(false);
  });

  it('returns 400 when page is less than 1', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const res = await GET(makeRequest('/api/inspiration?page=0'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when limit exceeds maximum of 50', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const res = await GET(makeRequest('/api/inspiration?limit=51'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('accepts limit=50 (maximum boundary)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const res = await GET(makeRequest('/api/inspiration?limit=50'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.pagination.limit).toBe(50);
  });
});

// ===========================================================================
// GET /api/inspiration — popular destinations
// ===========================================================================
describe('GET /api/inspiration — popular destinations', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('returns all 8 pre-defined popular destinations', async () => {
    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.destinations).toHaveLength(8);
  });

  it('each destination has city, country, tripCount, and topType fields', async () => {
    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    body.data.destinations.forEach((dest: {
      city: string;
      country: string;
      tripCount: number;
      topType: string;
    }) => {
      expect(typeof dest.city).toBe('string');
      expect(typeof dest.country).toBe('string');
      expect(typeof dest.tripCount).toBe('number');
      expect(typeof dest.topType).toBe('string');
    });
  });

  it('includes Las Vegas as a popular destination', async () => {
    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    const cities = body.data.destinations.map((d: { city: string }) => d.city);
    expect(cities).toContain('Las Vegas');
  });
});

// ===========================================================================
// GET /api/inspiration — trending activity fields
// ===========================================================================
describe('GET /api/inspiration — trending activity field mapping', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('maps saveCount and commentCount from _count', async () => {
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_ACTIVITY_ROW as never]);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trending[0].saveCount).toBe(12);
    expect(body.data.trending[0].commentCount).toBe(3);
  });

  it('maps destination city from nested trip.destination', async () => {
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_ACTIVITY_ROW as never]);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trending[0].destination).toBe('Nashville');
  });

  it('exposes activity id, name, description, and category', async () => {
    mockPrismaActivity.findMany.mockResolvedValueOnce([MOCK_ACTIVITY_ROW as never]);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    const trending = body.data.trending[0];
    expect(trending.id).toBe(MOCK_ACTIVITY_ROW.id);
    expect(trending.name).toBe(MOCK_ACTIVITY_ROW.name);
    expect(trending.description).toBe(MOCK_ACTIVITY_ROW.description);
    expect(trending.category).toBe(MOCK_ACTIVITY_ROW.category);
  });
});

// ===========================================================================
// GET /api/inspiration — additional tripType filter values
// ===========================================================================
describe('GET /api/inspiration — all valid tripType enum values', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it.each([
    ['bachelorette'],
    ['girls-trip'],
    ['adventure'],
    ['relaxation'],
    ['cultural'],
    ['food'],
    ['nightlife'],
  ])('filters templates by tripType=%s without error', async (tripType) => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const res = await GET(makeRequest(`/api/inspiration?tripType=${tripType}`));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    body.data.templates.forEach((t: { tags: string[] }) => {
      expect(t.tags).toContain(tripType);
    });
  });
});

// ===========================================================================
// GET /api/inspiration — combined filters
// ===========================================================================
describe('GET /api/inspiration — combined filters', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('combines query and tripType filters (intersection)', async () => {
    // "Vegas" + bachelor: vegas-birthday has both
    const res = await GET(makeRequest('/api/inspiration?query=Vegas&tripType=bachelor'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const templates = body.data.templates as Array<{ tags: string[]; title: string }>;
    templates.forEach((t) => {
      const titleOrTagMatches =
        t.title.toLowerCase().includes('vegas') ||
        t.tags.some((tag: string) => tag.includes('vegas'));
      expect(titleOrTagMatches).toBe(true);
      expect(t.tags).toContain('bachelor');
    });
  });

  it('returns empty templates when combined filters match nothing', async () => {
    // adventure + destination=Nashville: no Nashville templates tagged adventure
    const res = await GET(makeRequest('/api/inspiration?destination=Nashville&tripType=adventure'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.templates).toHaveLength(0);
  });
});

// ===========================================================================
// GET /api/inspiration — trip response field mapping
// ===========================================================================
describe('GET /api/inspiration — trip response field mapping', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
  });

  it('maps memberCount from members array length', async () => {
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_TRIP_ROW as never]);
    mockPrismaTrip.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trips[0].memberCount).toBe(2);
  });

  it('maps activityCount from _count.activities', async () => {
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_TRIP_ROW as never]);
    mockPrismaTrip.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trips[0].activityCount).toBe(3);
  });

  it('maps activities with only name and category fields', async () => {
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_TRIP_ROW as never]);
    mockPrismaTrip.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const activity = body.data.trips[0].activities[0];
    expect(activity.name).toBe('Broadway Bar Crawl');
    expect(activity.category).toBe('Nightlife');
    // Should not expose internal fields like id, tripId, etc.
    expect(activity.id).toBeUndefined();
  });

  it('includes owner name and image in trip response', async () => {
    mockPrismaTrip.findMany.mockResolvedValueOnce([MOCK_TRIP_ROW as never]);
    mockPrismaTrip.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.trips[0].owner).toEqual({ name: 'Trip Owner', image: null });
  });
});

// ===========================================================================
// GET /api/inspiration — 500 error path
// ===========================================================================
describe('GET /api/inspiration — 500 error path', () => {
  it('returns 500 when prisma throws an unexpected error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTrip.findMany.mockRejectedValueOnce(new Error('Database connection lost'));

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to fetch inspiration');
  });
});

// ===========================================================================
// GET /api/inspiration — auth edge cases
// ===========================================================================
describe('GET /api/inspiration — auth edge cases', () => {
  beforeEach(() => {
    // Fully reset the session mock to clear any permanent mockResolvedValue
    // from other suites (vi.clearAllMocks does not clear implementations).
    mockGetServerSession.mockReset();
  });

  it('returns 401 when session exists but user.id is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { name: 'No ID User', email: 'noid@example.com' },
      expires: '2099-01-01',
    } as never);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session.user is null', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: null,
      expires: '2099-01-01',
    } as never);

    const res = await GET(makeRequest('/api/inspiration'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});
