/**
 * Extended edge-case tests for the Feed API route.
 *
 * Route: /api/feed  (GET, POST)
 *
 * Phase 6 rescope (2026-04-21): feed now serves meetup_created and
 * check_in_posted items.  Trip/activity/follow queries have been removed.
 * POST returns 410 Gone.
 *
 * feedType enum: 'all' | 'crew' | 'trending' (default: 'all')
 *
 * Covers edge cases NOT exercised by feed.test.ts:
 *  - Pagination with real data (page 2, limit boundaries, hasMore logic)
 *  - feedType=crew filtering (crew-visible items only)
 *  - feedType=trending (sorted by attendee count)
 *  - Multiple item types mixed in response
 *  - Database errors (500)
 *  - Invalid query param validation (400)
 *  - Response structure invariants
 *  - POST 410 (endpoint retired)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Extend the global prisma mock with rescoped feed-relevant models
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      meetup: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      checkIn: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      crew: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

// Static imports — NEVER use dynamic import() in beforeEach
import { GET as feedGET, POST as feedPOST } from '@/app/api/feed/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaMeetup = vi.mocked(prisma.meetup);
const mockPrismaCheckIn = vi.mocked(prisma.checkIn);
const mockPrismaCrew = vi.mocked(prisma.crew);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-ext-001';
const MOCK_USER_B_ID = 'user-ext-002';
const MOCK_MEETUP_ID = 'meetup-ext-001';
const MOCK_CHECKIN_ID = 'checkin-ext-001';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

function makeMeetupRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOCK_MEETUP_ID,
    title: 'Friday Night Out',
    description: null,
    hostId: MOCK_USER_ID,
    venueId: null,
    venueName: 'The Blue Bar',
    cityId: null,
    scheduledAt: new Date(Date.now() + 86400000), // tomorrow
    endsAt: null,
    visibility: 'PUBLIC' as const,
    capacity: null,
    cancelled: false,
    createdAt: new Date('2026-04-20'),
    updatedAt: new Date('2026-04-20'),
    host: { id: MOCK_USER_ID, name: 'Test User', image: null },
    venue: null,
    _count: { attendees: 4 },
    ...overrides,
  };
}

function makeCheckInRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOCK_CHECKIN_ID,
    userId: MOCK_USER_ID,
    venueId: null,
    venueName: 'Corner Café',
    cityId: null,
    note: 'Working remotely today',
    visibility: 'PUBLIC' as const,
    activeUntil: new Date(Date.now() + 3600000), // 1h from now
    latitude: null,
    longitude: null,
    createdAt: new Date('2026-04-20T14:00:00Z'),
    user: { id: MOCK_USER_ID, name: 'Test User', image: null },
    venue: null,
    city: { name: 'New York' },
    ...overrides,
  };
}

/** Build a NextRequest for the feed route. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

async function parseJson(res: Response) {
  return res.json();
}

/**
 * Set up standard default mocks for a GET /api/feed call.
 */
function setupDefaultGetMocks({
  session = null as typeof MOCK_SESSION | null,
  meetups = [] as ReturnType<typeof makeMeetupRow>[],
  checkIns = [] as ReturnType<typeof makeCheckInRow>[],
  crewPartners = [] as Array<{ userAId: string; userBId: string }>,
} = {}) {
  mockGetServerSession.mockResolvedValue(
    session as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]
  );
  mockPrismaMeetup.findMany.mockResolvedValue(
    meetups as Awaited<ReturnType<typeof prisma.meetup.findMany>>
  );
  mockPrismaCheckIn.findMany.mockResolvedValue(
    checkIns as Awaited<ReturnType<typeof prisma.checkIn.findMany>>
  );
  // getCrewPartnerIds internally calls crew.findMany
  mockPrismaCrew.findMany.mockResolvedValue(
    crewPartners as Awaited<ReturnType<typeof prisma.crew.findMany>>
  );
}

