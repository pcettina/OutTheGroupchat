/**
 * Security-hardening edge-case tests for check-in privacy / stalking-mitigation.
 *
 * Phase 8 launch-readiness action #3 — "check-in stalking mitigation,
 * activeUntil as the first line of defense."
 *
 * These tests assert ONLY behavior the routes actually implement (verified by
 * reading the route source). The threat model defended here:
 *   - A check-in must auto-expire (activeUntil) so a stalker cannot indefinitely
 *     follow someone's last-known position. The feed must never surface a
 *     check-in whose activeUntil has passed.
 *   - activeUntil is clamped to [now+30min, now+12h] (default now+6h) so a user
 *     cannot accidentally (or be coerced into) broadcasting presence for days.
 *   - PRIVATE check-ins are never surfaced to crew; CREW check-ins only to
 *     accepted crew; the single-resource fetch enforces the same gate.
 *   - Only the owner may delete; non-owner is forbidden; unauthenticated is 401.
 *
 * Mock/setup idiom copied from src/__tests__/api/checkins.test.ts:
 *   - @/lib/rate-limit is re-mocked at module scope for a controllable ref.
 *   - vi.clearAllMocks() in beforeEach (config also sets clearMocks:true) — this
 *     flushes call history + queued return values but does NOT reset the
 *     implementations installed by setup.ts / the factory below.
 *   - checkRateLimit is re-armed in beforeEach because clearing wipes its
 *     factory-level mockResolvedValue.
 *   - Every test arms its own mocks via mockResolvedValueOnce — never
 *     mockResolvedValue — so no state leaks between tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — declared before any import that
// transitively pulls the module.
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

// Static imports — never dynamic import in beforeEach.
import { POST, GET } from '@/app/api/checkins/route';
import { GET as GET_FEED } from '@/app/api/checkins/feed/route';
import { GET as GET_DETAIL, DELETE } from '@/app/api/checkins/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegates
// ---------------------------------------------------------------------------
const mockPrismaCheckIn = prisma.checkIn as unknown as {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockPrismaCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

const mockPrismaNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
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

const makeFeedReq = () => new NextRequest('http://localhost/api/checkins/feed');

const makeDetailReq = () =>
  new NextRequest('http://localhost/api/checkins/checkin-1');

const makeDeleteReq = () =>
  new NextRequest('http://localhost/api/checkins/checkin-1', { method: 'DELETE' });

/** Minimal check-in record returned from prisma. */
const fakeCheckIn = (overrides: Record<string, unknown> = {}) => ({
  id: 'checkin-abc-123',
  userId: 'user-1',
  venueId: null,
  cityId: null,
  note: null,
  visibility: 'CREW',
  latitude: null,
  longitude: null,
  activeUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 'user-1', name: 'Alice', image: null },
  venue: null,
  ...overrides,
});

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// ---------------------------------------------------------------------------
// beforeEach — clear history + re-arm the permanent rate-limit pass-through.
// clearAllMocks does NOT reset implementations (factory mocks survive), but it
// DOES flush the factory-level mockResolvedValue, so re-arm it here.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// 1. activeUntil clamping — the first line of defense against indefinite
//    presence broadcast.
// ===========================================================================
describe('activeUntil clamping (stalking-mitigation: bounded presence window)', () => {
  it('clamps an override BELOW now+30min UP to the now+30min floor', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCheckIn.create.mockResolvedValueOnce(fakeCheckIn());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    // Request only 5 minutes from now — below the 30-minute floor.
    const tooSoon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const before = Date.now();
    const res = await POST(
      makePostReq({ note: 'Quick stop', activeUntilOverride: tooSoon })
    );
    const after = Date.now();

    expect(res.status).toBe(201);

    const createArg = mockPrismaCheckIn.create.mock.calls[0]?.[0]?.data;
    const activeUntil: Date = createArg?.activeUntil;
    expect(activeUntil).toBeInstanceOf(Date);

    // Must be clamped UP to ~now+30min (not left at the requested +5min).
    const floorMin = before + 30 * 60 * 1000 - 1000;
    const floorMax = after + 30 * 60 * 1000 + 1000;
    expect(activeUntil.getTime()).toBeGreaterThanOrEqual(floorMin);
    expect(activeUntil.getTime()).toBeLessThanOrEqual(floorMax);
    // Definitely greater than the requested 5-minute value.
    expect(activeUntil.getTime()).toBeGreaterThan(before + 5 * 60 * 1000);
  });

  it('clamps an override ABOVE now+12h DOWN to the now+12h ceiling', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCheckIn.create.mockResolvedValueOnce(fakeCheckIn());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    // Request 48h from now — well above the 12h ceiling.
    const far = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const before = Date.now();
    const res = await POST(
      makePostReq({ note: 'Way too long', activeUntilOverride: far })
    );
    const after = Date.now();

    expect(res.status).toBe(201);

    const createArg = mockPrismaCheckIn.create.mock.calls[0]?.[0]?.data;
    const activeUntil: Date = createArg?.activeUntil;
    expect(activeUntil).toBeInstanceOf(Date);

    const ceilMin = before + 12 * 60 * 60 * 1000 - 1000;
    const ceilMax = after + 12 * 60 * 60 * 1000 + 1000;
    expect(activeUntil.getTime()).toBeGreaterThanOrEqual(ceilMin);
    expect(activeUntil.getTime()).toBeLessThanOrEqual(ceilMax);
    // Definitely less than the requested 48h value.
    expect(activeUntil.getTime()).toBeLessThan(before + 48 * 60 * 60 * 1000);
  });

  it('defaults activeUntil to ~now+6h when no override is supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCheckIn.create.mockResolvedValueOnce(fakeCheckIn());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const before = Date.now();
    const res = await POST(makePostReq({ note: 'Just out' }));
    const after = Date.now();

    expect(res.status).toBe(201);

    const createArg = mockPrismaCheckIn.create.mock.calls[0]?.[0]?.data;
    const activeUntil: Date = createArg?.activeUntil;
    expect(activeUntil).toBeInstanceOf(Date);

    const expectedMin = before + 6 * 60 * 60 * 1000;
    const expectedMax = after + 6 * 60 * 60 * 1000;
    expect(activeUntil.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(activeUntil.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('keeps an in-bounds override (now+2h) unclamped', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaCheckIn.create.mockResolvedValueOnce(fakeCheckIn());
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);

    const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const res = await POST(
      makePostReq({ note: 'Couple hours', activeUntilOverride: twoHours.toISOString() })
    );

    expect(res.status).toBe(201);

    const createArg = mockPrismaCheckIn.create.mock.calls[0]?.[0]?.data;
    const activeUntil: Date = createArg?.activeUntil;
    expect(activeUntil).toBeInstanceOf(Date);

    // Within bounds: should equal the requested time (to the millisecond, since
    // the route just constructs new Date(override)).
    expect(activeUntil.getTime()).toBe(twoHours.getTime());
  });
});

