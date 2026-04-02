/**
 * Integration tests for the Survey and Voting flow.
 *
 * These tests cover cross-route scenarios and edge cases NOT already covered
 * in the isolated unit tests (survey.test.ts and voting.test.ts):
 *
 * - Survey GET when the user HAS already responded (hasResponded=true)
 * - Survey PUT on a closed/inactive survey
 * - Survey PUT auto-closes when all members have responded
 * - Survey PUT with invalid body schema
 * - Survey PUT when survey does not exist
 * - Survey POST with an empty questions array (no questions — valid schema)
 * - Survey POST notifies multiple members
 * - Voting PUT on a closed session
 * - Voting PUT on an expired session (auto-closes and returns 400)
 * - Voting PUT with an invalid optionId
 * - Voting PUT auto-closes when all members have voted
 * - Voting PUT with optional rank field
 * - Voting PUT validation failure (missing required field)
 * - Voting GET with multiple sessions and computed vote percentages
 * - Voting POST with multiple members to notify
 * - End-to-end flow: survey create → submit last response → auto-close
 * - End-to-end flow: voting create → cast last vote → auto-close
 * - Access control: non-member cannot submit survey response (PUT 403)
 * - Access control: non-member cannot cast vote (PUT 403)
 * - Survey GET: userResponse is populated when user has responded
 * - Voting GET: per-option vote percentage calculated correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Extend the global prisma mock with every model needed by both route handlers.
// ---------------------------------------------------------------------------
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
      tripSurvey: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      surveyResponse: {
        upsert: vi.fn(),
        count: vi.fn(),
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

// Static imports — never use dynamic imports or await import() in beforeEach.
import {
  GET as surveyGET,
  POST as surveyPOST,
  PUT as surveyPUT,
} from '@/app/api/trips/[tripId]/survey/route';

import {
  GET as votingGET,
  POST as votingPOST,
  PUT as votingPUT,
} from '@/app/api/trips/[tripId]/voting/route';

// ---------------------------------------------------------------------------
// Typed references to mocked prisma sub-objects
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);

const mockTripMember = prisma.tripMember as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};
const mockTripSurvey = prisma.tripSurvey as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockSurveyResponse = prisma.surveyResponse as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};
const mockVotingSession = prisma.votingSession as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockVote = prisma.vote as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OWNER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_MEMBER2_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_OUTSIDER_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const MOCK_TRIP_ID = 'clh7nz5vr0004mg0hb9gkfxe4';
const MOCK_SURVEY_ID = 'clh7nz5vr0005mg0hb9gkfxe5';
const MOCK_SESSION_ID = 'clh7nz5vr0006mg0hb9gkfxe6';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

const MOCK_OWNER_SESSION = {
  user: { id: MOCK_OWNER_ID, name: 'Trip Owner', email: 'owner@example.com' },
  expires: '2099-01-01',
};

const MOCK_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' };
const MOCK_OWNER_MEMBER = { userId: MOCK_OWNER_ID, tripId: MOCK_TRIP_ID, role: 'OWNER' };

const MOCK_QUESTIONS = [
  {
    id: 'q1',
    type: 'single_choice',
    question: 'Preferred travel month?',
    required: true,
    options: ['June', 'July', 'August'],
  },
];

const MOCK_SURVEY_BASE = {
  id: MOCK_SURVEY_ID,
  tripId: MOCK_TRIP_ID,
  title: 'Trip Preferences',
  questions: MOCK_QUESTIONS,
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  createdAt: new Date('2026-03-01'),
};

const MOCK_CLOSED_SURVEY = {
  ...MOCK_SURVEY_BASE,
  status: 'CLOSED',
};

const MOCK_SURVEY_RESPONSE_ROW = {
  id: 'resp-001',
  surveyId: MOCK_SURVEY_ID,
  userId: MOCK_USER_ID,
  answers: { q1: 'June' },
  createdAt: new Date('2026-03-02'),
  user: { id: MOCK_USER_ID, name: 'Test User', image: null },
};

const MOCK_OPTIONS = [
  { id: 'opt-1', title: 'Rome', description: 'The eternal city' },
  { id: 'opt-2', title: 'Athens', description: 'The ancient city' },
];

const MOCK_VOTING_SESSION_ROW = {
  id: MOCK_SESSION_ID,
  tripId: MOCK_TRIP_ID,
  type: 'DESTINATION',
  title: 'Where should we go?',
  options: MOCK_OPTIONS,
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  createdAt: new Date('2026-03-01'),
  votes: [],
  _count: { votes: 0 },
};

const MOCK_CLOSED_VOTING_SESSION = {
  ...MOCK_VOTING_SESSION_ROW,
  votes: [],
  _count: { votes: 0 },
  status: 'CLOSED',
};

const MOCK_VOTE_ROW = {
  id: 'vote-001',
  sessionId: MOCK_SESSION_ID,
  orderId: MOCK_USER_ID,
  optionId: 'opt-1',
  rank: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function parseJson(res: Response) {
  return res.json();
}

const SURVEY_ROUTE = { params: { tripId: MOCK_TRIP_ID } };
const VOTING_ROUTE = { params: { tripId: MOCK_TRIP_ID } };

// ---------------------------------------------------------------------------
// Reset all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Survey GET — user has already responded
// ===========================================================================
describe('Survey GET — user has responded', () => {
  it('returns hasResponded=true and populates userResponse when the user has a response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const surveyWithUserResponse = {
      ...MOCK_SURVEY_BASE,
      responses: [MOCK_SURVEY_RESPONSE_ROW],
      _count: { responses: 1 },
    };
    mockTripSurvey.findUnique.mockResolvedValueOnce(surveyWithUserResponse);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.hasResponded).toBe(true);
    expect(body.data.userResponse).toEqual({ q1: 'June' });
  });
});

// ===========================================================================
// Survey PUT — closed/inactive survey
// ===========================================================================
describe('Survey PUT — closed survey', () => {
  it('returns 400 when attempting to submit a response to a closed survey', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_CLOSED_SURVEY);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { answers: { q1: 'July' } },
    });
    const res = await surveyPUT(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not active/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Survey PUT — survey not found
// ===========================================================================
describe('Survey PUT — survey not found', () => {
  it('returns 404 when no survey exists for the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { answers: { q1: 'June' } },
    });
    const res = await surveyPUT(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey found/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Survey PUT — non-member access control
// ===========================================================================
describe('Survey PUT — non-member access control', () => {
  it('returns 403 when a non-member attempts to submit a survey response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null); // user is not a member

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { answers: { q1: 'June' } },
    });
    const res = await surveyPUT(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Survey PUT — auto-close when all members have responded
// ===========================================================================
describe('Survey PUT — auto-close when fully responded', () => {
  it('closes the survey when the last member submits their response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockSurveyResponse.upsert.mockResolvedValueOnce(MOCK_SURVEY_RESPONSE_ROW);

    // Simulate 2 members total, 2 have now responded → triggers auto-close
    mockTripMember.count.mockResolvedValueOnce(2);
    mockSurveyResponse.count.mockResolvedValueOnce(2);
    mockTripSurvey.update.mockResolvedValueOnce({ ...MOCK_SURVEY_BASE, status: 'CLOSED' });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { answers: { q1: 'June' } },
    });
    const res = await surveyPUT(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The survey should have been updated to CLOSED status
    expect(mockTripSurvey.update).toHaveBeenCalledOnce();
    const updateCall = mockTripSurvey.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('CLOSED');
    expect(updateCall.where.id).toBe(MOCK_SURVEY_ID);
  });
});

// ===========================================================================
// Survey PUT — validation failure
// ===========================================================================
describe('Survey PUT — schema validation', () => {
  it('returns 400 when the answers field is missing from the request body', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { notAnswers: 'wrong' }, // missing required `answers` key
    });
    const res = await surveyPUT(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(body.details).toBeDefined();
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Survey POST — empty questions array
// ===========================================================================
describe('Survey POST — empty questions array', () => {
  it('creates a survey with an empty questions array when schema permits', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);

    const emptyQSurvey = { ...MOCK_SURVEY_BASE, questions: [] };
    mockTripSurvey.create.mockResolvedValueOnce(emptyQSurvey);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { title: 'Empty Survey', questions: [], expirationHours: 24 },
    });
    const res = await surveyPOST(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockTripSurvey.create).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// Survey POST — notifies multiple members
// ===========================================================================
describe('Survey POST — multiple member notifications', () => {
  it('sends notifications to every trip member except the creator', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);

    // Two other members should be notified
    const otherMembers = [
      { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' },
      { userId: MOCK_MEMBER2_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' },
    ];
    mockTripMember.findMany.mockResolvedValueOnce(otherMembers);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 2 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { title: 'Group Survey', questions: MOCK_QUESTIONS, expirationHours: 48 },
    });
    const res = await surveyPOST(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    const createManyCall = vi.mocked(prisma.notification.createMany).mock.calls[0]?.[0];
    expect(createManyCall).toBeDefined();
    const createManyData = Array.isArray(createManyCall!.data)
      ? (createManyCall!.data as Array<{ type: string }>)
      : [];
    expect(createManyData).toHaveLength(2);
    expect(createManyData[0].type).toBe('SURVEY_REMINDER');
    expect(createManyData[1].type).toBe('SURVEY_REMINDER');
  });
});

// ===========================================================================
// Voting PUT — closed session
// ===========================================================================
describe('Voting PUT — closed session', () => {
  it('returns 400 when attempting to vote on a closed voting session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_CLOSED_VOTING_SESSION);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-1' },
    });
    const res = await votingPUT(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not active/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Voting PUT — expired session
// ===========================================================================
describe('Voting PUT — expired session', () => {
  it('auto-closes the session and returns 400 when the deadline has passed', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const expiredSession = {
      ...MOCK_VOTING_SESSION_ROW,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    };
    mockVotingSession.findUnique.mockResolvedValueOnce(expiredSession);
    mockVotingSession.update.mockResolvedValueOnce({ ...expiredSession, status: 'CLOSED' });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-1' },
    });
    const res = await votingPUT(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/expired/i);
    // The session should have been closed automatically
    expect(mockVotingSession.update).toHaveBeenCalledOnce();
    const updateCall = mockVotingSession.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('CLOSED');
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Voting PUT — invalid option
// ===========================================================================
describe('Voting PUT — invalid option', () => {
  it('returns 400 when the optionId does not match any option in the session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_ROW);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-nonexistent' },
    });
    const res = await votingPUT(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid option/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Voting PUT — auto-close when all members have voted
// ===========================================================================
describe('Voting PUT — auto-close when all members voted', () => {
  it('closes the session when the last member casts their vote', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_ROW);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);

    // 2 members total, 2 unique voters now → triggers auto-close
    mockTripMember.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
      { orderId: MOCK_MEMBER2_ID },
    ]);
    mockVotingSession.update.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION_ROW,
      status: 'CLOSED',
    });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-1' },
    });
    const res = await votingPUT(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockVotingSession.update).toHaveBeenCalledOnce();
    const updateCall = mockVotingSession.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('CLOSED');
    expect(updateCall.where.id).toBe(MOCK_SESSION_ID);
  });
});

// ===========================================================================
// Voting PUT — optional rank field
// ===========================================================================
describe('Voting PUT — optional rank field', () => {
  it('persists the rank when provided alongside the vote', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_ROW);

    const voteWithRank = { ...MOCK_VOTE_ROW, rank: 1 };
    mockVote.upsert.mockResolvedValueOnce(voteWithRank);
    mockTripMember.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-1', rank: 1 },
    });
    const res = await votingPUT(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.rank).toBe(1);
    const upsertCall = mockVote.upsert.mock.calls[0][0];
    expect(upsertCall.create.rank).toBe(1);
  });
});

// ===========================================================================
// Voting PUT — validation failure (missing sessionId)
// ===========================================================================
describe('Voting PUT — schema validation', () => {
  it('returns 400 and details when sessionId is missing from the request', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { optionId: 'opt-1' }, // sessionId is required
    });
    const res = await votingPUT(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(body.details).toBeDefined();
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Voting GET — multiple sessions with computed percentages
// ===========================================================================
describe('Voting GET — multiple sessions with vote counts', () => {
  it('returns all sessions with per-option vote percentages computed correctly', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    // Session has 3 votes: 2 for opt-1, 1 for opt-2
    const sessionWithVotes = {
      ...MOCK_VOTING_SESSION_ROW,
      votes: [
        { id: 'v1', sessionId: MOCK_SESSION_ID, orderId: MOCK_USER_ID, optionId: 'opt-1', rank: null },
        { id: 'v2', sessionId: MOCK_SESSION_ID, orderId: MOCK_MEMBER2_ID, optionId: 'opt-1', rank: null },
        { id: 'v3', sessionId: MOCK_SESSION_ID, orderId: MOCK_OUTSIDER_ID, optionId: 'opt-2', rank: null },
      ],
      _count: { votes: 3 },
    };

    const closedSession = {
      ...MOCK_CLOSED_VOTING_SESSION,
      id: 'clh7nz5vr0007mg0hb9gkfxe7',
      votes: [],
      _count: { votes: 0 },
    };

    mockVotingSession.findMany.mockResolvedValueOnce([sessionWithVotes, closedSession]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);

    const activeSession = body.data[0];
    expect(activeSession.totalVotes).toBe(3);

    // opt-1 has 2/3 votes → 67%, opt-2 has 1/3 → 33%
    const opt1Result = activeSession.results.find(
      (r: { optionId: string }) => r.optionId === 'opt-1'
    );
    const opt2Result = activeSession.results.find(
      (r: { optionId: string }) => r.optionId === 'opt-2'
    );
    expect(opt1Result.votes).toBe(2);
    expect(opt1Result.percentage).toBe(67);
    expect(opt2Result.votes).toBe(1);
    expect(opt2Result.percentage).toBe(33);

    // Results should be sorted descending by vote count
    expect(activeSession.results[0].optionId).toBe('opt-1');
    expect(activeSession.results[1].optionId).toBe('opt-2');

    // Closed session with zero votes should have 0% for all options
    const closedResult = body.data[1];
    expect(closedResult.totalVotes).toBe(0);
    closedResult.results.forEach((r: { percentage: number }) => {
      expect(r.percentage).toBe(0);
    });
  });
});

// ===========================================================================
// Voting POST — multiple member notifications
// ===========================================================================
describe('Voting POST — multiple member notifications', () => {
  it('sends VOTE_REMINDER notifications to all members except the creator', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION_ROW);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);

    const otherMembers = [
      { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' },
      { userId: MOCK_MEMBER2_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' },
    ];
    mockTripMember.findMany.mockResolvedValueOnce(otherMembers);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 2 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: {
        type: 'DESTINATION',
        title: 'Where should we go?',
        options: MOCK_OPTIONS,
        expirationHours: 24,
      },
    });
    const res = await votingPOST(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    const createManyCall = vi.mocked(prisma.notification.createMany).mock.calls[0]?.[0];
    expect(createManyCall).toBeDefined();
    const createManyData = Array.isArray(createManyCall!.data)
      ? (createManyCall!.data as unknown as Array<{ type: string; data: { tripId: string } }>)
      : [];
    expect(createManyData).toHaveLength(2);
    createManyData.forEach((n) => {
      expect(n.type).toBe('VOTE_REMINDER');
      expect(n.data.tripId).toBe(MOCK_TRIP_ID);
    });
  });
});

// ===========================================================================
// Voting POST — non-member access control
// ===========================================================================
describe('Voting PUT — non-member access control', () => {
  it('returns 403 when a non-member attempts to cast a vote', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null); // not a member

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-1' },
    });
    const res = await votingPUT(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// End-to-end flow: Survey create → last response → auto-close
// ===========================================================================
describe('Survey end-to-end flow: create → last response → auto-close', () => {
  it('owner creates a survey; member submits the final response which auto-closes the survey', async () => {
    // Step 1: Owner creates the survey
    mockGetServerSession.mockResolvedValueOnce(MOCK_OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([MOCK_MEMBER]);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 1 });

    const createReq = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { title: 'Trip Preferences', questions: MOCK_QUESTIONS, expirationHours: 48 },
    });
    const createRes = await surveyPOST(createReq, SURVEY_ROUTE);
    const createBody = await parseJson(createRes);

    expect(createRes.status).toBe(201);
    expect(createBody.success).toBe(true);
    expect(createBody.data.status).toBe('ACTIVE');

    // Step 2: Member submits the final response (only member, so it auto-closes)
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockSurveyResponse.upsert.mockResolvedValueOnce(MOCK_SURVEY_RESPONSE_ROW);
    mockTripMember.count.mockResolvedValueOnce(1);
    mockSurveyResponse.count.mockResolvedValueOnce(1);
    mockTripSurvey.update.mockResolvedValueOnce({ ...MOCK_SURVEY_BASE, status: 'CLOSED' });

    const submitReq = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { answers: { q1: 'June' } },
    });
    const submitRes = await surveyPUT(submitReq, SURVEY_ROUTE);
    const submitBody = await parseJson(submitRes);

    expect(submitRes.status).toBe(200);
    expect(submitBody.success).toBe(true);
    expect(mockTripSurvey.update).toHaveBeenCalledOnce();
    expect(mockTripSurvey.update.mock.calls[0][0].data.status).toBe('CLOSED');
  });
});

// ===========================================================================
// End-to-end flow: Voting create → last vote → auto-close
// ===========================================================================
describe('Voting end-to-end flow: create → last vote → auto-close', () => {
  it('owner creates a session; member casts the last vote which auto-closes the session', async () => {
    // Step 1: Owner creates the voting session
    mockGetServerSession.mockResolvedValueOnce(MOCK_OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION_ROW);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([MOCK_MEMBER]);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 1 });

    const createReq = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: {
        type: 'DESTINATION',
        title: 'Where should we go?',
        options: MOCK_OPTIONS,
        expirationHours: 24,
      },
    });
    const createRes = await votingPOST(createReq, VOTING_ROUTE);
    const createBody = await parseJson(createRes);

    expect(createRes.status).toBe(201);
    expect(createBody.success).toBe(true);
    expect(createBody.data.status).toBe('ACTIVE');

    // Step 2: Member casts the last vote (only 1 member, triggers auto-close)
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_ROW);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);
    mockTripMember.count.mockResolvedValueOnce(1);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);
    mockVotingSession.update.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION_ROW,
      status: 'CLOSED',
    });

    const voteReq = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-1' },
    });
    const voteRes = await votingPUT(voteReq, VOTING_ROUTE);
    const voteBody = await parseJson(voteRes);

    expect(voteRes.status).toBe(200);
    expect(voteBody.success).toBe(true);
    expect(mockVotingSession.update).toHaveBeenCalledOnce();
    expect(mockVotingSession.update.mock.calls[0][0].data.status).toBe('CLOSED');
  });
});

// ===========================================================================
// Voting POST — invalid type enum
// ===========================================================================
describe('Voting POST — invalid type enum value', () => {
  it('returns 400 when an unrecognised voting type is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: {
        type: 'INVALID_TYPE',
        title: 'Some vote',
        options: MOCK_OPTIONS,
        expirationHours: 24,
      },
    });
    const res = await votingPOST(req, VOTING_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(mockVotingSession.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Survey GET — empty session (unauthenticated)
// ===========================================================================
describe('Survey GET — unauthenticated outsider', () => {
  it('returns 401 and never touches the database when session is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, SURVEY_ROUTE);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockTripMember.findFirst).not.toHaveBeenCalled();
    expect(mockTripSurvey.findUnique).not.toHaveBeenCalled();
  });
});
