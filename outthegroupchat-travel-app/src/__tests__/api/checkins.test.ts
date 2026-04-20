/**
 * Unit tests for POST /api/checkins, GET /api/checkins,
 * GET /api/checkins/feed, and DELETE /api/checkins/[id].
 *
 * Phase 5 — Check-ins & live presence.
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
// Module-level mock for @/lib/rate-limit — must be declared before any
// imports that transitively pull the module.
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

// Static imports — NEVER use dynamic await import in beforeEach.
import { POST, GET } from '@/app/api/checkins/route';
import { GET as GET_FEED } from '@/app/api/checkins/feed/route';
import { DELETE } from '@/app/api/checkins/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegates
// ---------------------------------------------------------------------------
const mockPrismaCheckIn = prisma.checkIn as unknown as {
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
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};

const mockPrismaNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/checkins';

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

const makeFeedReq = () =>
  new NextRequest('http://localhost/api/checkins/feed');

const makeDeleteReq = () =>
  new NextRequest('http://localhost/api/checkins/checkin-1', { method: 'DELETE' });

/** Minimal check-in record returned from prisma */
const fakeCheckIn = (overrides: Record<string, unknown> = {}) => ({
  id: 'checkin-abc-123',
  userId: 'user-1',
  venueId: null,
  note: 'Hanging out downtown',
  latitude: null,
  longitude: null,
  activeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  user: { id: 'user-1', name: 'Alice', image: null },
  venue: null,
  ...overrides,
});

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();

  // Re-arm rate-limit pass-through after resetAllMocks wipes mockResolvedValue.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// POST /api/checkins