// ===========================================================================
// 2. Feed excludes expired check-ins — the core stalking-mitigation guarantee.
// ===========================================================================
describe('GET /api/checkins/feed — expiry filtering (activeUntil > now)', () => {
  it('passes an activeUntil > now filter to the prisma query', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    const before = Date.now();
    await GET_FEED(makeFeedReq());
    const after = Date.now();

    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    // The expiry gate: activeUntil greater-than "now".
    const gt: Date = whereArg?.activeUntil?.gt;
    expect(gt).toBeInstanceOf(Date);
    expect(gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(gt.getTime()).toBeLessThanOrEqual(after);
  });

  it('only returns the rows prisma yields (expired rows are excluded at the DB layer)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);

    // Simulate the DB having already filtered out the expired check-in:
    // only the active one comes back. The route must surface exactly what the
    // (expiry-gated) query returns.
    const active = fakeCheckIn({
      id: 'ci-active',
      userId: 'user-2',
      visibility: 'PUBLIC',
      activeUntil: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([active]);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ci-active');
  });
});

// ===========================================================================
// 3. Visibility gating in the feed — PRIVATE never leaks to crew; CREW/PUBLIC
//    scoping is encoded in the OR clause.
// ===========================================================================
describe('GET /api/checkins/feed — visibility scoping', () => {
  it('does NOT request crew partners\' PRIVATE check-ins in any OR branch', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    const orClauses: Array<{ userId?: unknown; visibility?: string }> = whereArg?.OR ?? [];

    // Any branch that scopes to crew partners (userId.in includes a partner)
    // must NOT request PRIVATE visibility.
    const crewBranches = orClauses.filter((c) => {
      const inList = (c.userId as { in?: string[] } | undefined)?.in;
      return Array.isArray(inList) && inList.includes('user-2');
    });
    expect(crewBranches.length).toBeGreaterThan(0);
    for (const branch of crewBranches) {
      expect(branch.visibility).not.toBe('PRIVATE');
    }
  });

  it('scopes crew branches to exactly PUBLIC and CREW visibility', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    const orClauses: Array<{ userId?: unknown; visibility?: string }> = whereArg?.OR ?? [];

    const crewVisibilities = orClauses
      .filter((c) => {
        const inList = (c.userId as { in?: string[] } | undefined)?.in;
        return Array.isArray(inList) && inList.includes('user-2');
      })
      .map((c) => c.visibility)
      .filter((v): v is string => typeof v === 'string')
      .sort();

    expect(crewVisibilities).toEqual(['CREW', 'PUBLIC']);
  });

  it('always includes an own-check-ins branch (caller sees their own PRIVATE)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCrew.findMany.mockResolvedValueOnce([]);
    mockPrismaCheckIn.findMany.mockResolvedValueOnce([]);

    await GET_FEED(makeFeedReq());

    const whereArg = mockPrismaCheckIn.findMany.mock.calls[0]?.[0]?.where;
    const orClauses: Array<{ userId?: unknown; visibility?: string }> = whereArg?.OR ?? [];

    // There must be a branch matching the caller by direct userId equality with
    // NO visibility restriction (so the caller sees their own PRIVATE check-ins).
    const ownBranch = orClauses.find(
      (c) => c.userId === 'user-1' && c.visibility === undefined
    );
    expect(ownBranch).toBeDefined();
  });
});

