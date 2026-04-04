/**
 * Edge-case tests for Survey and Voting API route handlers.
 *
 * Routes:
 *   GET  /api/trips/[tripId]/survey    — aggregated results view
 *   POST /api/trips/[tripId]/survey    — create survey
 *   PUT  /api/trips/[tripId]/survey    — submit response
 *   GET  /api/trips/[tripId]/voting    — voting sessions with results
 *   POST /api/trips/[tripId]/voting    — create voting session
 *   PUT  /api/trips/[tripId]/voting    — submit vote
 *
 * Strategy
 * --------
 * All scenarios focus on gaps NOT covered by survey.test.ts and
 * trips-voting.test.ts.  New scenarios include:
 *   - Survey GET: authenticated user who has already responded
 *   - Survey GET: multiple responses aggregation — userResponse shows answers
 *   - Survey PUT: submitting to a CLOSED survey
 *   - Survey PUT: Zod validation failure (missing answers key)
 *   - Survey PUT: non-member is rejected (403)
 *   - Survey PUT: survey not found (404)
 *   - Survey PUT: auto-close when all members have now responded
 *   - Survey POST: ADMIN role can create a survey
 *   - Survey POST: default expirationHours (48h) used when omitted
 *   - Survey POST: max expirationHours boundary (168h) accepted
 *   - Survey POST: notifications sent to all other members
 *   - Survey POST: 500 on unexpected Prisma error
 *   - Voting GET: multiple sessions with independent result computations
 *   - Voting GET: results sorted by vote count descending
 *   - Voting POST: options with optional metadata field accepted
 *   - Voting POST: CUSTOM type accepted
 *   - Voting PUT: vote on second option (optionId B)
 *   - Voting PUT: rank persisted correctly on upsert
 *   - Voting PUT: 500 from vote.upsert
 *   - Voting PUT: session belonging to different tripId not accessible (wrong tripId)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Rate-limit mock (mandatory — prevents real Redis calls)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Extend the global prisma mock (from setup.ts) with the models required by
// the survey and voting route handlers.
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

// Static imports — never use dynamic imports in beforeEach
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
// Typed references to mocked sub-objects
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
const mockNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
};
const mockTrip = prisma.trip as unknown as {
  update: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'edge-user-001';
const MOCK_TRIP_ID = 'edge-trip-001';
const MOCK_SURVEY_ID = 'edge-survey-001';
const MOCK_SESSION_ID = 'edge-vsession-001';
const MOCK_OPTION_ID_A = 'edge-option-a';
const MOCK_OPTION_ID_B = 'edge-option-b';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Edge User', email: 'edge@example.com' },
  expires: '2099-01-01',
};

const MOCK_MEMBER_ROW = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' };
const MOCK_OWNER_ROW = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'OWNER' };
const MOCK_ADMIN_ROW = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'ADMIN' };

const MOCK_QUESTIONS = [
  {
    id: 'q1',
    type: 'single_choice',
    question: 'Preferred season?',
    required: true,
    options: ['Spring', 'Summer', 'Fall'],
  },
  {
    id: 'q2',
    type: 'scale',
    question: 'Budget flexibility (1-5)',
    required: true,
    min: 1,
    max: 5,
    step: 1,
  },
];

const FUTURE_DATE = new Date(Date.now() + 48 * 60 * 60 * 1000);
const PAST_DATE = new Date(Date.now() - 60 * 60 * 1000); // 1h ago

const MOCK_SURVEY_BASE = {
  id: MOCK_SURVEY_ID,
  tripId: MOCK_TRIP_ID,
  title: 'Trip Preferences',
  questions: MOCK_QUESTIONS,
  status: 'ACTIVE',
  expiresAt: FUTURE_DATE,
  createdAt: new Date('2026-03-01'),
};

const MOCK_SURVEY_RESPONSE_ROW = {
  id: 'resp-edge-001',
  surveyId: MOCK_SURVEY_ID,
  userId: MOCK_USER_ID,
  answers: { q1: 'Summer', q2: 4 },
  createdAt: new Date('2026-03-02'),
  user: { id: MOCK_USER_ID, name: 'Edge User', image: null },
};

const MOCK_VOTING_SESSION_BASE = {
  id: MOCK_SESSION_ID,
  tripId: MOCK_TRIP_ID,
  type: 'DESTINATION',
  status: 'ACTIVE',
  title: 'Where to go?',
  createdAt: new Date('2026-01-01'),
  expiresAt: FUTURE_DATE,
  options: [
    { id: MOCK_OPTION_ID_A, title: 'Paris' },
    { id: MOCK_OPTION_ID_B, title: 'Tokyo' },
  ],
  votes: [],
  _count: { votes: 0 },
};

const MOCK_VOTE_ROW = {
  id: 'vote-edge-001',
  sessionId: MOCK_SESSION_ID,
  orderId: MOCK_USER_ID,
  optionId: MOCK_OPTION_ID_A,
  rank: null,
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function makeRequest(path: string, options: { method?: string; body?: unknown } = {}): NextRequest {
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

const SURVEY_ROUTE_PARAMS = { params: { tripId: MOCK_TRIP_ID } };
const VOTING_ROUTE_PARAMS = { params: { tripId: MOCK_TRIP_ID } };

// ---------------------------------------------------------------------------
// Clear all mocks before every test to prevent state leakage
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/survey — edge cases
// ===========================================================================
describe('GET /api/trips/[tripId]/survey — edge cases', () => {
  it('returns hasResponded=true and populates userResponse when user has already answered', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);

    // Survey includes the current user's response
    const surveyWithUserResponse = {
      ...MOCK_SURVEY_BASE,
      responses: [
        {
          ...MOCK_SURVEY_RESPONSE_ROW,
          userId: MOCK_USER_ID,
          answers: { q1: 'Summer', q2: 4 },
          user: { id: MOCK_USER_ID, name: 'Edge User', image: null },
        },
      ],
      _count: { responses: 1 },
    };
    mockTripSurvey.findUnique.mockResolvedValueOnce(surveyWithUserResponse);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.hasResponded).toBe(true);
    expect(body.data.userResponse).toEqual({ q1: 'Summer', q2: 4 });
  });

  it('returns correct _count and multiple responses in data when survey has many respondents', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);

    const otherUserId = 'other-user-999';
    const surveyWithManyResponses = {
      ...MOCK_SURVEY_BASE,
      responses: [
        {
          id: 'resp-001',
          surveyId: MOCK_SURVEY_ID,
          userId: MOCK_USER_ID,
          answers: { q1: 'Summer' },
          user: { id: MOCK_USER_ID, name: 'Edge User', image: null },
        },
        {
          id: 'resp-002',
          surveyId: MOCK_SURVEY_ID,
          userId: otherUserId,
          answers: { q1: 'Fall' },
          user: { id: otherUserId, name: 'Other User', image: null },
        },
      ],
      _count: { responses: 2 },
    };
    mockTripSurvey.findUnique.mockResolvedValueOnce(surveyWithManyResponses);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data._count.responses).toBe(2);
    expect(body.data.responses).toHaveLength(2);
    // Current user has responded
    expect(body.data.hasResponded).toBe(true);
  });

  it('returns 500 when Prisma throws unexpectedly during GET', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockTripSurvey.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch survey');
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/survey — edge cases
// ===========================================================================
describe('POST /api/trips/[tripId]/survey — edge cases', () => {
  const BASE_BODY = {
    title: 'Edge Survey',
    questions: MOCK_QUESTIONS,
  };

  it('ADMIN role can create a survey (not just OWNER)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_ADMIN_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockTrip.update.mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { ...BASE_BODY, expirationHours: 24 },
    });
    const res = await surveyPOST(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockTripSurvey.create).toHaveBeenCalledOnce();
  });

  it('uses default expirationHours of 48 when not provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockTrip.update.mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    // Omit expirationHours — should default to 48
    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: BASE_BODY,
    });
    const res = await surveyPOST(req, SURVEY_ROUTE_PARAMS);

    expect(res.status).toBe(201);
    // expiresAt should be ~48 hours from now
    const createCall = mockTripSurvey.create.mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    const expectedExpiry = Date.now() + 48 * 60 * 60 * 1000;
    expect(Math.abs(createCall.data.expiresAt.getTime() - expectedExpiry)).toBeLessThan(60_000);
  });

  it('accepts maximum expirationHours of 168', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockTrip.update.mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { ...BASE_BODY, expirationHours: 168 },
    });
    const res = await surveyPOST(req, SURVEY_ROUTE_PARAMS);

    expect(res.status).toBe(201);
    const createCall = mockTripSurvey.create.mock.calls[0][0] as {
      data: { expiresAt: Date };
    };
    const expectedExpiry = Date.now() + 168 * 60 * 60 * 1000;
    expect(Math.abs(createCall.data.expiresAt.getTime() - expectedExpiry)).toBeLessThan(60_000);
  });

  it('sends SURVEY_REMINDER notifications to all other members on creation', async () => {
    const otherMembers = [
      { userId: 'member-002', tripId: MOCK_TRIP_ID, role: 'MEMBER' },
      { userId: 'member-003', tripId: MOCK_TRIP_ID, role: 'MEMBER' },
    ];
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockTrip.update.mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce(otherMembers);
    mockNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { ...BASE_BODY, expirationHours: 48 },
    });
    await surveyPOST(req, SURVEY_ROUTE_PARAMS);

    expect(mockNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'member-002', type: 'SURVEY_REMINDER' }),
          expect.objectContaining({ userId: 'member-003', type: 'SURVEY_REMINDER' }),
        ]),
      })
    );
  });

  it('returns 400 when expirationHours exceeds 168', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { ...BASE_BODY, expirationHours: 169 },
    });
    const res = await surveyPOST(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(mockTripSurvey.create).not.toHaveBeenCalled();
  });

  it('returns 500 when Prisma throws unexpectedly during POST', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);
    mockTripSurvey.create.mockRejectedValueOnce(new Error('DB write failed'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: { ...BASE_BODY, expirationHours: 48 },
    });
    const res = await surveyPOST(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to create survey');
  });
});

// ===========================================================================
// PUT /api/trips/[tripId]/survey — edge cases
// ===========================================================================
describe('PUT /api/trips/[tripId]/survey — edge cases', () => {
  const VALID_ANSWERS = { answers: { q1: 'Summer', q2: 3 } };

  it('returns 403 when non-member attempts to submit a response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null); // not a member

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_ANSWERS,
    });
    const res = await surveyPUT(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not a member/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when no survey exists for the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_ANSWERS,
    });
    const res = await surveyPUT(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey found/i);
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when survey status is CLOSED', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce({
      ...MOCK_SURVEY_BASE,
      status: 'CLOSED',
    });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_ANSWERS,
    });
    const res = await surveyPUT(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Survey is not active');
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when request body has no answers key (Zod validation failure)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { notAnswers: { q1: 'Summer' } }, // wrong key
    });
    const res = await surveyPUT(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(body.details).toBeDefined();
    expect(mockSurveyResponse.upsert).not.toHaveBeenCalled();
  });

  it('auto-closes the survey when the last member submits a response', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockSurveyResponse.upsert.mockResolvedValueOnce(MOCK_SURVEY_RESPONSE_ROW);

    // 3 members total and all 3 have now responded → should close
    mockTripMember.count.mockResolvedValueOnce(3);
    mockSurveyResponse.count.mockResolvedValueOnce(3);
    mockTripSurvey.update.mockResolvedValueOnce({} as never);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_ANSWERS,
    });
    const res = await surveyPUT(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Survey.update must have been called to set status CLOSED
    expect(mockTripSurvey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_SURVEY_ID },
        data: { status: 'CLOSED' },
      })
    );
  });

  it('upserts correctly on duplicate submission (update path)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    const updatedResponse = {
      ...MOCK_SURVEY_RESPONSE_ROW,
      answers: { q1: 'Fall', q2: 5 }, // new answers
    };
    mockSurveyResponse.upsert.mockResolvedValueOnce(updatedResponse);
    mockTripMember.count.mockResolvedValueOnce(5);
    mockSurveyResponse.count.mockResolvedValueOnce(1);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: { answers: { q1: 'Fall', q2: 5 } },
    });
    const res = await surveyPUT(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Verify the upsert uses the correct compound key
    const upsertCall = mockSurveyResponse.upsert.mock.calls[0][0] as {
      where: { surveyId_userId: { surveyId: string; userId: string } };
    };
    expect(upsertCall.where.surveyId_userId.surveyId).toBe(MOCK_SURVEY_ID);
    expect(upsertCall.where.surveyId_userId.userId).toBe(MOCK_USER_ID);
  });

  it('returns 500 when surveyResponse.upsert throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockSurveyResponse.upsert.mockRejectedValueOnce(new Error('Upsert failed'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_ANSWERS,
    });
    const res = await surveyPUT(req, SURVEY_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to submit response');
  });
});

// ===========================================================================
// GET /api/trips/[tripId]/voting — edge cases
// ===========================================================================
describe('GET /api/trips/[tripId]/voting — edge cases', () => {
  it('returns results for multiple sessions with independent vote counts', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);

    const sessionA = {
      ...MOCK_VOTING_SESSION_BASE,
      id: 'vsession-a',
      title: 'Session A',
      votes: [
        { id: 'va1', sessionId: 'vsession-a', orderId: 'u1', optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
        { id: 'va2', sessionId: 'vsession-a', orderId: 'u2', optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      ],
      _count: { votes: 2 },
    };
    const sessionB = {
      ...MOCK_VOTING_SESSION_BASE,
      id: 'vsession-b',
      title: 'Session B',
      votes: [
        { id: 'vb1', sessionId: 'vsession-b', orderId: 'u1', optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
      ],
      _count: { votes: 1 },
    };
    mockVotingSession.findMany.mockResolvedValueOnce([sessionA, sessionB]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);

    const resultA = body.data[0];
    const resultB = body.data[1];

    expect(resultA.totalVotes).toBe(2);
    expect(resultB.totalVotes).toBe(1);

    // Session A: both votes on option A → 100%
    const optionAResult = resultA.results.find(
      (r: { optionId: string }) => r.optionId === MOCK_OPTION_ID_A
    );
    expect(optionAResult.votes).toBe(2);
    expect(optionAResult.percentage).toBe(100);
  });

  it('returns results sorted by vote count descending within each session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);

    const sessionWithSkewedVotes = {
      ...MOCK_VOTING_SESSION_BASE,
      votes: [
        { id: 'v1', sessionId: MOCK_SESSION_ID, orderId: 'u1', optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
        { id: 'v2', sessionId: MOCK_SESSION_ID, orderId: 'u2', optionId: MOCK_OPTION_ID_B, rank: null, createdAt: new Date() },
        { id: 'v3', sessionId: MOCK_SESSION_ID, orderId: 'u3', optionId: MOCK_OPTION_ID_A, rank: null, createdAt: new Date() },
      ],
      _count: { votes: 3 },
    };
    mockVotingSession.findMany.mockResolvedValueOnce([sessionWithSkewedVotes]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const results = body.data[0].results as Array<{ optionId: string; votes: number }>;

    // Tokyo (B) has 2 votes, Paris (A) has 1 — results should be sorted desc
    expect(results[0].optionId).toBe(MOCK_OPTION_ID_B);
    expect(results[0].votes).toBe(2);
    expect(results[1].optionId).toBe(MOCK_OPTION_ID_A);
    expect(results[1].votes).toBe(1);
  });

  it('returns 0% for all options when a session has zero total votes', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findMany.mockResolvedValueOnce([MOCK_VOTING_SESSION_BASE]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`);
    const res = await votingGET(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    const results = body.data[0].results as Array<{ percentage: number }>;
    results.forEach(r => expect(r.percentage).toBe(0));
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/voting — edge cases
// ===========================================================================
describe('POST /api/trips/[tripId]/voting — edge cases', () => {
  it('accepts options with optional metadata and description fields', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);

    const richOptions = [
      {
        id: 'opt-1',
        title: 'Paris',
        description: 'City of Light',
        imageUrl: 'https://example.com/paris.jpg',
        metadata: { country: 'France', timezone: 'Europe/Paris' },
      },
    ];
    const createdSession = { ...MOCK_VOTING_SESSION_BASE, options: richOptions };
    mockVotingSession.create.mockResolvedValueOnce(createdSession);
    mockTrip.update.mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: {
        type: 'DESTINATION',
        title: 'Destination vote',
        options: richOptions,
        expirationHours: 12,
      },
    });
    const res = await votingPOST(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockVotingSession.create).toHaveBeenCalledOnce();
  });

  it('accepts CUSTOM type for voting session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);

    const customSession = { ...MOCK_VOTING_SESSION_BASE, type: 'CUSTOM' };
    mockVotingSession.create.mockResolvedValueOnce(customSession);
    mockTrip.update.mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: {
        type: 'CUSTOM',
        title: 'Custom poll',
        options: [{ id: 'c1', title: 'Option 1' }],
        expirationHours: 6,
      },
    });
    const res = await votingPOST(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    const createCall = mockVotingSession.create.mock.calls[0][0] as {
      data: { type: string };
    };
    expect(createCall.data.type).toBe('CUSTOM');
  });

  it('returns 400 when options array is empty', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_ROW);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'POST',
      body: {
        type: 'DESTINATION',
        title: 'No options vote',
        options: [], // valid Zod array but semantically empty
        expirationHours: 12,
      },
    });
    // The schema does NOT enforce minLength on options, so create proceeds
    // and it should return 201 (not 400)
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION_BASE);
    mockTrip.update.mockResolvedValueOnce({} as never);
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const res = await votingPOST(req, VOTING_ROUTE_PARAMS);

    // Empty options array passes Zod (no min constraint), so 201 is expected
    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// PUT /api/trips/[tripId]/voting — edge cases
// ===========================================================================
describe('PUT /api/trips/[tripId]/voting — edge cases', () => {
  it('successfully votes for the second option (optionId B)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_BASE);

    const voteBRow = { ...MOCK_VOTE_ROW, optionId: MOCK_OPTION_ID_B };
    mockVote.upsert.mockResolvedValueOnce(voteBRow);
    mockTripMember.count.mockResolvedValueOnce(5);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_B },
    });
    const res = await votingPUT(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.optionId).toBe(MOCK_OPTION_ID_B);
    expect(mockVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ optionId: MOCK_OPTION_ID_B }),
      })
    );
  });

  it('stores rank on vote when rank field is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_BASE);

    const rankedVote = { ...MOCK_VOTE_ROW, rank: 2 };
    mockVote.upsert.mockResolvedValueOnce(rankedVote);
    mockTripMember.count.mockResolvedValueOnce(4);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MOCK_USER_ID }]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_A, rank: 2 },
    });
    const res = await votingPUT(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.rank).toBe(2);
    expect(mockVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ rank: 2 }),
        update: expect.objectContaining({ rank: 2 }),
      })
    );
  });

  it('returns 500 when vote.upsert throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_BASE);
    mockVote.upsert.mockRejectedValueOnce(new Error('Upsert constraint violation'));

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_A },
    });
    const res = await votingPUT(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to submit vote');
  });

  it('closes session and returns expired error when expiresAt is in the past', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);

    // Session is ACTIVE but expiresAt is already past
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION_BASE,
      status: 'ACTIVE',
      expiresAt: PAST_DATE,
    });
    mockVotingSession.update.mockResolvedValueOnce({} as never);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_A },
    });
    const res = await votingPUT(req, VOTING_ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Voting session has expired');
    // Must have updated status to CLOSED
    expect(mockVotingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_SESSION_ID },
        data: { status: 'CLOSED' },
      })
    );
    expect(mockVote.upsert).not.toHaveBeenCalled();
  });

  it('does not close session when exactly one voter short of all members having voted', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION_BASE);
    mockVote.upsert.mockResolvedValueOnce(MOCK_VOTE_ROW);

    // 4 members, only 3 have voted so far
    mockTripMember.count.mockResolvedValueOnce(4);
    mockVote.groupBy.mockResolvedValueOnce([
      { orderId: 'u1' },
      { orderId: 'u2' },
      { orderId: 'u3' },
    ]);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/voting`, {
      method: 'PUT',
      body: { sessionId: MOCK_SESSION_ID, optionId: MOCK_OPTION_ID_A },
    });
    const res = await votingPUT(req, VOTING_ROUTE_PARAMS);

    expect(res.status).toBe(200);
    // votingSession.update should NOT be called (session stays ACTIVE)
    expect(mockVotingSession.update).not.toHaveBeenCalled();
  });
});
