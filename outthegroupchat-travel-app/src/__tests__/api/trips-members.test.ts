/**
 * Unit tests for GET /api/trips/[tripId]/members
 *                 PATCH /api/trips/[tripId]/members
 *                 DELETE /api/trips/[tripId]/members
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth) are mocked via setup.ts.
 * - The tripMember mock in setup.ts only exposes findFirst and create; this
 *   file extends the mock with findMany, findUnique, update, and delete via
 *   vi.mocked() — no production code is modified.
 * - Each test sets up its own mocks using mockResolvedValueOnce to prevent
 *   state from leaking between tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import {
  GET,
  PATCH,
  DELETE,
  POST,
} from '@/app/api/trips/[tripId]/members/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockPrismaUser = vi.mocked(prisma.user) as typeof prisma.user & {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Patch the tripMember mock to add methods that setup.ts does not define.
// We do this once at module scope, before any tests run.
// ---------------------------------------------------------------------------
if (!mockPrismaTripMember.findMany) {
  Object.defineProperty(mockPrismaTripMember, 'findMany', { value: vi.fn(), writable: true, configurable: true });
}
if (!mockPrismaTripMember.findUnique) {
  Object.defineProperty(mockPrismaTripMember, 'findUnique', { value: vi.fn(), writable: true, configurable: true });
}
if (!mockPrismaTripMember.update) {
  Object.defineProperty(mockPrismaTripMember, 'update', { value: vi.fn(), writable: true, configurable: true });
}
if (!mockPrismaTripMember.delete) {
  Object.defineProperty(mockPrismaTripMember, 'delete', { value: vi.fn(), writable: true, configurable: true });
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-member-001';
const MOCK_TRIP_ID = 'trip-member-001';
const MOCK_MEMBER_ID = 'member-row-001';
const OTHER_MEMBER_ID = 'member-row-002';
const OTHER_USER_ID = 'user-other-002';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

/** A tripMember row representing the requesting user as OWNER. */
const MOCK_REQUESTING_MEMBER_OWNER = {
  id: MOCK_MEMBER_ID,
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'OWNER',
  joinedAt: new Date('2026-01-01'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

/** A tripMember row representing the requesting user as ADMIN. */
const MOCK_REQUESTING_MEMBER_ADMIN = {
  ...MOCK_REQUESTING_MEMBER_OWNER,
  role: 'ADMIN',
};

/** A tripMember row representing the requesting user as regular MEMBER. */
const MOCK_REQUESTING_MEMBER_REGULAR = {
  ...MOCK_REQUESTING_MEMBER_OWNER,
  role: 'MEMBER',
};

/** A second member (another user) as regular MEMBER. */
const MOCK_TARGET_MEMBER = {
  id: OTHER_MEMBER_ID,
  tripId: MOCK_TRIP_ID,
  userId: OTHER_USER_ID,
  role: 'MEMBER',
  joinedAt: new Date('2026-01-02'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

/** Full member list returned by findMany. */
const MOCK_MEMBERS_LIST = [
  {
    ...MOCK_REQUESTING_MEMBER_OWNER,
    user: {
      id: MOCK_USER_ID,
      name: 'Test User',
      email: 'test@example.com',
      image: null,
      city: 'New York',
      preferences: null,
    },
  },
  {
    ...MOCK_TARGET_MEMBER,
    user: {
      id: OTHER_USER_ID,
      name: 'Other User',
      email: 'other@example.com',
      image: null,
      city: 'London',
      preferences: null,
    },
  },
];

/** Updated member returned by prisma.tripMember.update. */
const MOCK_UPDATED_MEMBER = {
  ...MOCK_TARGET_MEMBER,
  role: 'ADMIN',
  user: { id: OTHER_USER_ID, name: 'Other User', email: 'other@example.com', image: null },
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeRequest(
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

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Clear all mocks before every test.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/members
// ===========================================================================
describe('GET /api/trips/[tripId]/members', () => {
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/members`);
    return GET(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with member list when authenticated', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findMany.mockResolvedValueOnce(MOCK_MEMBERS_LIST);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].userId).toBe(MOCK_USER_ID);
  });

  it('queries by the correct tripId', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    expect(mockPrismaTripMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: MOCK_TRIP_ID } })
    );
  });

  it('returns an empty array when the trip has no members', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 500 when Prisma throws', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findMany.mockRejectedValueOnce(new Error('DB error'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch members');
  });
});

// ===========================================================================
// PATCH /api/trips/[tripId]/members
// ===========================================================================
describe('PATCH /api/trips/[tripId]/members', () => {
  async function callPatch(
    tripId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/members`, { method: 'PATCH', body });
    return PATCH(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPatch(
      MOCK_TRIP_ID,
      { memberId: OTHER_MEMBER_ID, role: 'ADMIN' },
      null
    );
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 400 when validation fails (invalid role value)', async () => {
    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      role: 'SUPERUSER', // not a valid enum value
    });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 403 when the requesting user is not a trip member', async () => {
    // findFirst returns null → user is not in the trip
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the target member does not exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(null);

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: 'nonexistent-member',
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the target member belongs to a different trip', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    // Target member exists but belongs to a different trip
    mockPrismaTripMember.findUnique.mockResolvedValueOnce({
      ...MOCK_TARGET_MEMBER,
      tripId: 'another-trip-id',
    });

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 403 when a regular member tries to change another member role', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_REGULAR);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to change roles');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 403 when a regular member tries to update another member budget', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_REGULAR);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      budgetRange: { min: 500, max: 1000, currency: 'USD' },
    });
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to update this member');
    expect(mockPrismaTripMember.update).not.toHaveBeenCalled();
  });

  it('returns 200 when an owner updates another member role', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);
    mockPrismaTripMember.update.mockResolvedValueOnce(MOCK_UPDATED_MEMBER);

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('ADMIN');
    expect(mockPrismaTripMember.update).toHaveBeenCalledOnce();
  });

  it('returns 200 when an admin updates another member role', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_ADMIN);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);
    mockPrismaTripMember.update.mockResolvedValueOnce(MOCK_UPDATED_MEMBER);

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTripMember.update).toHaveBeenCalledOnce();
  });

  it('returns 200 when a member updates their own budget range', async () => {
    // The requesting user IS the target member
    const selfMemberRow = { ...MOCK_REQUESTING_MEMBER_REGULAR, id: MOCK_MEMBER_ID };
    const selfTargetRow = { ...selfMemberRow, userId: MOCK_USER_ID };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(selfMemberRow);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(selfTargetRow);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...selfTargetRow,
      budgetRange: { min: 500, max: 1000, currency: 'USD' },
      user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com', image: null },
    });

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: MOCK_MEMBER_ID,
      budgetRange: { min: 500, max: 1000, currency: 'USD' },
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTripMember.update).toHaveBeenCalledOnce();
  });

  it('returns 200 when a member updates their own departure city', async () => {
    const selfMemberRow = { ...MOCK_REQUESTING_MEMBER_REGULAR, id: MOCK_MEMBER_ID };
    const selfTargetRow = { ...selfMemberRow, userId: MOCK_USER_ID };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(selfMemberRow);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(selfTargetRow);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...selfTargetRow,
      departureCity: 'Chicago',
      user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com', image: null },
    });

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: MOCK_MEMBER_ID,
      departureCity: 'Chicago',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 200 when a member updates their own flight details', async () => {
    const selfMemberRow = { ...MOCK_REQUESTING_MEMBER_REGULAR, id: MOCK_MEMBER_ID };
    const selfTargetRow = { ...selfMemberRow, userId: MOCK_USER_ID };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(selfMemberRow);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(selfTargetRow);
    mockPrismaTripMember.update.mockResolvedValueOnce({
      ...selfTargetRow,
      flightDetails: { estimatedCost: 450, airline: 'United' },
      user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com', image: null },
    });

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: MOCK_MEMBER_ID,
      flightDetails: { estimatedCost: 450, airline: 'United' },
    });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 when Prisma throws during update', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);
    mockPrismaTripMember.update.mockRejectedValueOnce(new Error('DB error'));

    const res = await callPatch(MOCK_TRIP_ID, {
      memberId: OTHER_MEMBER_ID,
      role: 'ADMIN',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update member');
  });
});

