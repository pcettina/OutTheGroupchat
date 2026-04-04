/**
 * Integration tests for trip cascade delete and member management flows.
 *
 * Coverage:
 *   DELETE /api/trips/[tripId]           — full delete lifecycle, auth guards, shape
 *   PATCH  /api/trips/[tripId]/members   — role updates, budget/departure tracking, 403/400/401
 *   DELETE /api/trips/[tripId]/members   — removal scenarios, self-leave, auth guards, 404
 *
 * Strategy
 * --------
 * - Uses NextRequest throughout (route accepts Request but NextRequest is a
 *   subclass; it satisfies the type and is the correct pattern for Next.js
 *   handlers per project rules).
 * - mockResolvedValueOnce only — no persistent mock state.
 * - vi.clearAllMocks() in beforeEach.
 * - Preemptive rate-limit mock so Wave 2 additions do not break the suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

import { DELETE as tripDelete } from '@/app/api/trips/[tripId]/route';
import {
  PATCH as membersPatch,
  DELETE as membersDelete,
  POST as membersPost,
} from '@/app/api/trips/[tripId]/members/route';

// ---------------------------------------------------------------------------
// Preemptive rate-limit mock (Wave 2 will add limiting to these routes)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);

const mockPrismaTrip = vi.mocked(prisma.trip) as typeof prisma.trip & {
  findFirst: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockPrismaTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockPrismaUser = vi.mocked(prisma.user) as typeof prisma.user & {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const OWNER_USER_ID = 'cascade-owner-001';
const ADMIN_USER_ID = 'cascade-admin-002';
const MEMBER_USER_ID = 'cascade-member-003';
const STRANGER_USER_ID = 'cascade-stranger-004';
const MOCK_TRIP_ID = 'cascade-trip-001';
const OWNER_MEMBER_ROW_ID = 'cascade-mrow-owner-001';
const ADMIN_MEMBER_ROW_ID = 'cascade-mrow-admin-002';
const MEMBER_ROW_ID = 'cascade-mrow-member-003';

const OWNER_SESSION = {
  user: { id: OWNER_USER_ID, name: 'Trip Owner', email: 'owner@cascade.com' },
  expires: '2099-01-01',
};

const ADMIN_SESSION = {
  user: { id: ADMIN_USER_ID, name: 'Trip Admin', email: 'admin@cascade.com' },
  expires: '2099-01-01',
};

const MEMBER_SESSION = {
  user: { id: MEMBER_USER_ID, name: 'Trip Member', email: 'member@cascade.com' },
  expires: '2099-01-01',
};

const STRANGER_SESSION = {
  user: { id: STRANGER_USER_ID, name: 'Stranger', email: 'stranger@cascade.com' },
  expires: '2099-01-01',
};

/** Trip membership row: owner */
const OWNER_MEMBER_ROW = {
  id: OWNER_MEMBER_ROW_ID,
  tripId: MOCK_TRIP_ID,
  userId: OWNER_USER_ID,
  role: 'OWNER',
  joinedAt: new Date('2026-01-01'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

/** Trip membership row: admin */
const ADMIN_MEMBER_ROW = {
  id: ADMIN_MEMBER_ROW_ID,
  tripId: MOCK_TRIP_ID,
  userId: ADMIN_USER_ID,
  role: 'ADMIN',
  joinedAt: new Date('2026-01-02'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

/** Trip membership row: regular member */
const REGULAR_MEMBER_ROW = {
  id: MEMBER_ROW_ID,
  tripId: MOCK_TRIP_ID,
  userId: MEMBER_USER_ID,
  role: 'MEMBER',
  joinedAt: new Date('2026-01-03'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

// ---------------------------------------------------------------------------
// Request helpers — use NextRequest per project rules
// ---------------------------------------------------------------------------
function makeNextRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
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

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Clear all mocks before every test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// DELETE /api/trips/[tripId] — cascade delete lifecycle
// ===========================================================================
describe('DELETE /api/trips/[tripId] — cascade delete', () => {
  async function callTripDelete(
    tripId: string,
    session: unknown = OWNER_SESSION
  ): Promise<Response> {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeNextRequest(`/api/trips/${tripId}`, { method: 'DELETE' });
    return tripDelete(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 with correct error shape when no session is provided', async () => {
    const res = await callTripDelete(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTrip.findFirst).not.toHaveBeenCalled();
    expect(mockPrismaTrip.delete).not.toHaveBeenCalled();
  });

  it('returns 200 with success message when owner deletes their trip', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID, ownerId: OWNER_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
    );
    mockPrismaTrip.delete.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.delete>>
    );

    const res = await callTripDelete(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Trip deleted successfully');
  });

  it('returns 403 with correct error when a non-owner admin tries to delete', async () => {
    // isTripOwner uses trip.findFirst with ownerId check; admin is not the owner
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    const res = await callTripDelete(MOCK_TRIP_ID, ADMIN_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Only the trip owner can delete this trip');
    expect(mockPrismaTrip.delete).not.toHaveBeenCalled();
  });

  it('returns 403 when a regular member tries to delete the trip', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    const res = await callTripDelete(MOCK_TRIP_ID, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Only the trip owner can delete this trip');
  });

  it('returns 403 when a stranger (non-member) tries to delete the trip', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    const res = await callTripDelete(MOCK_TRIP_ID, STRANGER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Only the trip owner can delete this trip');
    expect(mockPrismaTrip.delete).not.toHaveBeenCalled();
  });

  it('calls trip.findFirst with the correct tripId and userId for ownership check', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID, ownerId: OWNER_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
    );
    mockPrismaTrip.delete.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.delete>>
    );

    await callTripDelete(MOCK_TRIP_ID);

    expect(mockPrismaTrip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MOCK_TRIP_ID,
          ownerId: OWNER_USER_ID,
        }),
      })
    );
  });

  it('calls trip.delete with the correct tripId after ownership is confirmed', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID, ownerId: OWNER_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
    );
    mockPrismaTrip.delete.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.delete>>
    );

    await callTripDelete(MOCK_TRIP_ID);

    expect(mockPrismaTrip.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOCK_TRIP_ID } })
    );
  });

  it('returns 500 when prisma.trip.delete throws an unexpected error', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(
      { id: MOCK_TRIP_ID, ownerId: OWNER_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.trip.findFirst>>
    );
    mockPrismaTrip.delete.mockRejectedValueOnce(new Error('DB constraint violation'));

    const res = await callTripDelete(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to delete trip');
  });

  it('does not call trip.delete when ownership check fails', async () => {
    mockPrismaTrip.findFirst.mockResolvedValueOnce(null);

    await callTripDelete(MOCK_TRIP_ID, STRANGER_SESSION);

    expect(mockPrismaTrip.delete).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PATCH /api/trips/[tripId]/members — role updates + budget/departure tracking
// ===========================================================================
describe('PATCH /api/trips/[tripId]/members — role and tracking updates', () => {
  async function callMembersPatch(
    tripId: string,
    body: unknown,
    session: unknown = OWNER_SESSION
  ): Promise<Response> {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeNextRequest(`/api/trips/${tripId}/members`, { method: 'PATCH', body });
    return membersPatch(req, { params: { tripId } });
  }

  it('returns 401 with correct error shape when no session is provided', async () => {
    const res = await callMembersPatch(
      MOCK_TRIP_ID,
      { memberId: MEMBER_ROW_ID, role: 'ADMIN' },
      null
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('promotes a member to ADMIN when requested by the owner', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...REGULAR_MEMBER_ROW,
      role: 'ADMIN',
      user: { id: MEMBER_USER_ID, name: 'Trip Member', email: 'member@cascade.com', image: null },
    });

    const res = await callMembersPatch(MOCK_TRIP_ID, {
      memberId: MEMBER_ROW_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect((body.data as Record<string, unknown>).role).toBe('ADMIN');
    expect(mockPrismaTripMember.update).toHaveBeenCalledOnce();
  });

  it('demotes an admin back to MEMBER when requested by the owner', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(ADMIN_MEMBER_ROW);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...ADMIN_MEMBER_ROW,
      role: 'MEMBER',
      user: { id: ADMIN_USER_ID, name: 'Trip Admin', email: 'admin@cascade.com', image: null },
    });

    const res = await callMembersPatch(MOCK_TRIP_ID, {
      memberId: ADMIN_MEMBER_ROW_ID,
      role: 'MEMBER',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect((body.data as Record<string, unknown>).role).toBe('MEMBER');
  });

  it('allows an admin to update another member role', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(ADMIN_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...REGULAR_MEMBER_ROW,
      role: 'ADMIN',
      user: { id: MEMBER_USER_ID, name: 'Trip Member', email: 'member@cascade.com', image: null },
    });

    const res = await callMembersPatch(
      MOCK_TRIP_ID,
      { memberId: MEMBER_ROW_ID, role: 'ADMIN' },
      ADMIN_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTripMember.update).toHaveBeenCalledOnce();
  });

  it('returns 403 when a regular member tries to change another member role', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(ADMIN_MEMBER_ROW);

    const res = await callMembersPatch(
      MOCK_TRIP_ID,
      { memberId: ADMIN_MEMBER_ROW_ID, role: 'MEMBER' },
      MEMBER_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to change roles');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 400 when the role value is invalid', async () => {
    // Validation runs before findFirst so no mock needed for prisma
    const res = await callMembersPatch(MOCK_TRIP_ID, {
      memberId: MEMBER_ROW_ID,
      role: 'OWNER', // OWNER is not in the enum — only ADMIN/MEMBER allowed
    });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('allows a member to update their own budget range', async () => {
    // The requesting member (MEMBER_USER_ID) is also the target
    const selfRow = { ...REGULAR_MEMBER_ROW, userId: MEMBER_USER_ID };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(selfRow);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(selfRow);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...selfRow,
      budgetRange: { min: 800, max: 1500, currency: 'USD' },
      user: { id: MEMBER_USER_ID, name: 'Trip Member', email: 'member@cascade.com', image: null },
    });

    const res = await callMembersPatch(
      MOCK_TRIP_ID,
      { memberId: MEMBER_ROW_ID, budgetRange: { min: 800, max: 1500, currency: 'USD' } },
      MEMBER_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTripMember.update).toHaveBeenCalledOnce();
  });

  it('allows a member to update their own departure city', async () => {
    const selfRow = { ...REGULAR_MEMBER_ROW, userId: MEMBER_USER_ID };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(selfRow);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(selfRow);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...selfRow,
      departureCity: 'Dallas',
      user: { id: MEMBER_USER_ID, name: 'Trip Member', email: 'member@cascade.com', image: null },
    });

    const res = await callMembersPatch(
      MOCK_TRIP_ID,
      { memberId: MEMBER_ROW_ID, departureCity: 'Dallas' },
      MEMBER_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('allows an owner to update a member departure city on their behalf', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...REGULAR_MEMBER_ROW,
      departureCity: 'Seattle',
      user: { id: MEMBER_USER_ID, name: 'Trip Member', email: 'member@cascade.com', image: null },
    });

    const res = await callMembersPatch(MOCK_TRIP_ID, {
      memberId: MEMBER_ROW_ID,
      departureCity: 'Seattle',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 403 when a non-member (stranger) makes a PATCH request', async () => {
    // Stranger is not in the trip at all — findFirst returns null
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callMembersPatch(
      MOCK_TRIP_ID,
      { memberId: MEMBER_ROW_ID, role: 'ADMIN' },
      STRANGER_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the target memberId does not exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(null);

    const res = await callMembersPatch(MOCK_TRIP_ID, {
      memberId: 'nonexistent-member-id',
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the target member belongs to a different trip', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce({
      ...REGULAR_MEMBER_ROW,
      tripId: 'completely-different-trip-id',
    });

    const res = await callMembersPatch(MOCK_TRIP_ID, {
      memberId: MEMBER_ROW_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('calls tripMember.update with the correct memberId and role', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...REGULAR_MEMBER_ROW,
      role: 'ADMIN',
      user: { id: MEMBER_USER_ID, name: 'Trip Member', email: 'member@cascade.com', image: null },
    });

    await callMembersPatch(MOCK_TRIP_ID, { memberId: MEMBER_ROW_ID, role: 'ADMIN' });

    expect(mockPrismaTripMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ROW_ID },
        data: expect.objectContaining({ role: 'ADMIN' }),
      })
    );
  });

  it('returns 500 when prisma.tripMember.update throws', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.update.mockRejectedValueOnce(new Error('DB write error'));

    const res = await callMembersPatch(MOCK_TRIP_ID, {
      memberId: MEMBER_ROW_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update member');
  });
});

// ===========================================================================
// DELETE /api/trips/[tripId]/members — member removal and leave-trip
// ===========================================================================
describe('DELETE /api/trips/[tripId]/members — removal scenarios', () => {
  async function callMembersDelete(
    tripId: string,
    memberId: string | null,
    session: unknown = OWNER_SESSION
  ): Promise<Response> {
    mockGetServerSession.mockResolvedValueOnce(session);
    const qs = memberId ? `?memberId=${memberId}` : '';
    const req = makeNextRequest(`/api/trips/${tripId}/members${qs}`, { method: 'DELETE' });
    return membersDelete(req, { params: { tripId } });
  }

  it('returns 401 with correct error shape when no session is provided', async () => {
    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when memberId query param is absent', async () => {
    const res = await callMembersDelete(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member ID required');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 200 and removes member when owner removes a regular member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.delete.mockResolvedValueOnce(
      REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.delete>>
    );

    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
    expect(mockPrismaTripMember.delete).toHaveBeenCalledWith({ where: { id: MEMBER_ROW_ID } });
  });

  it('returns 200 and removes member when admin removes a regular member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(ADMIN_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.delete.mockResolvedValueOnce(
      REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.delete>>
    );

    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID, ADMIN_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
  });

  it('returns 200 when a member removes themselves (leave trip)', async () => {
    // The requesting member IS the target member (same userId)
    const selfMemberAsTarget = { ...REGULAR_MEMBER_ROW, userId: MEMBER_USER_ID };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(selfMemberAsTarget);
    mockPrismaTripMember.delete.mockResolvedValueOnce(
      selfMemberAsTarget as unknown as Awaited<ReturnType<typeof prisma.tripMember.delete>>
    );

    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
  });

  it('returns 403 when a regular member tries to remove another member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(ADMIN_MEMBER_ROW);

    const res = await callMembersDelete(MOCK_TRIP_ID, ADMIN_MEMBER_ROW_ID, MEMBER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to remove this member');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 403 when a non-member (stranger) tries to remove a member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID, STRANGER_SESSION);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the target member row does not exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(null);

    const res = await callMembersDelete(MOCK_TRIP_ID, 'ghost-member-id');
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the target member belongs to a different trip', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce({
      ...REGULAR_MEMBER_ROW,
      tripId: 'other-trip-entirely',
    });

    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when the target member has role OWNER (cannot remove owner)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce({
      ...REGULAR_MEMBER_ROW,
      userId: MEMBER_USER_ID,
      role: 'OWNER',
    });

    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Cannot remove the trip owner');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('calls tripMember.delete with the correct memberId', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.delete.mockResolvedValueOnce(
      REGULAR_MEMBER_ROW as unknown as Awaited<ReturnType<typeof prisma.tripMember.delete>>
    );

    await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID);

    expect(mockPrismaTripMember.delete).toHaveBeenCalledWith({ where: { id: MEMBER_ROW_ID } });
  });

  it('returns 500 when prisma.tripMember.delete throws an unexpected error', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockPrismaTripMember.delete.mockRejectedValueOnce(new Error('Foreign key constraint'));

    const res = await callMembersDelete(MOCK_TRIP_ID, MEMBER_ROW_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to remove member');
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/members — add member (supplemental flow tests)
// ===========================================================================
describe('POST /api/trips/[tripId]/members — add member supplemental', () => {
  const NEW_USER_ID = 'cascade-new-user-099';
  const NEW_EMAIL = 'newuser@cascade.com';

  async function callMembersPost(
    tripId: string,
    body: unknown,
    session: unknown = OWNER_SESSION
  ): Promise<Response> {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeNextRequest(`/api/trips/${tripId}/members`, { method: 'POST', body });
    return membersPost(req, { params: { tripId } });
  }

  const MOCK_NEW_MEMBER_ROW = {
    id: 'cascade-mrow-new-099',
    tripId: MOCK_TRIP_ID,
    userId: NEW_USER_ID,
    role: 'MEMBER',
    joinedAt: new Date('2026-03-01'),
    budgetRange: null,
    departureCity: null,
    flightDetails: null,
    user: {
      id: NEW_USER_ID,
      name: 'New User',
      email: NEW_EMAIL,
      image: null,
    },
  };

  it('returns 401 when no session is provided', async () => {
    const res = await callMembersPost(MOCK_TRIP_ID, { userId: NEW_USER_ID }, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 201 when owner adds a new member by userId', async () => {
    // Requesting member auth check
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    // Not already a member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaTripMember.create.mockResolvedValueOnce(MOCK_NEW_MEMBER_ROW);

    const res = await callMembersPost(MOCK_TRIP_ID, { userId: NEW_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect((body.data as Record<string, unknown>).userId).toBe(NEW_USER_ID);
  });

  it('returns 201 when owner adds a new member by email', async () => {
    // Requesting member auth check
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    // Resolve email to user
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      { id: NEW_USER_ID, name: 'New User', email: NEW_EMAIL, image: null } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    // Not already a member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaTripMember.create.mockResolvedValueOnce(MOCK_NEW_MEMBER_ROW);

    const res = await callMembersPost(MOCK_TRIP_ID, { email: NEW_EMAIL });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when neither userId nor email is provided', async () => {
    const res = await callMembersPost(MOCK_TRIP_ID, { role: 'MEMBER' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 403 when a regular member tries to add another member', async () => {
    // Requesting member is a MEMBER (not OWNER/ADMIN)
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);

    const res = await callMembersPost(
      MOCK_TRIP_ID,
      { userId: NEW_USER_ID },
      MEMBER_SESSION
    );
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to add members to this trip');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the target user is already a member', async () => {
    // Requesting member check
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    // Existing member check — user IS already a member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({
      id: 'existing-mrow',
      tripId: MOCK_TRIP_ID,
      userId: NEW_USER_ID,
      role: 'MEMBER',
    });

    const res = await callMembersPost(MOCK_TRIP_ID, { userId: NEW_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toBe('User is already a member of this trip');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 404 when adding by email and the email is not registered', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);

    const res = await callMembersPost(MOCK_TRIP_ID, { email: 'ghost@nowhere.com' });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('User not found');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });
});
