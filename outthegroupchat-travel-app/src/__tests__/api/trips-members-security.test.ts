/**
 * Security-focused tests for /api/trips/[tripId]/members
 *
 * Scope
 * -----
 * This file specifically tests authorization and security boundaries:
 * 1. Unauthenticated access → 401 on every exported method
 * 2. Rate-limiting enforcement → 429 before any auth/db logic runs
 * 3. POST / PATCH / DELETE: non-members (or low-privilege members) → 403
 * 4. Membership role authorization hierarchy (OWNER / ADMIN > MEMBER)
 * 5. Email field exposure in GET responses is limited to the select whitelist
 * 6. All four exported HTTP methods are present and return the correct shape
 *
 * What this file does NOT duplicate from trips-members.test.ts
 * ------------------------------------------------------------
 * - Happy-path 200/201 payloads already tested there
 * - Validation-error shapes (400) already tested there
 * - Prisma error → 500 already tested there
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: rate-limit (MUST come before route import)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({ 'X-RateLimit-Limit': '100' }),
}));

// ---------------------------------------------------------------------------
// Static route imports
// ---------------------------------------------------------------------------
import {
  GET,
  POST,
  PATCH,
  DELETE,
} from '@/app/api/trips/[tripId]/members/route';

// Import rate-limit helpers for direct inspection
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const mockTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockUser = vi.mocked(prisma.user) as typeof prisma.user & {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const TRIP_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MEMBER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const OWNER_USER_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const ADMIN_USER_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const REGULAR_USER_ID = 'clh7nz5vr0004mg0hb9gkfxe4';
const NON_MEMBER_USER_ID = 'clh7nz5vr0005mg0hb9gkfxe5';
const TARGET_MEMBER_ID = 'clh7nz5vr0006mg0hb9gkfxe6';

function makeSession(userId: string, email = 'user@example.com') {
  return { user: { id: userId, name: 'Test User', email }, expires: '2099-01-01' };
}

const OWNER_SESSION = makeSession(OWNER_USER_ID, 'owner@example.com');
const ADMIN_SESSION = makeSession(ADMIN_USER_ID, 'admin@example.com');
const REGULAR_SESSION = makeSession(REGULAR_USER_ID, 'member@example.com');
const NON_MEMBER_SESSION = makeSession(NON_MEMBER_USER_ID, 'stranger@example.com');

function makeMemberRow(userId: string, role: string, id = MEMBER_ID) {
  return {
    id,
    tripId: TRIP_ID,
    userId,
    role,
    joinedAt: new Date('2026-01-01'),
    budgetRange: null,
    departureCity: null,
    flightDetails: null,
  };
}

const OWNER_MEMBER_ROW = makeMemberRow(OWNER_USER_ID, 'OWNER');
const ADMIN_MEMBER_ROW = makeMemberRow(ADMIN_USER_ID, 'ADMIN');
const REGULAR_MEMBER_ROW = makeMemberRow(REGULAR_USER_ID, 'MEMBER');
const TARGET_MEMBER_ROW = { ...makeMemberRow(REGULAR_USER_ID, 'MEMBER', TARGET_MEMBER_ID) };

// A member list with controlled email exposure
const MEMBER_LIST_WITH_EMAILS = [
  {
    ...OWNER_MEMBER_ROW,
    user: {
      id: OWNER_USER_ID,
      name: 'Owner User',
      email: 'owner@example.com',
      image: null,
      city: 'New York',
      preferences: null,
    },
  },
  {
    ...REGULAR_MEMBER_ROW,
    user: {
      id: REGULAR_USER_ID,
      name: 'Regular Member',
      email: 'member@example.com',
      image: null,
      city: 'London',
      preferences: null,
    },
  },
];

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeGetRequest(tripId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/trips/${tripId}/members`, { method: 'GET' });
}

function makePostRequest(tripId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/trips/${tripId}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePatchRequest(tripId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/trips/${tripId}/members`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeDeleteRequest(tripId: string, memberId?: string): NextRequest {
  const url = memberId
    ? `http://localhost:3000/api/trips/${tripId}/members?memberId=${memberId}`
    : `http://localhost:3000/api/trips/${tripId}/members`;
  return new NextRequest(url, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Reset all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  // Default: rate limit passes
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  vi.mocked(getRateLimitHeaders).mockReturnValue({ 'X-RateLimit-Limit': '100' });
});

// ===========================================================================
// 1. Unauthenticated access — all HTTP methods must return 401
// ===========================================================================
describe('Unauthenticated access — every method returns 401', () => {
  it('GET returns 401 with no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('POST returns 401 with no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('PATCH returns 401 with no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, role: 'ADMIN' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('DELETE returns 401 with no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET does not call prisma when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });

    expect(mockTripMember.findMany).not.toHaveBeenCalled();
    expect(mockTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('POST does not call prisma when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );

    expect(mockTripMember.findFirst).not.toHaveBeenCalled();
    expect(mockTripMember.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. Rate limiting — 429 before any auth or DB logic
// ===========================================================================
describe('Rate limiting — 429 responses', () => {
  const RATE_LIMITED_RESULT = {
    success: false,
    limit: 10,
    remaining: 0,
    reset: Date.now() + 60000,
  };

  it('GET returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMITED_RESULT);

    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe('Too many requests. Please try again later.');
  });

  it('POST returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMITED_RESULT);

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe('Too many requests. Please try again later.');
  });

  it('PATCH returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMITED_RESULT);

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, role: 'ADMIN' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe('Too many requests. Please try again later.');
  });

  it('DELETE returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMITED_RESULT);

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe('Too many requests. Please try again later.');
  });

  it('rate limit is checked before session on GET (no session mock needed)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMITED_RESULT);
    // Intentionally do NOT set mockGetServerSession — if auth ran first it would throw

    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });

    expect(res.status).toBe(429);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it('rate limit is checked before session on POST (no session mock needed)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMITED_RESULT);

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );

    expect(res.status).toBe(429);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. POST authorization — only OWNER / ADMIN can add members
// ===========================================================================
describe('POST /api/trips/[tripId]/members — role-based authorization', () => {
  it('returns 403 when an authenticated non-member tries to add a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(NON_MEMBER_SESSION);
    // findFirst returns null: the requester has no row in this trip
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to add members to this trip');
  });

  it('returns 403 when a regular MEMBER (not owner/admin) tries to add a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(REGULAR_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to add members to this trip');
  });

  it('allows an ADMIN to add a member (proceeds past 403 gate)', async () => {
    mockGetServerSession.mockResolvedValueOnce(ADMIN_SESSION);
    // requestingMember is ADMIN
    mockTripMember.findFirst.mockResolvedValueOnce(ADMIN_MEMBER_ROW);
    // existingMember check: new user is not already a member
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    // create the new member
    mockTripMember.create.mockResolvedValueOnce({
      id: 'clh7nz5vr0007mg0hb9gkfxe7',
      tripId: TRIP_ID,
      userId: NON_MEMBER_USER_ID,
      role: 'MEMBER',
      user: { id: NON_MEMBER_USER_ID, name: 'New Member', email: 'new@example.com', image: null },
    });

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );

    expect(res.status).toBe(201);
  });

  it('allows an OWNER to add a member (proceeds past 403 gate)', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    mockTripMember.create.mockResolvedValueOnce({
      id: 'clh7nz5vr0008mg0hb9gkfxe8',
      tripId: TRIP_ID,
      userId: NON_MEMBER_USER_ID,
      role: 'MEMBER',
      user: { id: NON_MEMBER_USER_ID, name: 'New Member', email: 'new@example.com', image: null },
    });

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );

    expect(res.status).toBe(201);
  });

  it('returns 409 when trying to add a user already in the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    // existing member check returns a row → already a member
    mockTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);

    const res = await POST(
      makePostRequest(TRIP_ID, { userId: REGULAR_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('User is already a member of this trip');
  });

  it('returns 404 when adding by email and user does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockUser.findUnique.mockResolvedValueOnce(null);

    const res = await POST(
      makePostRequest(TRIP_ID, { email: 'ghost@example.com' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('User not found');
  });
});

// ===========================================================================
// 4. PATCH authorization — non-members and low-privilege members blocked
// ===========================================================================
describe('PATCH /api/trips/[tripId]/members — role-based authorization', () => {
  it('returns 403 when requester is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(NON_MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, role: 'ADMIN' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not a member of this trip');
  });

  it('returns 403 when a MEMBER tries to change another member\'s role', async () => {
    mockGetServerSession.mockResolvedValueOnce(REGULAR_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockTripMember.findUnique.mockResolvedValueOnce(TARGET_MEMBER_ROW);

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, role: 'ADMIN' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not authorized to change roles');
  });

  it('returns 403 when a MEMBER tries to update another member\'s data', async () => {
    mockGetServerSession.mockResolvedValueOnce(REGULAR_SESSION);
    // requestingMember is a MEMBER
    mockTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    // target is a different user's member row
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      userId: OWNER_USER_ID, // different from REGULAR_USER_ID
    });

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, departureCity: 'Paris' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not authorized to update this member');
  });

  it('allows a MEMBER to update their own departure city', async () => {
    mockGetServerSession.mockResolvedValueOnce(REGULAR_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    // target is the same user's own row
    const selfRow = { ...TARGET_MEMBER_ROW, userId: REGULAR_USER_ID };
    mockTripMember.findUnique.mockResolvedValueOnce(selfRow);
    mockTripMember.update.mockResolvedValueOnce({
      ...selfRow,
      departureCity: 'Paris',
      user: { id: REGULAR_USER_ID, name: 'Regular Member', email: 'member@example.com', image: null },
    });

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, departureCity: 'Paris' }),
      { params: { tripId: TRIP_ID } }
    );

    expect(res.status).toBe(200);
  });

  it('allows an ADMIN to update any member\'s role', async () => {
    mockGetServerSession.mockResolvedValueOnce(ADMIN_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(ADMIN_MEMBER_ROW);
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      userId: REGULAR_USER_ID,
    });
    mockTripMember.update.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      role: 'ADMIN',
      user: { id: REGULAR_USER_ID, name: 'Regular Member', email: 'member@example.com', image: null },
    });

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, role: 'ADMIN' }),
      { params: { tripId: TRIP_ID } }
    );

    expect(res.status).toBe(200);
  });

  it('returns 404 when target memberId does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findUnique.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: 'clh7nz5vr0009mg0hb9gkfxe9', role: 'ADMIN' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Member not found');
  });

  it('returns 404 when memberId belongs to a different trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    // findUnique returns a row whose tripId does not match
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      tripId: 'clh7nz5vr0010mg0hb9gkfxa0', // different trip
    });

    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID, role: 'ADMIN' }),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Member not found');
  });
});

// ===========================================================================
// 5. DELETE authorization — non-members blocked; owner cannot be removed
// ===========================================================================
describe('DELETE /api/trips/[tripId]/members — authorization', () => {
  it('returns 400 when memberId query param is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, undefined),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Member ID required');
  });

  it('returns 403 when requester is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(NON_MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not a member of this trip');
  });

  it('returns 403 when a MEMBER tries to remove a different member', async () => {
    mockGetServerSession.mockResolvedValueOnce(REGULAR_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    // target is OWNER_USER_ID, not REGULAR_USER_ID
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      userId: OWNER_USER_ID,
      role: 'MEMBER',
    });

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Not authorized to remove this member');
  });

  it('returns 400 when trying to remove the trip OWNER', async () => {
    mockGetServerSession.mockResolvedValueOnce(ADMIN_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(ADMIN_MEMBER_ROW);
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      userId: OWNER_USER_ID,
      role: 'OWNER',
    });

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Cannot remove the trip owner');
  });

  it('allows a MEMBER to remove themselves (leave trip)', async () => {
    mockGetServerSession.mockResolvedValueOnce(REGULAR_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(REGULAR_MEMBER_ROW);
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      userId: REGULAR_USER_ID, // same as session user
      role: 'MEMBER',
    });
    mockTripMember.delete.mockResolvedValueOnce(TARGET_MEMBER_ROW);

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );

    expect(res.status).toBe(200);
  });

  it('allows an OWNER to remove a regular MEMBER', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      userId: REGULAR_USER_ID,
      role: 'MEMBER',
    });
    mockTripMember.delete.mockResolvedValueOnce(TARGET_MEMBER_ROW);

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when memberId belongs to a different trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findUnique.mockResolvedValueOnce({
      ...TARGET_MEMBER_ROW,
      tripId: 'clh7nz5vr0010mg0hb9gkfxa0', // wrong trip
    });

    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Member not found');
  });
});

// ===========================================================================
// 6. GET — email exposure in response matches the Prisma select whitelist
// ===========================================================================
describe('GET /api/trips/[tripId]/members — response shape and email exposure', () => {
  it('returns member data with email field present (email is in the select whitelist)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ success: true, limit: 100, remaining: 99, reset: 0 });
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findMany.mockResolvedValueOnce(MEMBER_LIST_WITH_EMAILS);

    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);

    // Each user sub-object should have exactly the selected fields
    const firstUser = body.data[0].user;
    expect(firstUser).toHaveProperty('id');
    expect(firstUser).toHaveProperty('name');
    expect(firstUser).toHaveProperty('email');
    expect(firstUser).toHaveProperty('image');
    expect(firstUser).toHaveProperty('city');
    expect(firstUser).toHaveProperty('preferences');
    // Fields NOT in the select must not appear
    expect(firstUser).not.toHaveProperty('password');
    expect(firstUser).not.toHaveProperty('hashedPassword');
  });

  it('returns email fields for all members in the list', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ success: true, limit: 100, remaining: 99, reset: 0 });
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findMany.mockResolvedValueOnce(MEMBER_LIST_WITH_EMAILS);

    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });
    const body = await res.json();

    for (const member of body.data) {
      expect(member.user.email).toBeDefined();
      expect(typeof member.user.email).toBe('string');
    }
  });

  it('returns members ordered by joinedAt (ascending order preserved)', async () => {
    const orderedList = [
      { ...MEMBER_LIST_WITH_EMAILS[0], joinedAt: new Date('2026-01-01') },
      { ...MEMBER_LIST_WITH_EMAILS[1], joinedAt: new Date('2026-02-01') },
    ];
    mockCheckRateLimit.mockResolvedValueOnce({ success: true, limit: 100, remaining: 99, reset: 0 });
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findMany.mockResolvedValueOnce(orderedList);

    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });
    const body = await res.json();

    expect(body.data[0].userId).toBe(OWNER_USER_ID);
    expect(body.data[1].userId).toBe(REGULAR_USER_ID);
  });

  it('confirms findMany is called with orderBy joinedAt asc', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ success: true, limit: 100, remaining: 99, reset: 0 });
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBER_ROW);
    mockTripMember.findMany.mockResolvedValueOnce([]);

    await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });

    expect(mockTripMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { joinedAt: 'asc' },
      })
    );
  });

  it('non-members are denied GET access (membership enforced on read after security fix)', async () => {
    // Security fix 2026-04-03: GET now verifies the requesting user is a trip member.
    // Non-members receive 403 instead of seeing the full member list with emails.
    mockCheckRateLimit.mockResolvedValueOnce({ success: true, limit: 100, remaining: 99, reset: 0 });
    mockGetServerSession.mockResolvedValueOnce(NON_MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null); // non-member: findFirst returns null

    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// 7. All exported HTTP methods are present and callable
// ===========================================================================
describe('Exported route handlers exist and return Response objects', () => {
  it('GET is exported as a function', () => {
    expect(typeof GET).toBe('function');
  });

  it('POST is exported as a function', () => {
    expect(typeof POST).toBe('function');
  });

  it('PATCH is exported as a function', () => {
    expect(typeof PATCH).toBe('function');
  });

  it('DELETE is exported as a function', () => {
    expect(typeof DELETE).toBe('function');
  });

  it('GET returns a Response-like object', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(TRIP_ID), { params: { tripId: TRIP_ID } });
    expect(typeof res.status).toBe('number');
    expect(typeof res.json).toBe('function');
  });

  it('POST returns a Response-like object', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST(
      makePostRequest(TRIP_ID, { userId: NON_MEMBER_USER_ID }),
      { params: { tripId: TRIP_ID } }
    );
    expect(typeof res.status).toBe('number');
    expect(typeof res.json).toBe('function');
  });

  it('PATCH returns a Response-like object', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(
      makePatchRequest(TRIP_ID, { memberId: TARGET_MEMBER_ID }),
      { params: { tripId: TRIP_ID } }
    );
    expect(typeof res.status).toBe('number');
    expect(typeof res.json).toBe('function');
  });

  it('DELETE returns a Response-like object', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await DELETE(
      makeDeleteRequest(TRIP_ID, TARGET_MEMBER_ID),
      { params: { tripId: TRIP_ID } }
    );
    expect(typeof res.status).toBe('number');
    expect(typeof res.json).toBe('function');
  });
});
