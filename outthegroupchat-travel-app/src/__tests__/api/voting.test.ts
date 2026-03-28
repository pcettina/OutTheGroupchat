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
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

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
): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  return new Request(url, init);
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

  it('returns 200 with an empty array when no voting sessions exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findMany.mockResolvedValueOnce([]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 500 when Prisma throws during session fetch', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch voting sessions');
  });

  it('populates userVote when the current user has already cast a vote', async () => {
    const sessionWithUserVote = {
      ...MOCK_VOTING_SESSION,
      votes: [
        { id: 'vote-001', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: 'opt-1', rank: null },
      ],
      _count: { votes: 1 },
    };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findMany.mockResolvedValueOnce([sessionWithUserVote]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data[0].userVote).toBe('opt-1');
  });

  it('leaves userVote undefined when the current user has not voted', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findMany.mockResolvedValueOnce([MOCK_VOTING_SESSION]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data[0].userVote).toBeUndefined();
  });

  it('computes vote percentages correctly when multiple votes exist', async () => {
    const sessionWithVotes = {
      ...MOCK_VOTING_SESSION,
      votes: [
        { id: 'v-1', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: 'opt-1', rank: null },
        { id: 'v-2', sessionId: MOCK_SESSION_ID, orderId: 'other-user', optionId: 'opt-1', rank: null },
        { id: 'v-3', sessionId: MOCK_SESSION_ID, orderId: 'yet-another', optionId: 'opt-2', rank: null },
      ],
      _count: { votes: 3 },
    };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findMany.mockResolvedValueOnce([sessionWithVotes]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const session = body.data[0];
    expect(session.totalVotes).toBe(3);

    const opt1Result = session.results.find((r: { optionId: string }) => r.optionId === 'opt-1');
    const opt2Result = session.results.find((r: { optionId: string }) => r.optionId === 'opt-2');
    expect(opt1Result.votes).toBe(2);
    expect(opt1Result.percentage).toBe(67); // Math.round(2/3 * 100)
    expect(opt2Result.votes).toBe(1);
    expect(opt2Result.percentage).toBe(33); // Math.round(1/3 * 100)
  });

  it('queries the DB with the correct tripId for membership check', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findMany.mockResolvedValueOnce([]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    await votingGET(req, ROUTE_PARAMS);

    expect(mockPrismaTripMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: MOCK_TRIP_ID, userId: MOCK_USER_ID },
      })
    );
  });

  it('returns sessions ordered by createdAt descending', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findMany.mockResolvedValueOnce([]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    await votingGET(req, ROUTE_PARAMS);

    expect(mockPrismaVotingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
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

  it('returns 201 when an ADMIN (not just OWNER) creates a session', async () => {
    const ADMIN_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'ADMIN' };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(ADMIN_MEMBER);
    mockPrismaVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when type is an unrecognised enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const invalidBody = { type: 'FOOD', title: 'Dinner vote', options: MOCK_OPTIONS };
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: invalidBody,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.details).toBeDefined();
    expect(mockPrismaVotingSession.create).not.toHaveBeenCalled();
  });

  it('returns 400 when expirationHours exceeds the maximum of 168', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const invalidBody = { ...VALID_BODY, expirationHours: 169 };
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: invalidBody,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockPrismaVotingSession.create).not.toHaveBeenCalled();
  });

  it('returns 400 when expirationHours is below the minimum of 1', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const invalidBody = { ...VALID_BODY, expirationHours: 0 };
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: invalidBody,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockPrismaVotingSession.create).not.toHaveBeenCalled();
  });

  it('updates trip status to VOTING after session creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    await votingPOST(req, ROUTE_PARAMS);

    expect(vi.mocked(prisma.trip.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_TRIP_ID },
        data: { status: 'VOTING' },
      })
    );
  });

  it('succeeds even when the trip status update throws (error is swallowed)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    vi.mocked(prisma.trip.update).mockRejectedValueOnce(new Error('Trip not found'));
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);

    // The catch() on trip.update must not bubble up as a 500
    expect(res.status).toBe(201);
  });

  it('sends VOTE_REMINDER notifications to other members after creation', async () => {
    const otherMembers = [
      { userId: 'user-other-1', tripId: MOCK_TRIP_ID, role: 'MEMBER' },
      { userId: 'user-other-2', tripId: MOCK_TRIP_ID, role: 'MEMBER' },
    ];
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockPrismaTripMember.findMany.mockResolvedValueOnce(otherMembers);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 2 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    await votingPOST(req, ROUTE_PARAMS);

    expect(vi.mocked(prisma.notification.createMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-other-1', type: 'VOTE_REMINDER' }),
          expect.objectContaining({ userId: 'user-other-2', type: 'VOTE_REMINDER' }),
        ]),
      })
    );
  });

  it('returns 500 when Prisma throws during session creation', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaVotingSession.create.mockRejectedValueOnce(new Error('DB write failure'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to create voting session');
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

  it('returns 403 when the authenticated user is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body fails Zod validation (sessionId missing)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { optionId: 'opt-1' }, // missing sessionId
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(body.details).toBeDefined();
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body fails Zod validation (optionId missing)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID }, // missing optionId
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the voting session is CLOSED (not active)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CLOSED',
    });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voting session is not active');
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the voting session is CANCELLED', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CANCELLED',
    });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voting session is not active');
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 and closes the session when expiresAt is in the past', async () => {
    const expiredSession = {
      ...MOCK_VOTING_SESSION,
      expiresAt: new Date(Date.now() - 60_000), // 1 minute ago
    };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(expiredSession);
    mockPrismaVotingSession.update.mockResolvedValueOnce({});

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voting session has expired');
    // Handler must set status → CLOSED on the expired session
    expect(mockPrismaVotingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_SESSION_ID },
        data: { status: 'CLOSED' },
      })
    );
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the optionId does not exist in the session options', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-does-not-exist' },
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid option');
    expect(mockPrismaVote.upsert).not.toHaveBeenCalled();
  });

  it('accepts an optional rank field and passes it through to the upsert', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaVote.upsert.mockResolvedValueOnce({ ...MOCK_VOTE, rank: 2 });
    mockPrismaTripMember.count.mockResolvedValueOnce(5);
    mockPrismaVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { ...VALID_VOTE_BODY, rank: 2 },
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(mockPrismaVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ rank: 2 }),
        update: expect.objectContaining({ rank: 2 }),
      })
    );
    expect(body.data.rank).toBe(2);
  });

  it('closes the session automatically when all members have voted', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaVote.upsert.mockResolvedValueOnce(MOCK_VOTE);
    // 2 members total, 2 unique voters → all have voted
    mockPrismaTripMember.count.mockResolvedValueOnce(2);
    mockPrismaVote.groupBy.mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
      { orderId: 'other-user-id' },
    ]);
    mockPrismaVotingSession.update.mockResolvedValueOnce({});

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);

    expect(res.status).toBe(200);
    expect(mockPrismaVotingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_SESSION_ID },
        data: { status: 'CLOSED' },
      })
    );
  });

  it('returns 500 when Prisma throws during vote upsert', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaVote.upsert.mockRejectedValueOnce(new Error('Unique constraint failed'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to submit vote');
  });

  it('upserts with the correct composite key (sessionId + orderId + optionId)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockPrismaVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaVote.upsert.mockResolvedValueOnce(MOCK_VOTE);
    mockPrismaTripMember.count.mockResolvedValueOnce(5);
    mockPrismaVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    await votingPUT(req, ROUTE_PARAMS);

    expect(mockPrismaVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_orderId_optionId: {
            sessionId: MOCK_SESSION_ID,
            orderId: MOCK_USER_ID,
            optionId: 'opt-1',
          },
        },
        create: expect.objectContaining({
          sessionId: MOCK_SESSION_ID,
          orderId: MOCK_USER_ID,
          optionId: 'opt-1',
        }),
      })
    );
  });
});