// ===========================================================================
// 3b. Single-resource visibility gate — GET /api/checkins/[id].
// ===========================================================================
describe('GET /api/checkins/[id] — per-resource visibility gate', () => {
  const params = { params: { id: 'checkin-1' } };

  it('hides a non-owner\'s PRIVATE check-in even from accepted crew (404)', async () => {
    // Caller user-1 is accepted crew of user-2, but the check-in is PRIVATE.
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-2', visibility: 'PRIVATE' })
    );

    const res = await GET_DETAIL(makeDetailReq(), params);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    // PRIVATE never triggers a crew lookup — the gate short-circuits to 404.
    expect(mockPrismaCrew.findFirst).not.toHaveBeenCalled();
  });

  it('serves a CREW check-in to an accepted crew member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-2', visibility: 'CREW' })
    );
    // Accepted crew row found.
    mockPrismaCrew.findFirst.mockResolvedValueOnce({ id: 'crew-1', status: 'ACCEPTED' });

    const res = await GET_DETAIL(makeDetailReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('checkin-1');
  });

  it('hides a CREW check-in from a non-crew member (404)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-2', visibility: 'CREW' })
    );
    // No accepted crew relationship.
    mockPrismaCrew.findFirst.mockResolvedValueOnce(null);

    const res = await GET_DETAIL(makeDetailReq(), params);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('serves a PUBLIC check-in to any authenticated user without a crew lookup', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('stranger-9'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-2', visibility: 'PUBLIC' })
    );

    const res = await GET_DETAIL(makeDetailReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaCrew.findFirst).not.toHaveBeenCalled();
  });

  it('serves the owner their own PRIVATE check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-2'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-2', visibility: 'PRIVATE' })
    );

    const res = await GET_DETAIL(makeDetailReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaCrew.findFirst).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET_DETAIL(makeDetailReq(), params);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// 4. DELETE ownership enforcement.
// ===========================================================================
describe('DELETE /api/checkins/[id] — owner-only deletion', () => {
  const params = { params: { id: 'checkin-1' } };

  it('lets the owner delete their own check-in (200) and calls prisma.delete', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-1' })
    );
    mockPrismaCheckIn.delete.mockResolvedValueOnce(undefined);

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaCheckIn.delete).toHaveBeenCalledWith({ where: { id: 'checkin-1' } });
  });

  it('forbids a non-owner from deleting another user\'s check-in (403, no delete)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'checkin-1', userId: 'user-2' })
    );

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Forbidden');
    expect(mockPrismaCheckIn.delete).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaCheckIn.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Check-in not found');
    expect(mockPrismaCheckIn.delete).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated (no DB access)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteReq(), params);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaCheckIn.findUnique).not.toHaveBeenCalled();
    expect(mockPrismaCheckIn.delete).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. Unauthenticated POST / GET — auth gate on the collection routes.
// ===========================================================================
describe('Unauthenticated access to /api/checkins', () => {
  it('POST returns 401 and never touches prisma.checkIn.create', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ note: 'should not persist' }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaCheckIn.create).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('GET (own check-ins) returns 401 and never queries prisma', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(new NextRequest(BASE_URL));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaCheckIn.findMany).not.toHaveBeenCalled();
  });

  it('GET feed returns 401 and never queries prisma', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET_FEED(makeFeedReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaCrew.findMany).not.toHaveBeenCalled();
    expect(mockPrismaCheckIn.findMany).not.toHaveBeenCalled();
  });
});
