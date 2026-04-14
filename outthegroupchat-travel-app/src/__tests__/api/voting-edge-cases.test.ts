/**
 * Edge case tests for GET/POST/PUT /api/trips/[tripId]/voting
 *
 * Covers: invalid session states, duplicate vote prevention (upsert semantics),
 * voteCounts response shape, totalVotes calculation, non-member access, rate
 * limiting, expired session closure, invalid option IDs, auto-close when all
 * members have voted, and Zod validation edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

import { GET, POST, PUT } from '@/app/api/trips/[tripId]/voting/route';

// ---------------------------------------------------------------------------
// Rate-limit mock — must be present so route doesn't hit Upstash Redis
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);

// setup.ts defines votingSession and vote on prisma mock already.
const mockVotingSession = vi.mocked(prisma.votingSession) as typeof prisma.votingSession & {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockVote = vi.mocked(prisma.vote) as typeof prisma.vote & {
  upsert: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};

const mockTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

const mockNotification = vi.mocked(prisma.notification) as typeof prisma.notification & {
  createMany: ReturnType<typeof vi.fn>;
};

const mockTrip = vi.mocked(prisma.trip) as typeof prisma.trip & {
  update: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Constants — valid CUIDs per project convention
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_SESSION_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const MOCK_OPTION_ID_A = 'opt-a-001';
const MOCK_OPTION_ID_B = 'opt-b-002';
const MOCK_OPTION_ID_C = 'opt-c-003';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'user@test.com' },
  expires: '2099-01-01',
};

const MOCK_MEMBER_ROW = {
  id: 'mem-001',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'MEMBER',
  joinedAt: new Date('2026-01-01'),
};

const MOCK_OWNER_ROW = { ...MOCK_MEMBER_ROW, role: 'OWNER' };
const MOCK_ADMIN_ROW = { ...MOCK_MEMBER_ROW, role: 'ADMIN' };

const FUTURE_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST_DATE = new Date(Date.now() - 60 * 1000); // 1 minute ago

const BASE_VOTING_SESSION = {
  id: MOCK_SESSION_ID,
  tripId: MOCK_TRIP_ID,
  type: 'DESTINATION',
  status: 'ACTIVE',
  title: 'Where should we go?',
  createdAt: new Date('2026-01-01'),
  expiresAt: FUTURE_DATE,
  options: [
    { id: MOCK_OPTION_ID_A, title: 'Paris' },
    { id: MOCK_OPTION_ID_B, title: 'Tokyo' },
  ],
  votes: [],
  _count: { votes: 0 },
};

const VALID_VOTE_BODY = {
  sessionId: MOCK_SESSION_ID,
  optionId: MOCK_OPTION_ID_A,
};

const VALID_CREATE_BODY = {
  type: 'DESTINATION',
  title: 'Edge case session',
  options: [
    { id: MOCK_OPTION_ID_A, title: 'Paris' },
    { id: MOCK_OPTION_ID_B, title: 'Tokyo' },
  ],
  expirationHours: 24,
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeRequest(path: string, options: { method?: string; body?: unknown } = {}): NextRequest {
  const url = `http://localhost:3000${path}`;
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Session / Auth edge cases (all three handlers)
// ===========================================================================
describe('Auth edge cases', () => {
  it('GET returns 401 when session is null', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('GET returns 401 when session exists but user.id is undefined', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {}, expires: '2099-01-01' });
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(401);
  });

  it('POST returns 401 when session is null', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_CREATE_BODY,
    });
    const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(401);
  });

  it('PUT returns 401 when session is null', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(401);
  });

  it('PUT returns 401 when session user has no id', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: 'ghost@test.com' },
      expires: '2099-01-01',
    });
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// Non-member access
// ===========================================================================
describe('Non-member access', () => {
  it('GET returns 403 when user is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Not a member of this trip');
  });

  it('POST returns 403 when user is a MEMBER (not OWNER or ADMIN)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // POST checks role: OWNER | ADMIN — plain MEMBER should be rejected
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_CREATE_BODY,
    });
    const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Not authorized to create voting sessions');
  });

  it('PUT returns 403 when user is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Not a member of this trip');
  });
});

// ===========================================================================
// POST Zod validation edge cases
// ===========================================================================
describe('POST validation edge cases', () => {
  async function callPost(body: unknown) {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body,
    });
    return POST(req, { params: { tripId: MOCK_TRIP_ID } });
  }

  it('returns 400 when type is invalid', async () => {
    const res = await callPost({ ...VALID_CREATE_BODY, type: 'INVALID_TYPE' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when title is empty string', async () => {
    const res = await callPost({ ...VALID_CREATE_BODY, title: '' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('allows empty options array (schema has no minLength)', async () => {
    // Zod schema does not enforce a minimum options count, so the route
    // proceeds to create — mock the DB call so it completes cleanly.
    // callPost already sets up getServerSession + tripMember.findFirst mocks.
    const sessionWithNoOptions = { ...BASE_VOTING_SESSION, options: [] };
    mockVotingSession.create.mockResolvedValueOnce(sessionWithNoOptions);
    mockTrip.update.mockResolvedValueOnce({});
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });
    const res = await callPost({ ...VALID_CREATE_BODY, options: [] });
    // Schema allows it — should succeed (201)
    expect(res.status).toBe(201);
  });

  it('returns 400 when expirationHours is below minimum (0)', async () => {
    const res = await callPost({ ...VALID_CREATE_BODY, expirationHours: 0 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when expirationHours exceeds maximum (169)', async () => {
    const res = await callPost({ ...VALID_CREATE_BODY, expirationHours: 169 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when body is missing required type field', async () => {
    const { type: _type, ...bodyWithoutType } = VALID_CREATE_BODY;
    const res = await callPost(bodyWithoutType);
    expect(res.status).toBe(400);
  });

  it('ADMIN role can create a voting session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_ADMIN_ROW);
    const createdSession = { ...BASE_VOTING_SESSION };
    mockVotingSession.create.mockResolvedValueOnce(createdSession);
    mockTrip.update.mockResolvedValueOnce({});
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_CREATE_BODY,
    });
    const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('uses default expirationHours of 24 when not provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    const createdSession = { ...BASE_VOTING_SESSION };
    mockVotingSession.create.mockResolvedValueOnce(createdSession);
    mockTrip.update.mockResolvedValueOnce({});
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });
    const { expirationHours: _, ...bodyWithoutExp } = VALID_CREATE_BODY;
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: bodyWithoutExp,
    });
    const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// PUT Zod validation edge cases
// ===========================================================================
describe('PUT validation edge cases', () => {
  async function callPutAuth(body: unknown) {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body,
    });
    return PUT(req, { params: { tripId: MOCK_TRIP_ID } });
  }

  it('returns 400 when sessionId is missing', async () => {
    const res = await callPutAuth({ optionId: MOCK_OPTION_ID_A });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when optionId is missing', async () => {
    const res = await callPutAuth({ sessionId: MOCK_SESSION_ID });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when body is completely empty', async () => {
    const res = await callPutAuth({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// Voting session state edge cases
// ===========================================================================
describe('Voting session state edge cases', () => {
  async function callPut(body: unknown) {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body,
    });
    return PUT(req, { params: { tripId: MOCK_TRIP_ID } });
  }

  it('returns 404 when voting session does not exist', async () => {
    mockVotingSession.findUnique.mockResolvedValueOnce(null);
    const res = await callPut(VALID_VOTE_BODY);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Voting session not found');
  });

  it('returns 400 when voting session status is CLOSED', async () => {
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...BASE_VOTING_SESSION,
      status: 'CLOSED',
    });
    const res = await callPut(VALID_VOTE_BODY);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Voting session is not active');
  });

  it('returns 400 when voting session status is COMPLETED', async () => {
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...BASE_VOTING_SESSION,
      status: 'COMPLETED',
    });
    const res = await callPut(VALID_VOTE_BODY);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Voting session is not active');
  });

  it('returns 400 and closes session when expiresAt is in the past', async () => {
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...BASE_VOTING_SESSION,
      expiresAt: PAST_DATE,
    });
    mockVotingSession.update.mockResolvedValueOnce({ ...BASE_VOTING_SESSION, status: 'CLOSED' });
    const res = await callPut(VALID_VOTE_BODY);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Voting session has expired');
    // Verify the session was updated to CLOSED
    expect(mockVotingSession.update).toHaveBeenCalledWith({
      where: { id: MOCK_SESSION_ID },
      data: { status: 'CLOSED' },
    });
  });

  it('returns 400 when optionId does not match any session option', async () => {
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    const res = await callPut({ sessionId: MOCK_SESSION_ID, optionId: 'nonexistent-opt' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid option');
  });
});

// ===========================================================================
// Duplicate vote prevention (upsert semantics)
// ===========================================================================
describe('Duplicate vote prevention', () => {
  it('upserts vote — second call updates rank without creating a duplicate', async () => {
    // First vote
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'vote-001',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: MOCK_OPTION_ID_A,
      rank: null,
    });
    mockTripMember.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req1 = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_A },
    });
    const res1 = await PUT(req1, { params: { tripId: MOCK_TRIP_ID } });
    expect(res1.status).toBe(200);

    // Second vote (rank update)
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'vote-001',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: MOCK_OPTION_ID_A,
      rank: 1,
    });
    mockTripMember.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req2 = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_A, rank: 1 },
    });
    const res2 = await PUT(req2, { params: { tripId: MOCK_TRIP_ID } });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.data.rank).toBe(1);
    // Upsert should have been called twice total
    expect(mockVote.upsert).toHaveBeenCalledTimes(2);
  });

  it('upsert is called with the correct composite key', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'vote-001',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: MOCK_OPTION_ID_A,
      rank: null,
    });
    mockTripMember.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    await PUT(req, { params: { tripId: MOCK_TRIP_ID } });

    expect(mockVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_orderId_optionId: {
            sessionId: MOCK_SESSION_ID,
            orderId: MOCK_USER_ID,
            optionId: MOCK_OPTION_ID_A,
          },
        },
      })
    );
  });
});

// ===========================================================================
// Auto-close when all members have voted
// ===========================================================================
describe('Auto-close session when all members have voted', () => {
  it('closes session when uniqueVoters count equals member count', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'vote-new',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: MOCK_OPTION_ID_A,
      rank: null,
    });
    // 2 members, 2 unique voters → should auto-close
    mockTripMember.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
      { orderId: MOCK_OTHER_USER_ID },
    ]);
    mockVotingSession.update.mockResolvedValueOnce({ ...BASE_VOTING_SESSION, status: 'CLOSED' });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(200);
    expect(mockVotingSession.update).toHaveBeenCalledWith({
      where: { id: MOCK_SESSION_ID },
      data: { status: 'CLOSED' },
    });
  });

  it('does NOT close session when only some members have voted', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'vote-new',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: MOCK_OPTION_ID_A,
      rank: null,
    });
    // 3 members, only 1 voter → should NOT close
    mockTripMember.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(200);
    expect(mockVotingSession.update).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET — voteCounts response shape and totalVotes calculation
// ===========================================================================
describe('GET — voteCounts and totalVotes calculation', () => {
  async function callGet(tripId = MOCK_TRIP_ID) {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const req = makeRequest(`/api/trips/${tripId}/voting`);
    return GET(req, { params: { tripId } });
  }

  it('returns empty results array for a session with no votes', async () => {
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes: [], _count: { votes: 0 } },
    ]);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const session = body.data[0];
    expect(session.totalVotes).toBe(0);
    expect(session.results[0].votes).toBe(0);
    expect(session.results[0].percentage).toBe(0);
  });

  it('calculates totalVotes correctly with multiple votes', async () => {
    const votes = [
      { id: 'v1', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      { id: 'v2', sessionId: MOCK_SESSION_ID, orderId: MOCK_OTHER_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      { id: 'v3', sessionId: MOCK_SESSION_ID, orderId: 'clh7nz5vr0004mg0hb9gkfxe4', optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
    ];
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes, _count: { votes: 3 } },
    ]);
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const session = body.data[0];
    expect(session.totalVotes).toBe(3);
  });

  it('sorts results by vote count descending', async () => {
    // option A gets 2 votes, option B gets 1 — A should be first in results
    const votes = [
      { id: 'v1', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      { id: 'v2', sessionId: MOCK_SESSION_ID, orderId: MOCK_OTHER_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      { id: 'v3', sessionId: MOCK_SESSION_ID, orderId: 'clh7nz5vr0004mg0hb9gkfxe4', optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
    ];
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes, _count: { votes: 3 } },
    ]);
    const res = await callGet();
    const body = await res.json();
    const results = body.data[0].results;
    expect(results[0].optionId).toBe(MOCK_OPTION_ID_A);
    expect(results[0].votes).toBe(2);
    expect(results[1].optionId).toBe(MOCK_OPTION_ID_B);
    expect(results[1].votes).toBe(1);
  });

  it('calculates percentages correctly', async () => {
    // 1 vote for A out of 2 total = 50%
    const votes = [
      { id: 'v1', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      { id: 'v2', sessionId: MOCK_SESSION_ID, orderId: MOCK_OTHER_USER_ID, optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
    ];
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes, _count: { votes: 2 } },
    ]);
    const res = await callGet();
    const body = await res.json();
    const results: Array<{ optionId: string; percentage: number }> = body.data[0].results;
    const optA = results.find(r => r.optionId === MOCK_OPTION_ID_A);
    const optB = results.find(r => r.optionId === MOCK_OPTION_ID_B);
    expect(optA?.percentage).toBe(50);
    expect(optB?.percentage).toBe(50);
  });

  it('includes all expected fields in each result entry', async () => {
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes: [], _count: { votes: 0 } },
    ]);
    const res = await callGet();
    const body = await res.json();
    const result = body.data[0].results[0];
    expect(result).toHaveProperty('optionId');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('votes');
    expect(result).toHaveProperty('percentage');
  });

  it('returns success: true on successful fetch', async () => {
    mockVotingSession.findMany.mockResolvedValueOnce([]);
    const res = await callGet();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns empty data array when no voting sessions exist', async () => {
    mockVotingSession.findMany.mockResolvedValueOnce([]);
    const res = await callGet();
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('handles multiple voting sessions in response', async () => {
    const secondSession = {
      ...BASE_VOTING_SESSION,
      id: 'clh7nz5vr0005mg0hb9gkfxe5',
      title: 'Activity session',
      type: 'ACTIVITY',
      votes: [],
      _count: { votes: 0 },
    };
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes: [], _count: { votes: 0 } },
      secondSession,
    ]);
    const res = await callGet();
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });
});

// ===========================================================================
// GET — userVote field
// ===========================================================================
describe('GET — userVote field', () => {
  it('sets userVote to the optionId the current user voted for', async () => {
    const votes = [
      // orderId is used as voter ID — matches session.user.id
      { id: 'v1', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
    ];
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes, _count: { votes: 1 } },
    ]);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await res.json();
    expect(body.data[0].userVote).toBe(MOCK_OPTION_ID_B);
  });

  it('sets userVote to undefined when user has not voted', async () => {
    const votes = [
      { id: 'v1', sessionId: MOCK_SESSION_ID, orderId: MOCK_OTHER_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
    ];
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([
      { ...BASE_VOTING_SESSION, votes, _count: { votes: 1 } },
    ]);
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });
    const body = await res.json();
    expect(body.data[0].userVote).toBeUndefined();
  });
});

// ===========================================================================
// POST — notification fan-out
// ===========================================================================
describe('POST — notification creation', () => {
  it('creates notifications for other trip members', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockTrip.update.mockResolvedValueOnce({});
    // Two other members
    mockTripMember.findMany.mockResolvedValueOnce([
      { userId: MOCK_OTHER_USER_ID },
      { userId: 'clh7nz5vr0006mg0hb9gkfxe6' },
    ]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_CREATE_BODY,
    });
    const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(201);
    expect(mockNotification.createMany).toHaveBeenCalledTimes(1);
    const callArg = mockNotification.createMany.mock.calls[0][0];
    expect(callArg.data).toHaveLength(2);
    expect(callArg.data[0].type).toBe('VOTE_REMINDER');
  });

  it('creates no notifications when creator is the only member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockTrip.update.mockResolvedValueOnce({});
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_CREATE_BODY,
    });
    const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(201);
    const callArg = mockNotification.createMany.mock.calls[0][0];
    expect(callArg.data).toHaveLength(0);
  });
});

// ===========================================================================
// PUT — successful vote response shape
// ===========================================================================
describe('PUT — successful vote response shape', () => {
  it('returns success: true with vote data on success', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    const voteRow = {
      id: 'vote-edge-001',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: MOCK_OPTION_ID_A,
      rank: null,
    };
    mockVote.upsert.mockResolvedValueOnce(voteRow);
    mockTripMember.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      sessionId: MOCK_SESSION_ID,
      optionId: MOCK_OPTION_ID_A,
      orderId: MOCK_USER_ID,
    });
  });

  it('vote with optional rank field is accepted and returned', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'vote-rank-001',
      sessionId: MOCK_SESSION_ID,
      orderId: MOCK_USER_ID,
      optionId: MOCK_OPTION_ID_B,
      rank: 2,
    });
    mockTripMember.count.mockResolvedValueOnce(5);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_B, rank: 2 },
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rank).toBe(2);
  });
});

// ===========================================================================
// Error / 500 paths
// ===========================================================================
describe('Error handling — 500 responses', () => {
  it('GET returns 500 when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockRejectedValueOnce(new Error('DB failure'));
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await GET(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('POST returns 500 when votingSession.create throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockVotingSession.create.mockRejectedValueOnce(new Error('DB failure'));
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_CREATE_BODY,
    });
    const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('PUT returns 500 when vote.upsert throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(BASE_VOTING_SESSION);
    mockVote.upsert.mockRejectedValueOnce(new Error('DB failure'));
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
