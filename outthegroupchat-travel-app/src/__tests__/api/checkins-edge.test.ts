/**
 * Edge case tests for check-in routes (Phase 5 — Check-ins & live presence).
 *
 * Covers:
 *  POST /api/checkins  — activeUntil clamping, Crew notification dispatch,
 *                        note boundary validation, empty-body rejection
 *  GET  /api/checkins/feed — activeUntil filtering, Crew userA/userB symmetry,
 *                            ordering (newest first)
 *  DELETE /api/checkins/[id] — expired check-in delete, double-delete 404
 *
 * Prisma, NextAuth, logger, sentry mocks are provided by src/__tests__/setup.ts.
 * Rate-limit is re-mocked here for local control and re-armed in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Rate-limit mock — must be declared before any route imports
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from '@/app/api/checkins/route';
import { GET as feedGET } from '@/app/api/checkins/feed/route';
import { DELETE } from '@/app/api/checkins/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegates
// ---------------------------------------------------------------------------
const mockCheckIn = prisma.checkIn as unknown as {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const mockNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_POST_URL = 'http://localhost/api/checkins';
const FEED_URL = 'http://localhost/api/checkins/feed';

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makePostReq = (body: unknown) =>
  new NextRequest(BASE_POST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const makeDeleteReq = (id: string) =>
  new NextRequest(`http://localhost/api/checkins/${id}`, { method: 'DELETE' });

/** Returns a Date that is `minutes` minutes from now. */
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
/** Returns an ISO string that is `hours` hours from now. */
const hoursFromNowIso = (hours: number) =>
  new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

/** Minimal check-in stub returned by prisma.checkIn.create */
const makeCheckInStub = (overrides: Record<string, unknown> = {}) => ({
  id: 'ci-1',
  userId: 'user-1',
  venueId: null,
  note: null,
  latitude: null,
  longitude: null,
  activeUntil: minutesFromNow(360),
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 'user-1', name: 'Alice', image: null },
  venue: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// beforeEach: reset mocks + re-arm rate-limit + session
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  mockGetServerSession.mockResolvedValue(sessionFor());
});

// ===========================================================================
// POST /api/checkins — edge cases
// ===========================================================================