// ===========================================================================
describe('POST /api/checkins', () => {
  it('returns 201 with check-in data on valid request (note only, no venueId)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const created = fakeCheckIn();
    mockPrismaCheckIn.create.mockResolvedValueOnce(created);
    // No crew partners
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await POST(makePostReq({ note: 'Hanging out downtown' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('checkin-abc-123');
    expect(body.data.note).toBe('Hanging out downtown');
  });

  it('returns 201 with check-in when venueId is provided', async () => {
    // CUID format: starts with 'c', 25 total chars, lowercase alphanumeric
    const validVenueId = 'claaaaaaaaaaaaaaaaaaaaaaa';
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const venue = { id: validVenueId, name: 'The Loft', city: 'NYC', category: 'BAR' };
    const created = fakeCheckIn({ venueId: validVenueId, venue });
    mockPrismaCheckIn.create.mockResolvedValueOnce(created);
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const res = await POST(makePostReq({ note: 'At the bar', venueId: validVenueId }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.venueId).toBe(validVenueId);
    expect(body.data.venue?.name).toBe('The Loft');

    // Verify venueId was passed to prisma.checkIn.create
    const createArg = mockPrismaCheckIn.create.mock.calls[0]?.[0]?.data;
    expect(createArg?.venueId).toBe(validVenueId);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ note: 'Hello' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 for note over 200 characters (Zod validation)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const longNote = 'x'.repeat(201);
    const res = await POST(makePostReq({ note: longNote }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await POST(makePostReq({ note: 'Hi' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('dispatches CREW_CHECKED_IN_NEARBY notifications to crew partners', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1', 'Alice'));
    const created = fakeCheckIn({ venue: { id: 'v1', name: 'Rooftop Bar', city: 'NYC', category: 'BAR' } });
    mockPrismaCheckIn.create.mockResolvedValueOnce(created);

    // Two accepted crew rows — partners are user-2 and user-3
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await POST(makePostReq({ note: 'At the rooftop' }));

    expect(res.status).toBe(201);

    // Notification createMany should have been called once
    expect(mockPrismaNotification.createMany).toHaveBeenCalledTimes(1);
    const notifCall = mockPrismaNotification.createMany.mock.calls[0]?.[0];
    expect(notifCall?.data).toHaveLength(2);
    expect(notifCall?.data[0].type).toBe('CREW_CHECKED_IN_NEARBY');
    expect(notifCall?.data[0].userId).toBe('user-2');
    expect(notifCall?.data[1].userId).toBe('user-3');
  });

  it('uses default activeUntil (~6h from now) when no override is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const created = fakeCheckIn();
    mockPrismaCheckIn.create.mockResolvedValueOnce(created);
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const before = Date.now();
    const res = await POST(makePostReq({ note: 'Just checking in' }));
    const after = Date.now();

    expect(res.status).toBe(201);

    // The activeUntil passed to prisma.checkIn.create should be ~6h from now
    const createArg = mockPrismaCheckIn.create.mock.calls[0]?.[0]?.data;
    const activeUntil: Date = createArg?.activeUntil;
    expect(activeUntil).toBeInstanceOf(Date);

    const expectedMin = before + 6 * 60 * 60 * 1000;
    const expectedMax = after + 6 * 60 * 60 * 1000;
    expect(activeUntil.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(activeUntil.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('clamps activeUntilOverride to max 12h when provided value exceeds the limit', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const created = fakeCheckIn();
    mockPrismaCheckIn.create.mockResolvedValueOnce(created);
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    // Request 48 hours from now — should be clamped to ≤12h
    const far = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const before = Date.now();
    const res = await POST(makePostReq({ note: 'Way too long', activeUntilOverride: far }));
    const after = Date.now();

    expect(res.status).toBe(201);

    const createArg = mockPrismaCheckIn.create.mock.calls[0]?.[0]?.data;
    const activeUntil: Date = createArg?.activeUntil;
    expect(activeUntil).toBeInstanceOf(Date);

    const maxTime = after + 12 * 60 * 60 * 1000;
    expect(activeUntil.getTime()).toBeLessThanOrEqual(maxTime);
    // Should be close to the 12h mark (within a second of before + 12h)
    const expectedClamped = before + 12 * 60 * 60 * 1000;
    expect(activeUntil.getTime()).toBeGreaterThanOrEqual(expectedClamped - 1000);
  });
});

// ===========================================================================
// GET /api/checkins — user's own check-ins
// ===========================================================================
describe("GET /api/checkins — user's own check-ins", () => {
  it('returns 200 with array of check-ins for authenticated user', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const checkIns = [
      fakeCheckIn({ id: 'checkin-1' }),
      fakeCheckIn({ id: 'checkin-2', note: 'Second one' }),
    ];
    mockPrismaCheckIn.findMany.mockResolvedValueOnce(checkIns);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.checkIns).toHaveLength(2);
    expect(body.data.checkIns[0].id).toBe('checkin-1');
    expect(body.data.checkIns[1].id).toBe('checkin-2');
    expect(body.data.nextCursor).toBeUndefined();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 with nextCursor when there is a next page', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    // Default limit is 50; return 51 items to trigger next-page logic
    const checkIns = Array.from({ length: 51 }, (_, i) =>
      fakeCheckIn({ id: `checkin-${String(i).padStart(3, '0')}` })
    );
    mockPrismaCheckIn.findMany.mockResolvedValueOnce(checkIns);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.checkIns).toHaveLength(50);
    expect(body.data.nextCursor).toBe('checkin-049');
  });

  it('passes only the caller user ID to the prisma where clause', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-42'));
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET(makeGetReq());

    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg?.userId).toBe('user-42');
  });
});

// ===========================================================================
// GET /api/checkins/feed — crew check-in feed
// ===========================================================================
describe('GET /api/checkins/feed', () => {
  it('returns 200 with active crew check-ins (activeUntil > now)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    // Crew partners
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
      { userAId: 'user-3', userBId: 'user-1' },
    ]);

    const activeCheckIns = [
      fakeCheckIn({ id: 'ci-1', userId: 'user-2' }),
      fakeCheckIn({ id: 'ci-2', userId: 'user-3' }),
    ];
    mockPrismaCheckIn.findMany.mockResolvedValueOnce(activeCheckIns);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe('ci-1');
    expect(body.data[1].id).toBe('ci-2');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns empty array when user has no Crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    // No crew rows
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    // checkIn.findMany will be called with userId: { in: [] }
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('only queries check-ins for crew partner IDs', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-5' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    // Should only include crew partner IDs, not the caller
    expect(whereArg?.userId?.in).toEqual(['user-5']);
    // Should filter for active check-ins (activeUntil > now)
    expect(whereArg?.activeUntil?.gt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// DELETE /api/checkins/[id]
// ===========================================================================
describe('DELETE /api/checkins/[id]', () => {
  const params = { params: { id: 'checkin-1' } };

  it('returns 200 on successful deletion (owner of check-in)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    // findUnique returns the check-in owned by user-1
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-1' })
    );
    mockPrismaCheckIn.delete.mockResolvedValueOnce(undefined);

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Check-in cancelled');

    // Verify delete was called with the correct id
    expect(mockPrismaCheckIn.delete).toHaveBeenCalledWith({ where: { id: 'checkin-1' } });
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 404 when check-in not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Check-in not found');
  });

  it('returns 403 when authenticated user does not own the check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    // Check-in belongs to user-2
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-2' })
    );

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Forbidden');

    // Delete should NOT have been called
    expect(mockPrismaCheckIn.delete).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });
});
