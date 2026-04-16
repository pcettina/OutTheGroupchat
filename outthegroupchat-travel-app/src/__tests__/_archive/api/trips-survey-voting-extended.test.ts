/**
 * Extended edge-case tests for the Survey and Voting API route handlers.
 *
 * Routes covered:
 *   - /api/trips/[tripId]/survey  (GET, POST, PUT)
 *   - /api/trips/[tripId]/voting  (GET, POST, PUT)
 *
 * These tests complement survey.test.ts and voting.test.ts by covering
 * additional edge cases such as conflict detection, closed-survey behaviour,
 * non-member access to voting results, and zero-option voting sessions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Override the global prisma mock with all models needed by both routes.
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

// ---------------------------------------------------------------------------
// Import route handlers after mock declarations (Vitest hoists vi.mock).
// ---------------------------------------------------------------------------
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
// Typed references to mocked Prisma models.
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
// Shared fixtures.
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_SURVEY_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const MOCK_SESSION_ID = 'clh7nz5vr0004mg0hb9gkfxe4';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Test User', email: 'test@example.com' },
  expires: '2099-01-01',
};

const MOCK_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' };
const MOCK_OWNER_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'OWNER' };

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
  expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // expired 1 hour ago
};

const MOCK_SURVEY_WITH_RESPONSES = {
  ...MOCK_SURVEY_BASE,
  responses: [],
  _count: { responses: 0 },
};

const MOCK_CLOSED_SURVEY_WITH_RESPONSES = {
  ...MOCK_CLOSED_SURVEY,
  responses: [],
  _count: { responses: 0 },
};

const MOCK_SURVEY_RESPONSE = {
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

const MOCK_VOTING_SESSION = {
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
  ...MOCK_VOTING_SESSION,
  status: 'CLOSED',
};

const MOCK_ZERO_OPTIONS_VOTING_SESSION = {
  ...MOCK_VOTING_SESSION,
  options: [],
};

const MOCK_VOTE = {
  id: 'vote-001',
  sessionId: MOCK_SESSION_ID,
  orderId: MOCK_USER_ID,
  optionId: 'opt-1',
  rank: null,
};

const ROUTE_PARAMS = { params: { tripId: MOCK_TRIP_ID } };

// ---------------------------------------------------------------------------
// Helpers.
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

// ---------------------------------------------------------------------------
// Reset mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Survey edge cases
// ===========================================================================

describe('GET /api/trips/[tripId]/survey — extended edge cases', () => {
  it('returns 200 with survey when status is CLOSED (closed surveys are still retrievable)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_CLOSED_SURVEY_WITH_RESPONSES);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('CLOSED');
    expect(body.data).toHaveProperty('hasResponded');
  });

  it('returns correct hasResponded=true when the user already has a response in the survey', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const surveyWithUserResponse = {
      ...MOCK_SURVEY_WITH_RESPONSES,
      responses: [
        {
          userId: MOCK_USER_ID,
          answers: { q1: 'July' },
          user: { id: MOCK_USER_ID, name: 'Test User', image: null },
        },
      ],
      _count: { responses: 1 },
    };
    mockTripSurvey.findUnique.mockResolvedValueOnce(surveyWithUserResponse);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.hasResponded).toBe(true);
    expect(body.data.userResponse).toEqual({ q1: 'July' });
  });
});

describe('POST /api/trips/[tripId]/survey — conflict when survey already exists', () => {
  const VALID_BODY = {
    title: 'Trip Preferences',
    questions: MOCK_QUESTIONS,
    expirationHours: 24,
  };

  it('returns 400 when survey already exists for the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // Owner/admin check passes
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    // Existing survey found — conflict
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/survey already exists/i);
    expect(mockTripSurvey.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the requester is not a member at all (non-member POST)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // Membership check for OWNER/ADMIN role returns null (user is not even a member)
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not authorized/i);
    // Survey existence check and create should not be reached
    expect(mockTripSurvey.findUnique).not.toHaveBeenCalled();
    expect(mockTripSurvey.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the requester is a plain MEMBER (cannot create survey)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // The POST handler queries role IN ['OWNER', 'ADMIN']; plain MEMBER returns null
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

describe('PUT /api/trips/[tripId]/survey — submit response edge cases', () => {
  const VALID_RESPONSE_BODY = { answers: { q1: 'June' } };

  it('returns 400 when the survey is CLOSED (not active)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    // Return a closed survey
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_CLOSED_SURVEY);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_RESPONSE_BODY,
    });
    const res = await surveyPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not active/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when answers field is missing entirely (invalid body)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { notAnswers: 'wrong' }, // Missing the `answers` key
    });
    const res = await surveyPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });

  it('upserts (overrides) the response when the user submits a second time to an active survey', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    const updatedResponse = { ...MOCK_SURVEY_RESPONSE, answers: { q1: 'July' } };
    mockSurveyResponse.upsert.mockResolvedValueOnce(updatedResponse);

    // 3 members, only 1 has responded → survey stays ACTIVE
    mockTripMember.count.mockResolvedValueOnce(3);
    mockSurveyResponse.count.mockResolvedValueOnce(1);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { answers: { q1: 'July' } },
    });
    const res = await surveyPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    // Upsert means no 409 conflict — route returns 200
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSurveyResponse.upsert).toHaveBeenCalledOnce();
    // Survey should NOT be auto-closed (1 of 3 responded)
    expect(mockTripSurvey.update).not.toHaveBeenCalled();
  });

  it('auto-closes the survey when the last member submits their response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockSurveyResponse.upsert.mockResolvedValueOnce(MOCK_SURVEY_RESPONSE);

    // All 2 members have now responded
    mockTripMember.count.mockResolvedValueOnce(2);
    mockSurveyResponse.count.mockResolvedValueOnce(2);
    mockTripSurvey.update.mockResolvedValueOnce({ ...MOCK_SURVEY_BASE, status: 'CLOSED' });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_RESPONSE_BODY,
    });
    const res = await surveyPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The survey should be closed after all members respond
    expect(mockTripSurvey.update).toHaveBeenCalledOnce();
    const updateCall = mockTripSurvey.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('CLOSED');
  });

  it('returns 404 when no survey exists for the trip on PUT', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_RESPONSE_BODY,
    });
    const res = await surveyPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey found/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Voting edge cases
// ===========================================================================

describe('GET /api/trips/[tripId]/voting — non-member access', () => {
  it('returns 403 when the authenticated user is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
    expect(mockVotingSession.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with empty sessions array when no voting sessions exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findMany.mockResolvedValueOnce([]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('computes correct results and percentages for a session with votes', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const sessionWithVotes = {
      ...MOCK_VOTING_SESSION,
      votes: [
        { optionId: 'opt-1', orderId: MOCK_USER_ID },
        { optionId: 'opt-1', orderId: MOCK_OTHER_USER_ID },
        { optionId: 'opt-2', orderId: 'clh7nz5vr0005mg0hb9gkfxe5' },
      ],
      _count: { votes: 3 },
    };
    mockVotingSession.findMany.mockResolvedValueOnce([sessionWithVotes]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    const sess = body.data[0];
    expect(sess.totalVotes).toBe(3);
    // opt-1 has 2 votes → 67%, opt-2 has 1 vote → 33%
    const opt1Result = sess.results.find((r: { optionId: string }) => r.optionId === 'opt-1');
    const opt2Result = sess.results.find((r: { optionId: string }) => r.optionId === 'opt-2');
    expect(opt1Result.votes).toBe(2);
    expect(opt1Result.percentage).toBe(67);
    expect(opt2Result.votes).toBe(1);
    expect(opt2Result.percentage).toBe(33);
  });
});

describe('POST /api/trips/[tripId]/voting — voting session with 0 options', () => {
  it('creates a voting session with zero options (Zod allows empty arrays)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_ZERO_OPTIONS_VOTING_SESSION);
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: {
        type: 'CUSTOM',
        title: 'Empty options session',
        options: [], // zero options
        expirationHours: 24,
      },
    });
    const res = await votingPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    // Zod schema does not enforce min items on options array, so this succeeds
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockVotingSession.create).toHaveBeenCalledOnce();
  });
});

describe('PUT /api/trips/[tripId]/voting — vote submission edge cases', () => {
  const VALID_VOTE_BODY = {
    sessionId: MOCK_SESSION_ID,
    optionId: 'opt-1',
  };

  it('returns 400 when trying to vote on a CLOSED session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_CLOSED_VOTING_SESSION);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not active/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the optionId does not exist in the session options', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-nonexistent' },
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid option/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the voting session has expired (expiresAt in the past)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const expiredSession = {
      ...MOCK_VOTING_SESSION,
      status: 'ACTIVE', // Still marked active but past expiry time
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
    };
    mockVotingSession.findUnique.mockResolvedValueOnce(expiredSession);
    // Route updates status to CLOSED before returning
    mockVotingSession.update.mockResolvedValueOnce({ ...expiredSession, status: 'CLOSED' });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/expired/i);
    // Route should auto-close the expired session
    expect(mockVotingSession.update).toHaveBeenCalledOnce();
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });

  it('upserts (overrides) vote when user votes again on the same option (idempotent)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE);

    // 3 members, only 1 unique voter so far → session stays ACTIVE
    mockTripMember.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    // Upsert means no 409 conflict — route returns 200
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockVote.upsert).toHaveBeenCalledOnce();
    // Session must NOT be closed (1 of 3 members voted)
    expect(mockVotingSession.update).not.toHaveBeenCalled();
  });

  it('auto-closes the voting session when all members have voted', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE);

    // 2 members total, 2 unique voters → session should be closed
    mockTripMember.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([
      { orderId: MOCK_USER_ID },
      { orderId: MOCK_OTHER_USER_ID },
    ]);
    mockVotingSession.update.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CLOSED',
    });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockVotingSession.update).toHaveBeenCalledOnce();
    const updateCall = mockVotingSession.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('CLOSED');
  });

  it('returns 403 when non-member tries to vote (PUT)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when sessionId is missing from the PUT body', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { optionId: 'opt-1' }, // sessionId missing
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });

  it('vote PUT response contains the vote data (not voteCounts — route returns raw vote)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE);

    mockTripMember.count.mockResolvedValueOnce(3);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: VALID_VOTE_BODY,
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The PUT handler returns the upserted vote row
    expect(body.data).toMatchObject({
      sessionId: MOCK_SESSION_ID,
      optionId: 'opt-1',
      orderId: MOCK_USER_ID,
    });
  });

  it('voting session with zero options: optionId always fails as invalid', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);

    const zeroOptsSession = {
      ...MOCK_VOTING_SESSION,
      options: [], // no options defined
    };
    mockVotingSession.findUnique.mockResolvedValueOnce(zeroOptsSession);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: 'opt-1' },
    });
    const res = await votingPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    // opt-1 cannot be found in an empty options array → 400 invalid option
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid option/i);
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });
});
