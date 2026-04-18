/**
 * Unit tests for POST and GET /api/meetups (Phase 4 — Meetups core).
 *
 * Prisma, NextAuth, logger, sentry, and rate-limit mocks are established in
 * src/__tests__/setup.ts. This file re-mocks @/lib/rate-limit to get a
 * controllable reference and re-arms the mock after vi.resetAllMocks() in
 * beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — must be declared before imports
// that transitively pull the module.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Static imports — NEVER use dynamic await import in beforeEach (causes 10s timeout).
import { POST, GET } from '@/app/api/meetups/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed references to mocked prisma delegates
// ---------------------------------------------------------------------------
const mockPrismaMeetup = prisma.meetup as unknown as {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

const mockPrismaCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/meetups';

/** Returns a future ISO-8601 datetime string (offset-aware). */
const futureDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
/** Returns a past ISO-8601 datetime string (offset-aware). */
const pastDate = () => new Date(Date.now() - 60 * 1000).toISOString();

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makePostReq = (body: unknown) =>
  new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const makeGetReq = (queryParams: Record<string, string> = {}) => {
  const url = new URL(BASE_URL);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
};

/** Minimal valid meetup object returned by prisma.meetup.create */
const fakeMeetup = (overrides: Record<string, unknown> = {}) => ({
  id: 'meetup-abc-123',
  title: 'Test Meetup',
  description: null,
  hostId: 'user-1',
  venueId: null,
  venueName: null,
  cityId: null,
  scheduledAt: futureDate(),
  endsAt: null,
  visibility: 'CREW',
  capacity: null,
  cancelled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  host: { id: 'user-1', name: 'Alice', image: null },
  venue: null,
  city: null,
  _count: { attendees: 0 },
  ...overrides,
});

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();

  // Re-arm rate-limit pass-through after resetAllMocks wipes mockResolvedValue.
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
});

// ===========================================================================
// POST /api/meetups
// ===========================================================================
describe('POST /api/meetups', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ title: 'Meetup', scheduledAt: futureDate() }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when required fields are missing (no title, no scheduledAt)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when scheduledAt is in the past', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await POST(makePostReq({ title: 'Meetup', scheduledAt: pastDate() }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 201 on success — creates meetup and returns the created record', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const created = fakeMeetup();
    mockPrismaMeetup.create.mockResolvedValueOnce(created);

    const res = await POST(
      makePostReq({ title: 'Test Meetup', scheduledAt: futureDate() })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('meetup-abc-123');
    expect(body.data.title).toBe('Test Meetup');

    // Verify prisma.meetup.create was called with the right hostId
    const createCall = mockPrismaMeetup.create.mock.calls[0]?.[0];
    expect(createCall?.data.hostId).toBe('user-1');
    expect(createCall?.data.title).toBe('Test Meetup');
  });

  it('returns 201 when all optional fields are provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const scheduled = futureDate();
    const ends = new Date(new Date(scheduled).getTime() + 2 * 60 * 60 * 1000).toISOString();

    const created = fakeMeetup({
      title: 'Full Meetup',
      description: 'A full description',
      venueName: 'The Rooftop Bar',
      capacity: 50,
      visibility: 'PUBLIC',
      scheduledAt: scheduled,
      endsAt: ends,
    });
    mockPrismaMeetup.create.mockResolvedValueOnce(created);

    const res = await POST(
      makePostReq({
        title: 'Full Meetup',
        description: 'A full description',
        venueName: 'The Rooftop Bar',
        capacity: 50,
        visibility: 'PUBLIC',
        scheduledAt: scheduled,
        endsAt: ends,
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Full Meetup');
    expect(body.data.visibility).toBe('PUBLIC');
    expect(body.data.capacity).toBe(50);

    // Verify optional fields passed through to prisma
    const createArg = mockPrismaMeetup.create.mock.calls[0]?.[0]?.data;
    expect(createArg?.description).toBe('A full description');
    expect(createArg?.venueName).toBe('The Rooftop Bar');
    expect(createArg?.capacity).toBe(50);
    expect(createArg?.visibility).toBe('PUBLIC');
  });

  it('returns 500 when prisma.meetup.create throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaMeetup.create.mockRejectedValueOnce(new Error('DB error'));

    const res = await POST(
      makePostReq({ title: 'Meetup', scheduledAt: futureDate() })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to create meetup');
  });
});

// ===========================================================================
// GET /api/meetups
// ===========================================================================
describe('GET /api/meetups', () => {
  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 with meetups array and pagination info', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    // Route calls prisma.crew.findMany first to resolve crew partner IDs
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    // Then prisma.meetup.findMany — return exactly 'limit' items (default 20)
    const meetupList = Array.from({ length: 2 }, (_, i) =>
      fakeMeetup({ id: `meetup-${i}`, title: `Meetup ${i}` })
    );
    mockPrismaMeetup.findMany.mockResolvedValueOnce(meetupList);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.meetups).toHaveLength(2);
    // No extra item fetched → no next page
    expect(body.data.nextCursor).toBeUndefined();
  });

  it('returns 200 and passes cityId filter to prisma query when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaMeetup.findMany.mockResolvedValueOnce([fakeMeetup()]);

    const res = await GET(makeGetReq({ cityId: 'claaaaaaaaaaaaaaaaaaaaaaa' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Assert that the prisma.meetup.findMany where clause received cityId
    const whereArg = mockPrismaMeetup.findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg?.cityId).toBe('claaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('returns 200 with empty results when no meetups exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaMeetup.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.meetups).toHaveLength(0);
    expect(body.data.nextCursor).toBeUndefined();
  });

  it('returns nextCursor when there is a next page', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    // Default limit is 20; return 21 items to trigger next-page logic
    const meetupList = Array.from({ length: 21 }, (_, i) =>
      fakeMeetup({ id: `meetup-${String(i).padStart(3, '0')}`, title: `Meetup ${i}` })
    );
    mockPrismaMeetup.findMany.mockResolvedValueOnce(meetupList);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Only 20 items returned (last one is the look-ahead)
    expect(body.data.meetups).toHaveLength(20);
    // nextCursor is the id of the 20th item
    expect(body.data.nextCursor).toBe('meetup-019');
  });
});
