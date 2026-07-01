/**
 * Unit tests for venue persistence on the SubCrew detail PATCH route:
 *   PATCH /api/subcrews/[id]
 *
 * The route (Phase 3) lets a SEED member bind a venue to a SubCrew via the
 * `venueId` field. These tests assert against the EXISTING route behavior
 * (the route is not modified):
 *   1. A valid `venueId` is persisted (prisma.subCrew.update called with venueId).
 *   2. Authorization — only a SEED member may PATCH; non-seed / non-member gets
 *      404 (the route uses 404 not 403 to avoid leaking existence).
 *   3. Zod validation — invalid body rejected with 400.
 *   4. Unauthenticated request (no session) rejected with 401.
 *
 * Global mocks (prisma, next-auth, sentry, logger) come from
 * src/__tests__/setup.ts. Rate-limit is mocked locally so we can re-arm
 * mockResolvedValue after vi.resetAllMocks() in beforeEach (known gotcha:
 * resetAllMocks wipes factory-level mockResolvedValue -> post-auth 500s).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { PATCH } from '@/app/api/subcrews/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;

const mockSubCrew = prisma.subCrew as unknown as { update: MockFn };
const mockSubCrewMember = prisma.subCrewMember as unknown as {
  findFirst: MockFn;
};
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };

// A valid CUID (matches z.string().cuid()).
const VALID_VENUE_ID = 'cltestvenue00000000000abc';

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makePatchReq = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm rate-limit passthrough after resetAllMocks wipes the factory-level
  // mockResolvedValue (otherwise every post-auth request 500s).
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// PATCH /api/subcrews/[id] — venue persistence + authz + validation
// ===========================================================================
describe('PATCH /api/subcrews/[id] (venue persistence)', () => {
  const params = { params: { id: 'sc-1' } };

  // -------------------------------------------------------------------------
  // 4. Unauthenticated
  // -------------------------------------------------------------------------
  it('401 when unauthenticated (no session)', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(
      makePatchReq('/api/subcrews/sc-1', { venueId: VALID_VENUE_ID }),
      params,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Unauthorized/i);
    // Authz short-circuits before touching the DB.
    expect(mockSubCrew.update).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Zod validation
  // -------------------------------------------------------------------------
  it('400 when body is not valid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const req = new NextRequest('http://localhost/api/subcrews/sc-1', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON body/i);
  });

  it('400 when venueId is not a CUID (Zod validation failure)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH(
      makePatchReq('/api/subcrews/sc-1', { venueId: 'not-a-cuid' }),
      params,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/i);
    expect(body.details).toBeDefined();
    // Rejected before any authz/DB write.
    expect(mockSubCrewMember.findFirst).not.toHaveBeenCalled();
    expect(mockSubCrew.update).not.toHaveBeenCalled();
  });

  it('400 when body is empty (refine: at least one field required)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH(makePatchReq('/api/subcrews/sc-1', {}), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/i);
  });

  it('400 when SubCrew id missing from params', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH(
      makePatchReq('/api/subcrews/', { venueId: VALID_VENUE_ID }),
      { params: { id: '' } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/SubCrew id required/i);
  });

  // -------------------------------------------------------------------------
  // 2. Authorization — SEED-only
  // -------------------------------------------------------------------------
  it('404 when caller is not a SEED member (non-member / non-seed cannot PATCH)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-outsider'));
    // No SEED membership row -> not authorized.
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchReq('/api/subcrews/sc-1', { venueId: VALID_VENUE_ID }),
      params,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Not found/i);
    // Authz gate blocks the write.
    expect(mockSubCrew.update).not.toHaveBeenCalled();
  });

  it('authz query scopes to SEED joinMode for the caller + subcrew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-seed'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce(null);

    await PATCH(
      makePatchReq('/api/subcrews/sc-1', { venueId: VALID_VENUE_ID }),
      params,
    );

    expect(mockSubCrewMember.findFirst).toHaveBeenCalledWith({
      where: { subCrewId: 'sc-1', userId: 'user-seed', joinMode: 'SEED' },
      select: { id: true },
    });
  });

  // -------------------------------------------------------------------------
  // 1. Venue persistence
  // -------------------------------------------------------------------------
  it('200 persists venueId when caller is a SEED member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-seed'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'member-seed' });
    mockSubCrew.update.mockResolvedValueOnce({
      id: 'sc-1',
      startAt: null,
      endAt: null,
      venueId: VALID_VENUE_ID,
      cityArea: null,
    });

    const res = await PATCH(
      makePatchReq('/api/subcrews/sc-1', { venueId: VALID_VENUE_ID }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.venueId).toBe(VALID_VENUE_ID);

    // Assert the write carried venueId and targeted the right row.
    expect(mockSubCrew.update).toHaveBeenCalledTimes(1);
    const updateArg = mockSubCrew.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'sc-1' });
    expect(updateArg.data).toMatchObject({ venueId: VALID_VENUE_ID });
    // Untouched optional fields must not be written.
    expect(updateArg.data.startAt).toBeUndefined();
    expect(updateArg.data.endAt).toBeUndefined();
    expect(updateArg.data.cityArea).toBeUndefined();
  });

  it('200 clears venueId when null is sent (unbind venue)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-seed'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'member-seed' });
    mockSubCrew.update.mockResolvedValueOnce({
      id: 'sc-1',
      startAt: null,
      endAt: null,
      venueId: null,
      cityArea: null,
    });

    const res = await PATCH(
      makePatchReq('/api/subcrews/sc-1', { venueId: null }),
      params,
    );
    expect(res.status).toBe(200);

    const updateArg = mockSubCrew.update.mock.calls[0][0];
    // venueId must be explicitly present as null (not merely undefined).
    expect(updateArg.data).toHaveProperty('venueId', null);
  });

  it('500 when DB update throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-seed'));
    mockSubCrewMember.findFirst.mockResolvedValueOnce({ id: 'member-seed' });
    mockSubCrew.update.mockRejectedValueOnce(new Error('db down'));

    const res = await PATCH(
      makePatchReq('/api/subcrews/sc-1', { venueId: VALID_VENUE_ID }),
      params,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to update subcrew/i);
  });
});
