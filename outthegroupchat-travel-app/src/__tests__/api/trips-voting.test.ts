/**
 * Unit tests for GET  /api/trips/[tripId]/voting
 *                POST /api/trips/[tripId]/voting
 *                PUT  /api/trips/[tripId]/voting
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth) are mocked via setup.ts.
 * - setup.ts does not define votingSession or vote on prisma, so those are
 *   added here via Object.defineProperty before any test runs.
 * - Each test sets up its own mocks using mockResolvedValueOnce to prevent
 *   state from leaking between tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

import { GET, POST, PUT } from '@/app/api/trips/[tripId]/voting/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};
const mockPrismaTrip = vi.mocked(prisma.trip) as typeof prisma.trip & {
  update: ReturnType<typeof vi.fn>;
};
const mockPrismaNotification = vi.mocked(prisma.notification) as typeof prisma.notification & {
  createMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Extend the prisma mock with votingSession and vote which are not in setup.ts
// ---------------------------------------------------------------------------
const mockVotingSession = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockVote = {
  upsert: vi.fn(),
  groupBy: vi.fn(),
};

// Attach to prisma mock object
Object.defineProperty(prisma, 'votingSession', {
  value: mockVotingSession,
  writable: true,
  configurable: true,
});

Object.defineProperty(prisma, 'vote', {
  value: mockVote,
  writable: true,
  configurable: true,
});

// Ensure tripMember.count is available
if (!(prisma.tripMember as Record<string, unknown>).count) {
  Object.defineProperty(prisma.tripMember, 'count', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
}

const mockPrismaTripMemberCount = mockPrismaTripMember as unknown as {
  count: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-voting-001';
const MOCK_TRIP_ID = 'trip-voting-001';
const MOCK_SESSION_ID = 'vsession-001';
const MOCK_OPTION_ID_A = 'option-a';
const MOCK_OPTION_ID_B = 'option-b';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

const MOCK_MEMBER_ROW = {
  id: 'member-row-001',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'OWNER',
  joinedAt: new Date('2026-01-01'),
  budgetRange: null,
  departureCity: null,
  flightDetails: null,
};

const MOCK_ADMIN_MEMBER_ROW = {
  ...MOCK_MEMBER_ROW,
  role: 'ADMIN',
};

const MOCK_REGULAR_MEMBER_ROW = {
  ...MOCK_MEMBER_ROW,
  role: 'MEMBER',
};

const FUTURE_DATE = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now

const MOCK_VOTING_SESSION = {
  id: MOCK_SESSION_ID,
  tripId: MOCK_TRIP_ID,
  type: 'DESTINATION',
  status: 'ACTIVE',
  title: 'Where should we go?',
  createdAt: new Date('2026-01-01'),
  expiresAt: FUTURE_DATE,
  options: [
    { id: MOCK_OPTION_ID_A, title: 'Paris', description: 'City of Light' },
    { id: MOCK_OPTION_ID_B, title: 'Tokyo', description: 'City of the Future' },
  ],
  votes: [],
  _count: { votes: 0 },
};

const MOCK_VOTING_SESSION_WITH_VOTES = {
  ...MOCK_VOTING_SESSION,
  votes: [
    { id: 'vote-001', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
    { id: 'vote-002', sessionId: MOCK_SESSION_ID, orderId: 'user-other-002', optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
  ],
  _count: { votes: 2 },
};

const MOCK_VOTE_ROW = {
  id: 'vote-new-001',
  sessionId: MOCK_SESSION_ID,
  orderId: MOCK_USER_ID,
  optionId: MOCK_OPTION_ID_A,
  rank: null,
  createdAt: new Date(),
};

const VALID_CREATE_BODY = {
  type: 'DESTINATION',
  title: 'Where should we go?',
  options: [
    { id: MOCK_OPTION_ID_A, title: 'Paris' },
    { id: MOCK_OPTION_ID_B, title: 'Tokyo' },
  ],
  expirationHours: 24,
};

const VALID_VOTE_BODY = {
  sessionId: MOCK_SESSION_ID,
  optionId: MOCK_OPTION_ID_A,
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeRequest(path: string, options: { method?: string; body?: unknown } = {}): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Clear all mocks before every test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/voting
// ===========================================================================
describe('GET /api/trips/[tripId]/voting', () => {
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/voting`);
    return GET(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockVotingSession.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no user id', async () => {
    const res = await callGet(MOCK_TRIP_ID, { user: {}, expires: '2099-01-01' });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not a trip member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
  });

  it('returns 200 with empty array when no voting sessions exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns 200 with voting sessions and computed results', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([MOCK_VOTING_SESSION]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(MOCK_SESSION_ID);
    expect(body.data[0].results).toBeDefined();
    expect(body.data[0].totalVotes).toBe(0);
  });

  it('computes vote percentages correctly when votes exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([MOCK_VOTING_SESSION_WITH_VOTES]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const session = body.data[0];
    expect(session.totalVotes).toBe(2);

    const parisResult = session.results.find((r: { optionId: string }) => r.optionId === MOCK_OPTION_ID_A);
    const tokyoResult = session.results.find((r: { optionId: string }) => r.optionId === MOCK_OPTION_ID_B);

    expect(parisResult.votes).toBe(1);
    expect(parisResult.percentage).toBe(50);
    expect(tokyoResult.votes).toBe(1);
    expect(tokyoResult.percentage).toBe(50);
  });

  it('populates userVote field when current user has voted', async () => {
    const sessionWithUserVote = {
      ...MOCK_VOTING_SESSION,
      votes: [
        { id: 'vote-001', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      ],
      _count: { votes: 1 },
    };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([sessionWithUserVote]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data[0].userVote).toBe(MOCK_OPTION_ID_A);
  });

  it('leaves userVote undefined when current user has not voted', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([MOCK_VOTING_SESSION]);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data[0].userVote).toBeUndefined();
  });

  it('queries by the correct tripId', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    expect(mockVotingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: MOCK_TRIP_ID } })
    );
  });

  it('verifies membership with correct tripId and userId', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    expect(mockPrismaTripMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: MOCK_TRIP_ID, userId: MOCK_USER_ID },
      })
    );
  });

  it('returns 500 when Prisma throws', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch voting sessions');
  });

  it('returns sessions ordered by createdAt desc', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([]);

    await callGet(MOCK_TRIP_ID);

    expect(mockVotingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/voting — Create voting session
// ===========================================================================
describe('POST /api/trips/[tripId]/voting', () => {
  async function callPost(
    tripId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/voting`, { method: 'POST', body });
    return POST(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockVotingSession.create).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no user id', async () => {
    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY, { user: {}, expires: '2099-01-01' });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when user is a regular member (not OWNER or ADMIN)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null); // role check returns nothing

    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to create voting sessions');
  });

  it('returns 403 when user is not a trip member at all', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('creates a voting session when OWNER sends valid payload', async () => {
    const createdSession = { ...MOCK_VOTING_SESSION };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(createdSession);
    mockPrismaTrip.update.mockResolvedValueOnce({});
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_SESSION_ID);
  });

  it('creates a voting session when ADMIN sends valid payload', async () => {
    const createdSession = { ...MOCK_VOTING_SESSION };
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_ADMIN_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(createdSession);
    mockPrismaTrip.update.mockResolvedValueOnce({});
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('calls prisma.votingSession.create with correct data shape', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaTrip.update.mockResolvedValueOnce({});
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 0 });

    await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);

    expect(mockVotingSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripId: MOCK_TRIP_ID,
          type: 'DESTINATION',
          title: 'Where should we go?',
          status: 'ACTIVE',
        }),
      })
    );
  });

  it('returns 400 when type is missing', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const invalidBody = { title: 'Missing type', options: [{ id: 'a', title: 'Option A' }] };

    const res = await callPost(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when title is missing', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const invalidBody = {
      type: 'DESTINATION',
      options: [{ id: 'a', title: 'Option A' }],
    };

    const res = await callPost(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when title is empty string', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const invalidBody = {
      type: 'DESTINATION',
      title: '',
      options: [{ id: 'a', title: 'Option A' }],
    };

    const res = await callPost(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when type is not a valid enum value', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const invalidBody = {
      type: 'INVALID_TYPE',
      title: 'Test',
      options: [{ id: 'a', title: 'Option A' }],
    };

    const res = await callPost(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.details).toBeDefined();
  });

  it('returns 400 when expirationHours is below minimum (< 1)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const invalidBody = { ...VALID_CREATE_BODY, expirationHours: 0 };

    const res = await callPost(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when expirationHours exceeds maximum (> 168)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    const invalidBody = { ...VALID_CREATE_BODY, expirationHours: 169 };

    const res = await callPost(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('uses default expirationHours of 24 when not provided', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaTrip.update.mockResolvedValueOnce({});
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const bodyWithoutExpiry = {
      type: 'DESTINATION',
      title: 'Where should we go?',
      options: [{ id: MOCK_OPTION_ID_A, title: 'Paris' }],
    };

    const res = await callPost(MOCK_TRIP_ID, bodyWithoutExpiry);
    expect(res.status).toBe(201);

    // Verify expiresAt is ~24h from now (within 1 minute tolerance)
    const createCall = mockVotingSession.create.mock.calls[0][0];
    const expiresAt: Date = createCall.data.expiresAt;
    const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(60_000);
  });

  it('accepts all valid VotingType enum values', async () => {
    const validTypes = ['DESTINATION', 'ACTIVITY', 'DATE', 'ACCOMMODATION', 'CUSTOM'];

    for (const type of validTypes) {
      vi.clearAllMocks();
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
      mockVotingSession.create.mockResolvedValueOnce({ ...MOCK_VOTING_SESSION, type });
      mockPrismaTrip.update.mockResolvedValueOnce({});
      mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
      mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 0 });

      const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
        method: 'POST',
        body: { ...VALID_CREATE_BODY, type },
      });
      const res = await POST(req, { params: { tripId: MOCK_TRIP_ID } });
      expect(res.status).toBe(201);
    }
  });

  it('updates trip status to VOTING after session creation', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaTrip.update.mockResolvedValueOnce({});
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 0 });

    await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);

    expect(mockPrismaTrip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_TRIP_ID },
        data: { status: 'VOTING' },
      })
    );
  });

  it('sends notifications to all other members', async () => {
    const otherMembers = [
      { id: 'member-002', tripId: MOCK_TRIP_ID, userId: 'user-other-002', role: 'MEMBER' },
      { id: 'member-003', tripId: MOCK_TRIP_ID, userId: 'user-other-003', role: 'MEMBER' },
    ];
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaTrip.update.mockResolvedValueOnce({});
    mockPrismaTripMember.findMany.mockResolvedValueOnce(otherMembers);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);

    expect(mockPrismaNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-other-002', type: 'VOTE_REMINDER' }),
          expect.objectContaining({ userId: 'user-other-003', type: 'VOTE_REMINDER' }),
        ]),
      })
    );
  });

  it('does not notify the session creator', async () => {
    const otherMembers = [
      { id: 'member-002', tripId: MOCK_TRIP_ID, userId: 'user-other-002', role: 'MEMBER' },
    ];
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaTrip.update.mockResolvedValueOnce({});
    mockPrismaTripMember.findMany.mockResolvedValueOnce(otherMembers);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 });

    await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);

    // Verify findMany excluded the creator
    expect(mockPrismaTripMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tripId: MOCK_TRIP_ID,
          userId: { not: MOCK_USER_ID },
        }),
      })
    );
  });

  it('succeeds even if trip status update fails (catch swallows error)', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockPrismaTrip.update.mockRejectedValueOnce(new Error('Trip not found'));
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);
    expect(res.status).toBe(201);
  });

  it('returns 500 when Prisma throws unexpectedly', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.create.mockRejectedValueOnce(new Error('DB failure'));

    const res = await callPost(MOCK_TRIP_ID, VALID_CREATE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to create voting session');
  });
});

// ===========================================================================
// PUT /api/trips/[tripId]/voting — Submit a vote
// ===========================================================================
describe('PUT /api/trips/[tripId]/voting', () => {
  async function callPut(
    tripId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session);
    const req = makeRequest(`/api/trips/${tripId}/voting`, { method: 'PUT', body });
    return PUT(req, { params: { tripId } });
  }

  it('returns 401 when there is no session', async () => {
    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no user id', async () => {
    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY, { user: {}, expires: '2099-01-01' });
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not a trip member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
  });

  it('returns 400 when sessionId is missing', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    const invalidBody = { optionId: MOCK_OPTION_ID_A };

    const res = await callPut(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when optionId is missing', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    const invalidBody = { sessionId: MOCK_SESSION_ID };

    const res = await callPut(MOCK_TRIP_ID, invalidBody);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 404 when voting session does not exist', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(null);

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voting session not found');
  });

  it('returns 400 when voting session is CLOSED', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CLOSED',
    });

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voting session is not active');
  });

  it('returns 400 when voting session is CANCELLED', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CANCELLED',
    });

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voting session is not active');
  });

  it('returns 400 when voting session has expired', async () => {
    const expiredDate = new Date(Date.now() - 1000); // 1 second in the past
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'ACTIVE',
      expiresAt: expiredDate,
    });
    mockVotingSession.update.mockResolvedValueOnce({});

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Voting session has expired');
  });

  it('closes the voting session when it has expired', async () => {
    const expiredDate = new Date(Date.now() - 1000);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'ACTIVE',
      expiresAt: expiredDate,
    });
    mockVotingSession.update.mockResolvedValueOnce({});

    await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);

    expect(mockVotingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_SESSION_ID },
        data: { status: 'CLOSED' },
      })
    );
  });

  it('returns 400 when optionId is not a valid option in the session', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);

    const res = await callPut(MOCK_TRIP_ID, {
      sessionId: MOCK_SESSION_ID,
      optionId: 'nonexistent-option-id',
    });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid option');
  });

  it('upserts a vote with correct data', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);
    mockPrismaTripMemberCount.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_VOTE_ROW.id);
  });

  it('calls vote.upsert with correct sessionId, orderId, and optionId', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);
    mockPrismaTripMemberCount.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);

    expect(mockVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_orderId_optionId: {
            sessionId: MOCK_SESSION_ID,
            orderId: MOCK_USER_ID,
            optionId: MOCK_OPTION_ID_A,
          },
        },
        create: expect.objectContaining({
          sessionId: MOCK_SESSION_ID,
          orderId: MOCK_USER_ID,
          optionId: MOCK_OPTION_ID_A,
        }),
      })
    );
  });

  it('accepts an optional rank field when submitting vote', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({ ...MOCK_VOTE_ROW, rank: 1 });
    mockPrismaTripMemberCount.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const res = await callPut(MOCK_TRIP_ID, { ...VALID_VOTE_BODY, rank: 1 });
    expect(res.status).toBe(200);

    expect(mockVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ rank: 1 }),
        update: expect.objectContaining({ rank: 1 }),
      })
    );
  });

  it('closes session automatically when all members have voted', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);
    // 2 members total, 2 unique voters → all voted
    mockPrismaTripMemberCount.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
      { orderId: 'user-other-002' },
    ]);
    mockVotingSession.update.mockResolvedValueOnce({});

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    expect(res.status).toBe(200);

    expect(mockVotingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_SESSION_ID },
        data: { status: 'CLOSED' },
      })
    );
  });

  it('does not close session when not all members have voted', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);
    // 3 members, only 1 has voted
    mockPrismaTripMemberCount.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    expect(res.status).toBe(200);
    expect(mockVotingSession.update).not.toHaveBeenCalled();
  });

  it('returns 500 when Prisma throws unexpectedly', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_REGULAR_MEMBER_ROW);
    mockVotingSession.findUnique.mockRejectedValueOnce(new Error('DB failure'));

    const res = await callPut(MOCK_TRIP_ID, VALID_VOTE_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to submit vote');
  });

  it('allows any member role (MEMBER, ADMIN, OWNER) to submit votes', async () => {
    const roles = [MOCK_REGULAR_MEMBER_ROW, MOCK_ADMIN_MEMBER_ROW, MOCK_MEMBER_ROW];

    for (const memberRow of roles) {
      vi.clearAllMocks();
      mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
      mockPrismaTripMember.findFirst.mockResolvedValueOnce(memberRow);
      mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
      mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);
      mockPrismaTripMemberCount.count.mockResolvedValueOnce(5);
      mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

      const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
        method: 'PUT',
        body: VALID_VOTE_BODY,
      });
      const res = await PUT(req, { params: { tripId: MOCK_TRIP_ID } });
      expect(res.status).toBe(200);
    }
  });
});