describe('POST /api/checkins — edge cases', () => {
  it('clamps activeUntil to 30-minute floor when override is too soon', async () => {
    // Override is only 5 minutes from now — should be clamped to ~30 min
    const tooSoonIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    let capturedActiveUntil: Date | undefined;
    mockCheckIn.create.mockImplementationOnce(({ data }: { data: { activeUntil: Date } }) => {
      capturedActiveUntil = data.activeUntil;
      return Promise.resolve(makeCheckInStub({ activeUntil: data.activeUntil }));
    });
    mockCrew.findMany.mockResolvedValueOnce([]);

    const req = makePostReq({ activeUntilOverride: tooSoonIso });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // Must be at least 29 minutes from now (floor is 30 min; allow 1 min slop for test runtime)
    const minExpected = Date.now() + 29 * 60 * 1000;
    expect(capturedActiveUntil!.getTime()).toBeGreaterThanOrEqual(minExpected);

    // Must not exceed the 12-hour ceiling
    const maxExpected = Date.now() + 12 * 60 * 60 * 1000 + 5000;
    expect(capturedActiveUntil!.getTime()).toBeLessThanOrEqual(maxExpected);
  });

  it('clamps activeUntil to 12-hour ceiling when override is too far in the future', async () => {
    // Override is 24 hours from now — should be clamped to 12 hours
    const tooFarIso = hoursFromNowIso(24);

    let capturedActiveUntil: Date | undefined;
    mockCheckIn.create.mockImplementationOnce(({ data }: { data: { activeUntil: Date } }) => {
      capturedActiveUntil = data.activeUntil;
      return Promise.resolve(makeCheckInStub({ activeUntil: data.activeUntil }));
    });
    mockCrew.findMany.mockResolvedValueOnce([]);

    const req = makePostReq({ activeUntilOverride: tooFarIso });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // Must be no more than 12 hours + 5s slop from now
    const maxExpected = Date.now() + 12 * 60 * 60 * 1000 + 5000;
    expect(capturedActiveUntil!.getTime()).toBeLessThanOrEqual(maxExpected);

    // Must be at least 11 hours 59 min from now (ceiling, not default)
    const minExpected = Date.now() + (12 * 60 - 1) * 60 * 1000;
    expect(capturedActiveUntil!.getTime()).toBeGreaterThanOrEqual(minExpected);
  });

  it('succeeds with 201 and sends 0 notifications when user has no Crew', async () => {
    mockCheckIn.create.mockResolvedValueOnce(makeCheckInStub());
    // Empty Crew — no partners to notify
    mockCrew.findMany.mockResolvedValueOnce([]);

    const req = makePostReq({ note: 'Solo check-in' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);

    // notification.createMany must NOT have been called
    expect(mockNotification.createMany).not.toHaveBeenCalled();
  });

  it('accepts a note at exactly 200 characters (boundary — inclusive)', async () => {
    const note200 = 'a'.repeat(200);

    mockCheckIn.create.mockResolvedValueOnce(makeCheckInStub({ note: note200 }));
    mockCrew.findMany.mockResolvedValueOnce([]);

    const req = makePostReq({ note: note200 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  it('rejects a note at 201 characters with 400', async () => {
    const note201 = 'a'.repeat(201);

    const req = makePostReq({ note: note201 });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    // Prisma must NOT have been called
    expect(mockCheckIn.create).not.toHaveBeenCalled();
  });

  it('returns 400 for a request with no JSON body', async () => {
    const req = new NextRequest(BASE_POST_URL, {
      method: 'POST',
      // No body / no Content-Type — triggers JSON parse error
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('does not validate venue existence — returns 201 for unknown venueId', async () => {
    // The route uses z.string().cuid().optional() for venueId but does NOT look up the venue.
    // A valid CUID for a non-existent venue should still create the check-in.
    const unknownVenueId = 'claaaaaaaaaaaaaaaaaaaaaaa'; // 25-char CUID-like

    mockCheckIn.create.mockResolvedValueOnce(
      makeCheckInStub({ venueId: unknownVenueId, venue: null })
    );
    mockCrew.findMany.mockResolvedValueOnce([]);

    const req = makePostReq({ venueId: unknownVenueId });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.venueId).toBe(unknownVenueId);
  });
});

// ===========================================================================
// GET /api/checkins/feed — edge cases
// ===========================================================================

describe('GET /api/checkins/feed — edge cases', () => {
  it('returns only active check-ins (activeUntil > now), excluding expired ones', async () => {
    const now = new Date();
    const expiredCheckIn = makeCheckInStub({
      id: 'ci-expired',
      userId: 'user-2',
      activeUntil: new Date(now.getTime() - 60 * 1000), // 1 min ago
    });
    const activeCheckIn = makeCheckInStub({
      id: 'ci-active',
      userId: 'user-2',
      activeUntil: minutesFromNow(60),
    });

    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    // Route filters at DB level via `activeUntil: { gt: now }` — simulate by returning only active
    mockCheckIn.findMany.mockResolvedValueOnce([activeCheckIn]);

    const req = new NextRequest(FEED_URL, { method: 'GET' });
    const res = await feedGET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    const ids = json.data.map((ci: { id: string }) => ci.id);
    expect(ids).toContain('ci-active');
    expect(ids).not.toContain('ci-expired');
  });

  it('resolves crew partner IDs correctly when caller is userBId', async () => {
    // Crew row where caller is userBId — partner is userAId
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-partner', userBId: 'user-1' }]);
    mockCheckIn.findMany.mockResolvedValueOnce([
      makeCheckInStub({ id: 'ci-partner', userId: 'user-partner' }),
    ]);

    const req = new NextRequest(FEED_URL, { method: 'GET' });
    const res = await feedGET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // Visibility-scoped query uses OR clause — verify partner ID appears in at least one OR branch
    const whereArg = mockCheckIn.findMany.mock.calls[0][0].where as {
      OR?: Array<{ userId?: { in?: string[] } }>;
    };
    const crewIds = (whereArg.OR ?? []).flatMap((c) => c.userId?.in ?? []);
    expect(crewIds).toContain('user-partner');
  });

  it('resolves crew partner IDs correctly when caller is userAId', async () => {
    // Crew row where caller is userAId — partner is userBId
    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-partner-b' }]);
    mockCheckIn.findMany.mockResolvedValueOnce([
      makeCheckInStub({ id: 'ci-b', userId: 'user-partner-b' }),
    ]);

    const req = new NextRequest(FEED_URL, { method: 'GET' });
    const res = await feedGET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const whereArg2 = mockCheckIn.findMany.mock.calls[0][0].where as {
      OR?: Array<{ userId?: { in?: string[] } }>;
    };
    const crewIds2 = (whereArg2.OR ?? []).flatMap((c) => c.userId?.in ?? []);
    expect(crewIds2).toContain('user-partner-b');
  });

  it('orders results newest first (route passes orderBy: { createdAt: desc })', async () => {
    const older = makeCheckInStub({ id: 'ci-old', createdAt: new Date(Date.now() - 3600_000) });
    const newer = makeCheckInStub({ id: 'ci-new', createdAt: new Date(Date.now() - 60_000) });

    mockCrew.findMany.mockResolvedValueOnce([{ userAId: 'user-1', userBId: 'user-2' }]);
    // Return in newest-first order (as the DB would)
    mockCheckIn.findMany.mockResolvedValueOnce([newer, older]);

    const req = new NextRequest(FEED_URL, { method: 'GET' });
    const res = await feedGET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    const ids = json.data.map((ci: { id: string }) => ci.id);
    expect(ids[0]).toBe('ci-new');
    expect(ids[1]).toBe('ci-old');

    // Also verify the orderBy argument the route sent to Prisma
    const findManyCall = mockCheckIn.findMany.mock.calls[0][0] as {
      orderBy: { createdAt: string };
    };
    expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
  });
});

// ===========================================================================
// DELETE /api/checkins/[id] — edge cases
// ===========================================================================

describe('DELETE /api/checkins/[id] — edge cases', () => {
  it('deletes an expired check-in (activeUntil in the past) — returns 200', async () => {
    const expiredCheckIn = {
      id: 'ci-expired',
      userId: 'user-1',
      activeUntil: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    };

    mockCheckIn.findUnique.mockResolvedValueOnce(expiredCheckIn);
    mockCheckIn.delete.mockResolvedValueOnce(expiredCheckIn);

    const req = makeDeleteReq('ci-expired');
    const res = await DELETE(req, { params: { id: 'ci-expired' } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockCheckIn.delete).toHaveBeenCalledWith({ where: { id: 'ci-expired' } });
  });

  it('returns 404 on second delete (check-in already gone)', async () => {
    // Simulate double-delete: findUnique returns null on second call
    mockCheckIn.findUnique.mockResolvedValueOnce(null);

    const req = makeDeleteReq('ci-already-deleted');
    const res = await DELETE(req, { params: { id: 'ci-already-deleted' } });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    // delete should NOT be called when the row is already gone
    expect(mockCheckIn.delete).not.toHaveBeenCalled();
  });
});
