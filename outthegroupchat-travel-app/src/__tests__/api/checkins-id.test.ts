/**
 * Unit tests for GET /api/checkins/[id] and DELETE /api/checkins/[id]
 *
 * Phase 8 — launch-readiness re-audit.
 * Focused suite for the single-check-in detail + delete endpoint:
 *
 *   GET /api/checkins/[id]
 *     - Auth gate (401)
 *     - Rate-limit gate (429)
 *     - 404 when not found
 *     - 200 for PUBLIC check-in (any authenticated user)
 *     - 200 for own PRIVATE check-in
 *     - 404 for PRIVATE check-in of another user
 *     - 200 for CREW check-in when caller is accepted Crew member of poster
 *     - 404 for CREW check-in when caller is NOT a Crew member of poster
 *     - 500 on unexpected DB error
 *
 *   DELETE /api/checkins/[id]
 *     - Auth gate (401)
 *     - Rate-limit gate (429)
 *     - 200 and deletion when caller owns the check-in
 *     - 404 when check-in not found
 *     - 403 when caller does not own the check-in
 *     - Prisma delete is NOT called on ownership failure
 *     - 500 on unexpected DB error
 *
 * Global mocks (prisma, next-auth, logger, sentry) are provided by
 * src/__tests__/setup.ts.  Rate-limit is re-mocked here for local control.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Rate-limit mock — must be declared before route imports
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

import { GET, DELETE } from '@/app/api/checkins/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed Prisma delegates
// ---------------------------------------------------------------------------
const mockCheckIn = prisma.checkIn as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockCrew = prisma.crew as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
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

const makeGetReq = (id: string) =>
  new NextRequest(`${BASE_URL}/${id}`, { method: 'GET' });

const makeDeleteReq = (id: string) =>
  new NextRequest(`${BASE_URL}/${id}`, { method: 'DELETE' });

const paramsFor = (id: string) => ({ params: { id } });

const fakeCheckIn = (overrides: Record<string, unknown> = {}) => ({
  id: 'ci-abc',
  userId: 'user-1',
  venueId: null,
  note: 'Hanging out',
  latitude: null,
  longitude: null,
  visibility: 'PUBLIC' as const,
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
// beforeEach — reset and re-arm
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/checkins/[id]
// ===========================================================================

describe('GET /api/checkins/[id]', () => {
  // -------------------------------------------------------------------------
  // Auth gate
  // -------------------------------------------------------------------------
  it('returns 401 when no session exists', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq('ci-abc'), paramsFor('ci-abc'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  // -------------------------------------------------------------------------
  // Rate limit
  // -------------------------------------------------------------------------
  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET(makeGetReq('ci-abc'), paramsFor('ci-abc'));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------
  it('returns 404 when check-in does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckIn.findUnique.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq('ci-missing'), paramsFor('ci-missing'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Check-in not found');
  });

  // -------------------------------------------------------------------------
  // Visibility: PUBLIC
  // -------------------------------------------------------------------------
  it('returns 200 for a PUBLIC check-in regardless of caller identity', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-99'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-public', userId: 'user-1', visibility: 'PUBLIC' })
    );

    const res = await GET(makeGetReq('ci-public'), paramsFor('ci-public'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('ci-public');
  });

  it('does NOT call prisma.crew.findFirst for PUBLIC check-ins', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-99'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-pub', userId: 'user-1', visibility: 'PUBLIC' })
    );

    await GET(makeGetReq('ci-pub'), paramsFor('ci-pub'));

    expect(mockCrew.findFirst).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Visibility: PRIVATE
  // -------------------------------------------------------------------------
  it('returns 200 for own PRIVATE check-in (caller === poster)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-priv', userId: 'user-1', visibility: 'PRIVATE' })
    );

    const res = await GET(makeGetReq('ci-priv'), paramsFor('ci-priv'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('ci-priv');
  });

  it('returns 404 for PRIVATE check-in of another user', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-99'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-priv-other', userId: 'user-1', visibility: 'PRIVATE' })
    );

    const res = await GET(makeGetReq('ci-priv-other'), paramsFor('ci-priv-other'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    // Route returns generic "Not found" for access-denied cases
    expect(body.error).toBe('Not found');
  });

  // -------------------------------------------------------------------------
  // Visibility: CREW
  // -------------------------------------------------------------------------
  it('returns 200 for CREW check-in when caller is an accepted Crew member of the poster', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-2'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-crew', userId: 'user-1', visibility: 'CREW' })
    );
    // Crew row exists → access granted
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'crew-row-1', userAId: 'user-1', userBId: 'user-2', status: 'ACCEPTED' });

    const res = await GET(makeGetReq('ci-crew'), paramsFor('ci-crew'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('ci-crew');
  });

  it('returns 404 for CREW check-in when caller is NOT a Crew member of the poster', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-stranger'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-crew-blocked', userId: 'user-1', visibility: 'CREW' })
    );
    // No crew row → access denied
    mockCrew.findFirst.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq('ci-crew-blocked'), paramsFor('ci-crew-blocked'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not found');
  });

  it('queries crew with ACCEPTED status and correct user pair for CREW check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-2'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-crew-q', userId: 'user-1', visibility: 'CREW' })
    );
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'cr1', userAId: 'user-1', userBId: 'user-2', status: 'ACCEPTED' });

    await GET(makeGetReq('ci-crew-q'), paramsFor('ci-crew-q'));

    const crewWhere = mockCrew.findFirst.mock.calls[0][0].where;
    expect(crewWhere.status).toBe('ACCEPTED');
    // OR must include both orderings of the user pair
    const orClauses: Array<{ userAId?: string; userBId?: string }> = crewWhere.OR ?? [];
    const hasForward = orClauses.some((c) => c.userAId === 'user-2' && c.userBId === 'user-1');
    const hasReverse = orClauses.some((c) => c.userAId === 'user-1' && c.userBId === 'user-2');
    expect(hasForward || hasReverse).toBe(true);
    expect(orClauses.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.checkIn.findUnique throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckIn.findUnique.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await GET(makeGetReq('ci-err'), paramsFor('ci-err'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch check-in');
  });
});

// ===========================================================================
// DELETE /api/checkins/[id]
// ===========================================================================

describe('DELETE /api/checkins/[id]', () => {
  // -------------------------------------------------------------------------
  // Auth gate
  // -------------------------------------------------------------------------
  it('returns 401 when no session exists', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteReq('ci-abc'), paramsFor('ci-abc'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  // -------------------------------------------------------------------------
  // Rate limit
  // -------------------------------------------------------------------------
  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await DELETE(makeDeleteReq('ci-abc'), paramsFor('ci-abc'));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  // -------------------------------------------------------------------------
  // Successful deletion
  // -------------------------------------------------------------------------
  it('returns 200 with success message when caller owns the check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-own', userId: 'user-1' })
    );
    mockCheckIn.delete.mockResolvedValueOnce(undefined);

    const res = await DELETE(makeDeleteReq('ci-own'), paramsFor('ci-own'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Check-in cancelled');
  });

  it('calls prisma.checkIn.delete with correct id', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-delete-me', userId: 'user-1' })
    );
    mockCheckIn.delete.mockResolvedValueOnce(undefined);

    await DELETE(makeDeleteReq('ci-delete-me'), paramsFor('ci-delete-me'));

    expect(mockCheckIn.delete).toHaveBeenCalledTimes(1);
    expect(mockCheckIn.delete).toHaveBeenCalledWith({ where: { id: 'ci-delete-me' } });
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------
  it('returns 404 when check-in does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckIn.findUnique.mockResolvedValueOnce(null);

    const res = await DELETE(makeDeleteReq('ci-missing'), paramsFor('ci-missing'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Check-in not found');
  });

  it('does NOT call prisma.checkIn.delete when check-in is not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckIn.findUnique.mockResolvedValueOnce(null);

    await DELETE(makeDeleteReq('ci-gone'), paramsFor('ci-gone'));

    expect(mockCheckIn.delete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Ownership / 403
  // -------------------------------------------------------------------------
  it('returns 403 when caller does not own the check-in', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-2'));
    // Check-in belongs to user-1
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-other', userId: 'user-1' })
    );

    const res = await DELETE(makeDeleteReq('ci-other'), paramsFor('ci-other'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('does NOT call prisma.checkIn.delete when caller is not the owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-intruder'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-protected', userId: 'user-owner' })
    );

    await DELETE(makeDeleteReq('ci-protected'), paramsFor('ci-protected'));

    expect(mockCheckIn.delete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.checkIn.delete throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckIn.findUnique.mockResolvedValueOnce(
      fakeCheckIn({ id: 'ci-err', userId: 'user-1' })
    );
    mockCheckIn.delete.mockRejectedValueOnce(new Error('Constraint violation'));

    const res = await DELETE(makeDeleteReq('ci-err'), paramsFor('ci-err'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to cancel check-in');
  });
});
