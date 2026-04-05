/**
 * Security-focused tests for:
 *   - /api/trips/[tripId]/activities (GET, POST)
 *   - /api/trips/[tripId]/voting (GET, POST, PUT)
 *
 * Covers: access control, input validation, edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import * as activitiesRoute from '@/app/api/trips/[tripId]/activities/route';
import * as votingRoute from '@/app/api/trips/[tripId]/voting/route';

// ---------------------------------------------------------------------------
// Rate-limit mock (always passes unless test overrides)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  apiRateLimiter: null,
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_TRIP_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_SESSION_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_ACTIVITY_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const BASE_URL = `http://localhost/api/trips/${MOCK_TRIP_ID}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(path: string, method = 'GET', body?: unknown): NextRequest {
  const url = `${BASE_URL}${path}`;
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function mockSession(userId = MOCK_USER_ID) {
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    user: { id: userId, email: 'test@example.com' },
  });
}

function noSession() {
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
}

const MOCK_TRIP = { id: MOCK_TRIP_ID, isPublic: false, ownerId: 'other-owner-id' };
const MOCK_MEMBER = { id: 'member-row-1', userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' };
const MOCK_ADMIN_MEMBER = { id: 'member-row-2', userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'ADMIN' };

const VALID_ACTIVITY_BODY = {
  name: 'Visit the Louvre',
  category: 'CULTURE',
};

const MOCK_VOTING_SESSION = {
  id: MOCK_SESSION_ID,
  tripId: MOCK_TRIP_ID,
  type: 'ACTIVITY',
  title: 'Where to eat?',
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 3_600_000), // 1 hour from now
  options: [
    { id: 'opt-1', title: 'Option A' },
    { id: 'opt-2', title: 'Option B' },
  ],
  votes: [],
};

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// /api/trips/[tripId]/activities — GET
// ===========================================================================
describe('GET /api/trips/[tripId]/activities', () => {
  it('returns activities for a member of the trip', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_TRIP);
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.activity.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (prisma.activityRating.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      _avg: { score: null },
    });

    const req = makeRequest('/activities');
    const res = await activitiesRoute.GET(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('returns 401 when user is not authenticated and trip is private', async () => {
    noSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_TRIP);

    const req = makeRequest('/activities');
    const res = await activitiesRoute.GET(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it('returns 401 for authenticated non-member on private trip', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_TRIP);
    // tripMember.findFirst returns null — not a member
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/activities');
    const res = await activitiesRoute.GET(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    // Route returns 401 (Unauthorized) for insufficient access
    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it('returns 404 when trip does not exist', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/activities');
    const res = await activitiesRoute.GET(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Trip not found');
  });

  it('allows unauthenticated access to a public trip', async () => {
    noSession();
    const publicTrip = { ...MOCK_TRIP, isPublic: true };
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(publicTrip);
    (prisma.activity.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const req = makeRequest('/activities');
    const res = await activitiesRoute.GET(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});

// ===========================================================================
// /api/trips/[tripId]/activities — POST
// ===========================================================================
describe('POST /api/trips/[tripId]/activities', () => {
  it('creates an activity for a trip member with valid data', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ownerId: 'other-owner-id',
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    const mockActivity = {
      id: MOCK_ACTIVITY_ID,
      ...VALID_ACTIVITY_BODY,
      tripId: MOCK_TRIP_ID,
      status: 'SUGGESTED',
      _count: { comments: 0, ratings: 0, savedBy: 0 },
    };
    (prisma.activity.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockActivity);

    const req = makeRequest('/activities', 'POST', VALID_ACTIVITY_BODY);
    const res = await activitiesRoute.POST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Visit the Louvre');
  });

  it('returns 401 when unauthenticated user tries to create an activity', async () => {
    noSession();

    const req = makeRequest('/activities', 'POST', VALID_ACTIVITY_BODY);
    const res = await activitiesRoute.POST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when authenticated non-member tries to create an activity', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ownerId: 'another-user-id',
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/activities', 'POST', VALID_ACTIVITY_BODY);
    const res = await activitiesRoute.POST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not a member of this trip');
  });

  it('returns 400 for invalid category (ADVENTURE is not a valid enum value)', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ownerId: 'another-user-id',
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);

    const invalidBody = { name: 'Skydiving', category: 'ADVENTURE' };
    const req = makeRequest('/activities', 'POST', invalidBody);
    const res = await activitiesRoute.POST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when name is missing from activity body', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ownerId: 'another-user-id',
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);

    const invalidBody = { category: 'CULTURE' }; // name missing
    const req = makeRequest('/activities', 'POST', invalidBody);
    const res = await activitiesRoute.POST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 404 when trip does not exist for POST', async () => {
    mockSession();
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/activities', 'POST', VALID_ACTIVITY_BODY);
    const res = await activitiesRoute.POST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Trip not found');
  });

  it('trip owner can create an activity without being an explicit member', async () => {
    mockSession(MOCK_USER_ID);
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ownerId: MOCK_USER_ID, // user IS the owner
    });
    // Not a member row, but owner bypass should work
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const mockActivity = {
      id: MOCK_ACTIVITY_ID,
      ...VALID_ACTIVITY_BODY,
      tripId: MOCK_TRIP_ID,
      status: 'SUGGESTED',
      _count: { comments: 0, ratings: 0, savedBy: 0 },
    };
    (prisma.activity.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockActivity);

    const req = makeRequest('/activities', 'POST', VALID_ACTIVITY_BODY);
    const res = await activitiesRoute.POST(req, { params: Promise.resolve({ tripId: MOCK_TRIP_ID }) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });
});

// ===========================================================================
// /api/trips/[tripId]/voting — GET
// ===========================================================================
describe('GET /api/trips/[tripId]/voting', () => {
  it('returns voting sessions for a trip member', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.votingSession.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { ...MOCK_VOTING_SESSION, votes: [], _count: { votes: 0 } },
    ]);

    const req = makeRequest('/voting');
    const res = await votingRoute.GET(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    noSession();

    const req = makeRequest('/voting');
    const res = await votingRoute.GET(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when authenticated non-member tries to get voting sessions', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/voting');
    const res = await votingRoute.GET(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not a member of this trip');
  });
});

// ===========================================================================
// /api/trips/[tripId]/voting — POST (create voting session — ADMIN/OWNER only)
// ===========================================================================
describe('POST /api/trips/[tripId]/voting', () => {
  const VALID_VOTING_BODY = {
    type: 'ACTIVITY',
    title: 'Best dinner spot',
    options: [
      { id: 'opt-1', title: 'Pasta place' },
      { id: 'opt-2', title: 'Sushi bar' },
    ],
    expirationHours: 24,
  };

  it('admin/owner can create a voting session', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_ADMIN_MEMBER);
    (prisma.votingSession.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MOCK_SESSION_ID,
      ...VALID_VOTING_BODY,
      tripId: MOCK_TRIP_ID,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    (prisma.trip.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    (prisma.tripMember.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (prisma.notification.createMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest('/voting', 'POST', VALID_VOTING_BODY);
    const res = await votingRoute.POST(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  it('returns 403 when regular member (not OWNER/ADMIN) tries to create voting session', async () => {
    mockSession();
    // findFirst with role filter returns null — user is only a MEMBER, not OWNER/ADMIN
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/voting', 'POST', VALID_VOTING_BODY);
    const res = await votingRoute.POST(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not authorized to create voting sessions');
  });

  it('returns 401 when unauthenticated user tries to create voting session', async () => {
    noSession();

    const req = makeRequest('/voting', 'POST', VALID_VOTING_BODY);
    const res = await votingRoute.POST(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid voting type', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_ADMIN_MEMBER);

    const invalidBody = { ...VALID_VOTING_BODY, type: 'INVALID_TYPE' };
    const req = makeRequest('/voting', 'POST', invalidBody);
    const res = await votingRoute.POST(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });
});

// ===========================================================================
// /api/trips/[tripId]/voting — PUT (cast vote)
// ===========================================================================
describe('PUT /api/trips/[tripId]/voting (cast vote)', () => {
  const VALID_VOTE_BODY = {
    sessionId: MOCK_SESSION_ID,
    optionId: 'opt-1',
  };

  it('member can successfully cast a vote', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.votingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      MOCK_VOTING_SESSION
    );
    (prisma.vote.upsert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'vote-1',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: 'opt-1',
      rank: null,
    });
    (prisma.tripMember.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);
    (prisma.vote.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
    ]);

    const req = makeRequest('/voting', 'PUT', VALID_VOTE_BODY);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.optionId).toBe('opt-1');
  });

  it('returns 401 when unauthenticated user tries to cast a vote', async () => {
    noSession();

    const req = makeRequest('/voting', 'PUT', VALID_VOTE_BODY);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 when non-member tries to cast a vote', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/voting', 'PUT', VALID_VOTE_BODY);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not a member of this trip');
  });

  it('returns 404 when voting session does not exist', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.votingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest('/voting', 'PUT', VALID_VOTE_BODY);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Voting session not found');
  });

  it('returns 400 when voting session is not active (CLOSED)', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.votingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CLOSED',
    });

    const req = makeRequest('/voting', 'PUT', VALID_VOTE_BODY);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Voting session is not active');
  });

  it('returns 400 when optionId does not match any option in session', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.votingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      MOCK_VOTING_SESSION
    );

    const invalidVote = { sessionId: MOCK_SESSION_ID, optionId: 'nonexistent-option-id' };
    const req = makeRequest('/voting', 'PUT', invalidVote);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid option');
  });

  it('returns 400 when required vote fields are missing (no sessionId)', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);

    const invalidVote = { optionId: 'opt-1' }; // sessionId missing
    const req = makeRequest('/voting', 'PUT', invalidVote);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('allows duplicate vote via upsert (idempotent re-vote)', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.votingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      MOCK_VOTING_SESSION
    );
    // upsert succeeds — the route uses upsert so duplicate votes update the existing row
    (prisma.vote.upsert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'vote-1',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: 'opt-1',
      rank: null,
    });
    (prisma.tripMember.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);
    (prisma.vote.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
    ]);

    const req = makeRequest('/voting', 'PUT', VALID_VOTE_BODY);
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    // Upsert should succeed without error
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('closes voting session when all members have voted', async () => {
    mockSession();
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_MEMBER);
    (prisma.votingSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      MOCK_VOTING_SESSION
    );
    (prisma.vote.upsert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'vote-2',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: 'opt-2',
      rank: null,
    });
    // memberCount === uniqueVoters.length → triggers close
    (prisma.tripMember.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
    (prisma.vote.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
    ]);
    (prisma.votingSession.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CLOSED',
    });

    const req = makeRequest('/voting', 'PUT', { sessionId: MOCK_SESSION_ID, optionId: 'opt-2' });
    const res = await votingRoute.PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // Verify session was closed
    expect(prisma.votingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_SESSION_ID },
        data: { status: 'CLOSED' },
      })
    );
  });
});