// ---------------------------------------------------------------------------
// Clear all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/feed — Pagination edge cases
// ===========================================================================
describe('GET /api/feed — pagination', () => {
  it('returns page 2 data when enough items exist', async () => {
    // 3 meetups → limit=2, page=2 yields 1 item
    const meetups = [
      makeMeetupRow({ id: 'meetup-1', createdAt: new Date('2026-03-03') }),
      makeMeetupRow({ id: 'meetup-2', createdAt: new Date('2026-03-02') }),
      makeMeetupRow({ id: 'meetup-3', createdAt: new Date('2026-03-01') }),
    ];
    setupDefaultGetMocks({ meetups });

    const res = await feedGET(makeRequest('/api/feed?page=2&limit=2'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(2);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.totalPages).toBe(2);
  });

  it('returns empty data array and hasMore=false when page exceeds total', async () => {
    setupDefaultGetMocks({ meetups: [makeMeetupRow()] });

    const res = await feedGET(makeRequest('/api/feed?page=99&limit=20'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.total).toBe(1);
  });

  it('hasMore=true when more items remain beyond the current page window', async () => {
    const meetups = Array.from({ length: 5 }, (_, i) =>
      makeMeetupRow({ id: `meetup-${i}`, createdAt: new Date(2026, 2, 5 - i) })
    );
    setupDefaultGetMocks({ meetups });

    const res = await feedGET(makeRequest('/api/feed?page=1&limit=3'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.totalPages).toBe(2);
  });

  it('respects limit=1 (minimum) and returns exactly one item', async () => {
    const meetups = [
      makeMeetupRow({ id: 'meetup-a', createdAt: new Date('2026-03-03') }),
      makeMeetupRow({ id: 'meetup-b', createdAt: new Date('2026-03-02') }),
    ];
    setupDefaultGetMocks({ meetups });

    const res = await feedGET(makeRequest('/api/feed?page=1&limit=1'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.hasMore).toBe(true);
  });

  it('returns 400 when limit exceeds maximum of 50', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?limit=51'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when page is 0 (below minimum of 1)', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?page=0'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when page is a non-numeric string', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?page=abc'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ===========================================================================
// GET /api/feed — item types
// ===========================================================================
describe('GET /api/feed — item types', () => {
  it('maps meetup to meetup_created type with correct fields', async () => {
    setupDefaultGetMocks({ meetups: [makeMeetupRow()] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const item = body.data.find((i: { type: string }) => i.type === 'meetup_created');
    expect(item).toBeDefined();
    expect(item.meetup.title).toBe('Friday Night Out');
    expect(item.meetup.venue).toBe('The Blue Bar');
    expect(item.metadata.attendeeCount).toBe(4);
  });

  it('maps check-in to check_in_posted type with correct fields', async () => {
    setupDefaultGetMocks({ session: MOCK_SESSION, checkIns: [makeCheckInRow()] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const item = body.data.find((i: { type: string }) => i.type === 'check_in_posted');
    expect(item).toBeDefined();
    expect(item.checkIn.id).toBe(MOCK_CHECKIN_ID);
    expect(item.checkIn.city).toBe('New York');
  });

  it('mixes meetup and check-in items and sorts by timestamp descending', async () => {
    const meetup = makeMeetupRow({ createdAt: new Date('2026-03-01') });
    const checkIn = makeCheckInRow({ createdAt: new Date('2026-03-03') }); // newest

    setupDefaultGetMocks({ session: MOCK_SESSION, meetups: [meetup], checkIns: [checkIn] });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);

    // Verify descending order: checkIn (Mar 3) > meetup (Mar 1)
    expect(body.data[0].type).toBe('check_in_posted');
    expect(body.data[1].type).toBe('meetup_created');
  });

  it('prefixes item ids correctly (meetup-, checkin-)', async () => {
    setupDefaultGetMocks({
      session: MOCK_SESSION,
      meetups: [makeMeetupRow()],
      checkIns: [makeCheckInRow()],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    const ids: string[] = body.data.map((i: { id: string }) => i.id);
    expect(ids.some((id) => id.startsWith('meetup-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('checkin-'))).toBe(true);
  });
});

// ===========================================================================
// GET /api/feed — feedType query param variations
// ===========================================================================
describe('GET /api/feed — feedType param', () => {
  it('accepts feedType=all and queries both meetups and check-ins', async () => {
    setupDefaultGetMocks({
      meetups: [makeMeetupRow()],
    });

    const res = await feedGET(makeRequest('/api/feed?type=all'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(mockPrismaMeetup.findMany).toHaveBeenCalled();
  });

  it('feedType=trending calls meetup.findMany (trending meetups)', async () => {
    setupDefaultGetMocks({ meetups: [makeMeetupRow()] });

    const res = await feedGET(makeRequest('/api/feed?type=trending'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(mockPrismaMeetup.findMany).toHaveBeenCalled();
  });

  it('feedType=crew returns empty data when user has no crew partners', async () => {
    mockGetServerSession.mockResolvedValue(
      MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]
    );
    // crew.findMany (for getCrewPartnerIds) returns no partners
    mockPrismaCrew.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.crew.findMany>>
    );
    // meetup and checkIn queries should not be called (no OR clauses)
    mockPrismaMeetup.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.meetup.findMany>>
    );
    mockPrismaCheckIn.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.checkIn.findMany>>
    );

    const res = await feedGET(makeRequest('/api/feed?type=crew'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });

  it('returns 400 for an invalid feedType value', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?type=invalid'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for legacy feedType=following (now invalid)', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?type=following'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for legacy feedType=meetups (now invalid — use all/crew)', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed?type=meetups'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ===========================================================================
// GET /api/feed — database error handling
// ===========================================================================
describe('GET /api/feed — database errors', () => {
  it('returns 500 when prisma.meetup.findMany throws', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaMeetup.findMany.mockRejectedValue(new Error('DB connection refused'));
    mockPrismaCheckIn.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.checkIn.findMany>>
    );
    mockPrismaCrew.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.crew.findMany>>
    );

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch feed');
  });

  it('returns 500 when prisma.checkIn.findMany throws', async () => {
    mockGetServerSession.mockResolvedValue(
      MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]
    );
    mockPrismaMeetup.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.meetup.findMany>>
    );
    mockPrismaCheckIn.findMany.mockRejectedValue(new Error('Query timeout'));
    mockPrismaCrew.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.crew.findMany>>
    );

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch feed');
  });

  it('returns 500 when crew.findMany throws (authenticated user)', async () => {
    mockGetServerSession.mockResolvedValue(
      MOCK_SESSION as Parameters<typeof mockGetServerSession.mockResolvedValue>[0]
    );
    // getCrewPartnerIds calls crew.findMany
    mockPrismaCrew.findMany.mockRejectedValue(new Error('Lock timeout'));
    mockPrismaMeetup.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.meetup.findMany>>
    );
    mockPrismaCheckIn.findMany.mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.checkIn.findMany>>
    );

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// GET /api/feed — response structure invariants
// ===========================================================================
describe('GET /api/feed — response structure invariants', () => {
  it('each feed item always has id, type, timestamp, and user fields', async () => {
    setupDefaultGetMocks({
      session: MOCK_SESSION,
      meetups: [makeMeetupRow()],
      checkIns: [makeCheckInRow()],
    });

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    for (const item of body.data) {
      expect(item.id).toBeDefined();
      expect(item.type).toBeDefined();
      expect(item.timestamp).toBeDefined();
      expect(item.user).toBeDefined();
      expect(item.user.id).toBeDefined();
    }
  });

  it('pagination object has all required fields', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(body.pagination).toMatchObject({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),
      totalPages: expect.any(Number),
      hasMore: expect.any(Boolean),
    });
  });

  it('totalPages is 0 when total is 0', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(body.pagination.total).toBe(0);
    expect(body.pagination.totalPages).toBe(0);
  });

  it('default pagination values are page=1, limit=20', async () => {
    setupDefaultGetMocks();

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(20);
  });
});

// ===========================================================================
// POST /api/feed — retired (410 Gone)
// ===========================================================================
describe('POST /api/feed — retired', () => {
  it('returns 410 Gone for any POST request', async () => {
    const res = await feedPOST();
    const body = await parseJson(res);

    expect(res.status).toBe(410);
    expect(body.error).toMatch(/retired/i);
  });
});
