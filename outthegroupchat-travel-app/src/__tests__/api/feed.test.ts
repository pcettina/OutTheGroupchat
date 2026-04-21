/**
 * Unit tests for the Feed API route handlers.
 *
 * Route: /api/feed  (GET, POST)
 *
 * Phase 6 rescope (2026-04-21): feed now serves meetup_created and
 * check_in_posted items.  Trip/activity/follow queries have been removed.
 * POST returns 410 Gone (endpoint retired).
 *
 * feedType enum: 'all' | 'crew' | 'trending' (default: 'all')
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts.  This file extends those mocks with the
 *   additional Prisma models the rescoped feed handler calls: meetup,
 *   checkIn, and crew.
 * - Handlers are called directly with a minimal Request built from the
 *   web-platform APIs available in the Vitest node environment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Extend the global prisma mock (defined in setup.ts) with the additional
// models and methods that the rescoped feed route handler calls.
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

// Import handlers after the mock is registered.
import { GET as feedGET, POST as feedPOST } from '@/app/api/feed/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaMeetup = vi.mocked(prisma.meetup);
const mockPrismaCheckIn = vi.mocked(prisma.checkIn);
const mockPrismaCrew = vi.mocked(prisma.crew);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-feed-111';
const MOCK_MEETUP_ID = 'meetup-feed-222';
const MOCK_CHECKIN_ID = 'checkin-feed-333';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Feed Tester',
    email: 'feed@example.com',
  },
  expires: '2099-01-01',
};

/** A minimal public meetup row returned by prisma.meetup.findMany. */
const MOCK_MEETUP_ROW = {
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
  host: { id: MOCK_USER_ID, name: 'Feed Tester', image: null },
  venue: null,
  _count: { attendees: 4 },
};

/** A minimal public check-in row returned by prisma.checkIn.findMany. */
const MOCK_CHECKIN_ROW = {
  id: MOCK_CHECKIN_ID,
  userId: MOCK_USER_ID,
  venueId: null,
  venueName: 'Corner Café',
  cityId: null,
  note: 'Working remotely today',
  visibility: 'PUBLIC' as const,
  activeUntil: new Date(Date.now() + 3600000), // 1h from now (still active)
  latitude: null,
  longitude: null,
  createdAt: new Date('2026-04-20T14:00:00Z'),
  user: { id: MOCK_USER_ID, name: 'Feed Tester', image: null },
  venue: null,
  city: { name: 'New York' },
};

/** Build a minimal Request accepted by the App Router handlers. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  return new Request(url, init);
}

/** Parse the JSON body from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to avoid state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default GET stubs — return empty datasets so no items are built.
  mockPrismaMeetup.findMany.mockResolvedValue([]);
  mockPrismaCheckIn.findMany.mockResolvedValue([]);
  mockPrismaCrew.findMany.mockResolvedValue([]);
});

// ===========================================================================
// GET /api/feed
// ===========================================================================
describe('GET /api/feed', () => {
  it('returns 200 with feed envelope when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it('returns 200 with correct pagination shape', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed?page=1&limit=20'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: expect.any(Number),
      totalPages: expect.any(Number),
      hasMore: expect.any(Boolean),
    });
  });

  it('returns empty data array when no meetups or check-ins exist', async () => {
    mockGetServerSession.mockResolvedValue(null);
    // All Prisma queries already default to [] in beforeEach.

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('handles page and limit query params correctly', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed?page=2&limit=5'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(5);
  });

  it('includes meetup_created items when public meetups are returned by Prisma', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaMeetup.findMany.mockResolvedValue([MOCK_MEETUP_ROW]);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);

    const meetupItem = body.data.find((item: { type: string }) => item.type === 'meetup_created');
    expect(meetupItem).toBeDefined();
    expect(meetupItem.meetup.id).toBe(MOCK_MEETUP_ID);
    expect(meetupItem.meetup.title).toBe('Friday Night Out');
  });

  it('includes check_in_posted items when active check-ins are returned by Prisma', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
    mockPrismaCheckIn.findMany.mockResolvedValue([MOCK_CHECKIN_ROW]);

    const res = await feedGET(makeRequest('/api/feed'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const checkInItem = body.data.find((item: { type: string }) => item.type === 'check_in_posted');
    expect(checkInItem).toBeDefined();
    expect(checkInItem.checkIn.id).toBe(MOCK_CHECKIN_ID);
  });

  it('accepts feedType=all (default)', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed?type=all'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('accepts feedType=crew', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);

    const res = await feedGET(makeRequest('/api/feed?type=crew'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('accepts feedType=trending', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockPrismaMeetup.findMany.mockResolvedValue([MOCK_MEETUP_ROW]);

    const res = await feedGET(makeRequest('/api/feed?type=trending'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 for an invalid feedType value', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed?type=invalid'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for legacy feedType=following (now invalid)', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await feedGET(makeRequest('/api/feed?type=following'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ===========================================================================
// POST /api/feed — retired (410 Gone)
// ===========================================================================
describe('POST /api/feed', () => {
  it('returns 410 Gone for any POST request (endpoint retired)', async () => {
    const res = await feedPOST();
    const body = await parseJson(res);

    expect(res.status).toBe(410);
    expect(body.error).toMatch(/retired/i);
  });
});