// ===========================================================================
// DELETE /api/trips/[tripId]/members
// ===========================================================================
describe('DELETE /api/trips/[tripId]/members', () => {
  async function callDelete(
    tripId: string,
    memberId: string | null,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const qs = memberId ? `?memberId=${memberId}` : '';
    const req = makeRequest(`/api/trips/${tripId}/members${qs}`, { method: 'DELETE' });
    return DELETE(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when memberId query param is missing', async () => {
    const res = await callDelete(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member ID required');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 403 when the requesting user is not a trip member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the target member does not exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(null);

    const res = await callDelete(MOCK_TRIP_ID, 'nonexistent-member');
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the target member belongs to a different trip', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce({
      ...MOCK_TARGET_MEMBER,
      tripId: 'another-trip-id',
    });

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Member not found');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 400 when trying to remove the trip owner', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce({
      ...MOCK_TARGET_MEMBER,
      role: 'OWNER',
    });

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Cannot remove the trip owner');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 403 when a regular member tries to remove another member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_REGULAR);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to remove this member');
    expect(mockPrismaTripMember.delete).not.toHaveBeenCalled();
  });

  it('returns 200 when an owner removes another member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);
    mockPrismaTripMember.delete.mockResolvedValueOnce(MOCK_TARGET_MEMBER);

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
    expect(mockPrismaTripMember.delete).toHaveBeenCalledWith({
      where: { id: OTHER_MEMBER_ID },
    });
  });

  it('returns 200 when an admin removes another member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_ADMIN);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);
    mockPrismaTripMember.delete.mockResolvedValueOnce(MOCK_TARGET_MEMBER);

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaTripMember.delete).toHaveBeenCalledOnce();
  });

  it('returns 200 when a member removes themselves (leave trip)', async () => {
    // Requesting user is the same as the target user
    const selfTargetMember = {
      ...MOCK_REQUESTING_MEMBER_REGULAR,
      id: OTHER_MEMBER_ID,
      userId: MOCK_USER_ID, // same user
    };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_REGULAR);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(selfTargetMember);
    mockPrismaTripMember.delete.mockResolvedValueOnce(selfTargetMember);

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
    expect(mockPrismaTripMember.delete).toHaveBeenCalledOnce();
  });

  it('returns 500 when Prisma throws during delete', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findUnique.mockResolvedValueOnce(MOCK_TARGET_MEMBER);
    mockPrismaTripMember.delete.mockRejectedValueOnce(new Error('DB constraint error'));

    const res = await callDelete(MOCK_TRIP_ID, OTHER_MEMBER_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to remove member');
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/members
// ===========================================================================
describe('POST /api/trips/[tripId]/members', () => {
  /** New member returned by prisma.tripMember.create. */
  const MOCK_NEW_MEMBER = {
    id: 'member-row-new-001',
    tripId: MOCK_TRIP_ID,
    userId: OTHER_USER_ID,
    role: 'MEMBER',
    joinedAt: new Date('2026-03-01'),
    budgetRange: null,
    departureCity: null,
    flightDetails: null,
    user: {
      id: OTHER_USER_ID,
      name: 'Other User',
      email: 'other@example.com',
      image: null,
    },
  };

  /** User row returned by prisma.user.findUnique when looking up by email. */
  const MOCK_USER_BY_EMAIL = {
    id: OTHER_USER_ID,
    name: 'Other User',
    email: 'other@example.com',
    image: null,
  };

  async function callPost(
    tripId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/members`, { method: 'POST', body });
    return POST(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID }, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 400 when neither userId nor email is provided', async () => {
    const res = await callPost(MOCK_TRIP_ID, { role: 'MEMBER' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 400 when email is not a valid email address', async () => {
    const res = await callPost(MOCK_TRIP_ID, { email: 'not-an-email' });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the requesting user is not a trip member', async () => {
    // findFirst returns null → user is not in the trip at all
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to add members to this trip');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the requesting user is a regular MEMBER (not OWNER/ADMIN)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_REGULAR);

    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to add members to this trip');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 404 when adding by email and the user does not exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, { email: 'unknown@example.com' });
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('User not found');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the user is already a member of the trip', async () => {
    // First findFirst: auth check (OWNER) — Second findFirst: duplicate check
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TARGET_MEMBER);

    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toBe('User is already a member of this trip');
    expect(mockPrismaTripMember.create).not.toHaveBeenCalled();
  });

  it('returns 201 when an OWNER adds a new member by userId', async () => {
    // First findFirst: auth check, Second findFirst: duplicate check (not a member yet)
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaTripMember.create.mockResolvedValueOnce(
      MOCK_NEW_MEMBER as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>
    );

    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(OTHER_USER_ID);
    expect(body.data.role).toBe('MEMBER');
    expect(mockPrismaTripMember.create).toHaveBeenCalledOnce();
  });

  it('returns 201 when an ADMIN adds a new member by email', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_ADMIN);
    mockPrismaUser.findUnique.mockResolvedValueOnce(
      MOCK_USER_BY_EMAIL as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaTripMember.create.mockResolvedValueOnce(
      MOCK_NEW_MEMBER as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>
    );

    const res = await callPost(MOCK_TRIP_ID, { email: 'other@example.com' });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(OTHER_USER_ID);
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({ where: { email: 'other@example.com' } });
    expect(mockPrismaTripMember.create).toHaveBeenCalledOnce();
  });

  it('returns 201 with the explicit role when role is provided', async () => {
    const newAdminMember = { ...MOCK_NEW_MEMBER, role: 'ADMIN' };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaTripMember.create.mockResolvedValueOnce(
      newAdminMember as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>
    );

    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID, role: 'ADMIN' });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('ADMIN');
    expect(mockPrismaTripMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'ADMIN', userId: OTHER_USER_ID, tripId: MOCK_TRIP_ID }),
      })
    );
  });

  it('returns 201 with default MEMBER role when role is not provided', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaTripMember.create.mockResolvedValueOnce(
      MOCK_NEW_MEMBER as unknown as Awaited<ReturnType<typeof prisma.tripMember.create>>
    );

    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(mockPrismaTripMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'MEMBER' }),
      })
    );
  });

  it('returns 500 when Prisma throws during create', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REQUESTING_MEMBER_OWNER);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockPrismaTripMember.create.mockRejectedValueOnce(new Error('DB error'));

    const res = await callPost(MOCK_TRIP_ID, { userId: OTHER_USER_ID });
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to add member');
  });
});
