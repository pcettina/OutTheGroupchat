/**
 * Unit tests for the Voting API route handlers.
 *
 * Route: /api/trips/[tripId]/voting  (GET, POST, PUT)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts.  This file extends those mocks with the
 *   additional Prisma models the voting handlers require that are not
 *   present in the global setup (votingSession, vote, and the extra
 *   methods on tripMember / notification).
 * - Handlers are called directly with a minimal Request built from the
 *   web-platform APIs available in the Vitest node environment.
 * - The second argument to each handler matches the App Router convention:
 *   `{ params: { tripId: string } }`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  apiRateLimiter: null,
}));

// Extend the global prisma mock (defined in setup.ts) with the additional
// models and methods that the voting route handler calls.  Vitest's vi.mock
// hoisting means this factory runs before the module under test is imported,
// so all calls inside the handler will receive these stubs.
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      tripMember: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      notification: {
        create: vi.fn(),
        createMany: vi.fn(),
      },
      votingSession: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      vote: {
        upsert: vi.fn(),
        groupBy: vi.fn(),
      },
      trip: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
});

// Import the handlers under test after the mock declaration so Vitest's
// hoisting picks up the factory above.
import {
  GET as votingGET,
  POST as votingPOST,
  PUT as votingPUT,
} from '@/app/api/trips/[tripId]/voting/route';

// ---------------------------------------------------------------------------
// Typed references to mocked sub-objects
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);

// Cast through unknown because the global mock typing doesn't include the
// extended methods; the actual runtime objects are the vi.fn() stubs above.
const mockPrismaTripMember = prisma.tripMember as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};
const mockPrismaVotingSession = prisma.votingSession as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockPrismaVote = prisma.vote as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-abc-123';
const MOCK_TRIP_ID = 'trip-xyz-456';
const MOCK_SESSION_ID = 'session-vote-789';

/** Authenticated session fixture. */
const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: '2099-01-01',
};

/** tripMember row for a regular member (cannot create sessions). */
const MOCK_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' };

/** tripMember row for a trip owner (can create sessions). */
const MOCK_OWNER_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'OWNER' };

/** Vote options used in session fixtures. */
const MOCK_OPTIONS = [
  { id: 'opt-1', title: 'Rome', description: 'The eternal city' },
  { id: 'opt-2', title: 'Athens', description: 'The ancient city' },
];

/** A minimal active voting session row as Prisma would return it. */
const MOCK_VOTING_SESSION = {
  id: MOCK_SESSION_ID,
  tripId: MOCK_TRIP_ID,
  type: 'DESTINATION',
  title: 'Where should we go?',
  options: MOCK_OPTIONS,
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 h from now
  createdAt: new Date('2026-03-01'),
  votes: [],
  _count: { votes: 0 },
};

/** A minimal vote row returned by prisma.vote.upsert. */
const MOCK_VOTE = {
  id: 'vote-001',
  sessionId: MOCK_SESSION_ID,
  orderId: MOCK_USER_ID,
  optionId: 'opt-1',
  rank: null,
};

/** Build a minimal Request accepted by the App Router handlers. */
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

/** Parse JSON from a NextResponse-compatible Response. */
async function parseJson(res: Response) {
  return res.json();
}

/** Route context passed as the second argument to every handler. */
const ROUTE_PARAMS = { params: { tripId: MOCK_TRIP_ID } };

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/voting
// ===========================================================================
describe('GET /api/trips/[tripId]/voting', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    // Prisma should never be reached when auth fails
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when the authenticated user is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // findFirst returns null → user is not recorded as a trip member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/not a member/i);
    expect(mockPrismaVotingSession.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with voting sessions enriched with computed results', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    // Return one active session with two options and no votes yet
    mockPrismaVotingSession.findMany.mockResolvedValueOnce([MOCK_VOTING_SESSION]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    const session = body.data[0];
    expect(session.id).toBe(MOCK_SESSION_ID);
    // Handler computes a results array and totalVotes for each session
    expect(session).toHaveProperty('results');
    expect(session).toHaveProperty('totalVotes');
    expect(session.totalVotes).toBe(0);
    // With no votes each option should have 0 votes and 0%
    expect(session.results[0].votes).toBe(0);
    expect(session.results[0].percentage).toBe(0);
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/voting  (create a voting session)
// ===========================================================================
describe('POST /api/trips/[tripId]/voting', () => {
  /** Valid body satisfying createVotingSchema. */
  const VALID_BODY = {
    type: 'DESTINATION',
    title: 'Where should we go?',
    options: MOCK_OPTIONS,
    expirationHours: 24,
  };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaVotingSession.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is a plain member (not OWNER or ADMIN)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // The POST handler queries for OWNER or ADMIN role; return null for a plain member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/not authorized/i);
    expect(mockPrismaVotingSession.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body fails schema validation (title missing)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    // Omit the required `title` field to trigger Zod validation failure
    const invalidBody = { type: 'DESTINATION', options: MOCK_OPTIONS };

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: invalidBody,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    // Zod flatten() output should be included in the response
    expect(body.details).toBeDefined();
    expect(mockPrismaVotingSession.create).not.toHaveBeenCalled();
  });

  it('creates a voting session and returns 201 when an owner provides a valid body', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);

    // Stub the fire-and-forget trip status update and member notification calls
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]); // no other members to notify
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_SESSION_ID);
    expect(mockPrismaVotingSession.create).toHaveBeenCalledOnce();

    // Assert the session is created with the correct tripId and title
    const createCall = mockPrismaVotingSession.create.mock.calls[0][0];
    expect(createCall.data.tripId).toBe(MOCK_TRIP_ID);
    expect(createCall.data.title).toBe(VALID_BODY.title);
    expect(createCall.data.status).toBe('ACTIVE');
  });
});

// ===========================================================================
// PUT /api/trips/[tripId]/voting  (submit a vote)
// ===========================================================================
describe('PUT /api/trips/[tripId]/voting', () => {
  /** Valid vote submission body. */
  const VALID_VOTE_BODY = {
    sessionId: MOCK_SESSION_ID,
    optionId: 'opt-1',
  };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when the referenced voting session does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    // Session lookup returns null → not found
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/voting session not found/i);
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('persists the vote and returns 200 when the session is active and option is valid', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaVote.upsert.mockResolvedValueOnce(MOCK_VOTE);

    // Simulate 3 members total, only 1 has voted → session should stay ACTIVE
    mockPrismaTripMember.count.mockResolvedValueOnce(3);
    mockPrismaVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.optionId).toBe('opt-1');
    expect(mockPrismaVote.upsert).toHaveBeenCalledOnce();

    // Session must NOT be closed because not all members have voted yet
    expect(mockPrismaVotingSession.update).not.toHaveBeenCalled();
  });
});
