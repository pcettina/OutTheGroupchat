/**
 * Unit tests for the Survey API route handlers.
 *
 * Route: /api/trips/[tripId]/survey  (GET, POST, PUT)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts.  This file extends those mocks with the
 *   additional Prisma models the survey handlers require: tripSurvey,
 *   surveyResponse, and the extra methods on tripMember / notification.
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
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Extend the global prisma mock (defined in setup.ts) with the additional
// models and methods required by the survey route handler.
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

// Import the handlers under test after the mock declaration.
import {
  GET as surveyGET,
  POST as surveyPOST,
  PUT as surveyPUT,
} from '@/app/api/trips/[tripId]/survey/route';

// ---------------------------------------------------------------------------
// Typed references to mocked sub-objects
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);

const mockPrismaTripMember = prisma.tripMember as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};
const mockPrismaTripSurvey = prisma.tripSurvey as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockPrismaSurveyResponse = prisma.surveyResponse as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-abc-123';
const MOCK_TRIP_ID = 'trip-xyz-456';
const MOCK_SURVEY_ID = 'survey-def-789';

/** Authenticated session fixture. */
const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
  },
  expires: '2099-01-01',
};

/** tripMember row for a regular member (cannot create surveys). */
const MOCK_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'MEMBER' };

/** tripMember row for a trip owner (can create surveys). */
const MOCK_OWNER_MEMBER = { userId: MOCK_USER_ID, tripId: MOCK_TRIP_ID, role: 'OWNER' };

/** Survey questions satisfying questionSchema. */
const MOCK_QUESTIONS = [
  {
    id: 'q1',
    type: 'single_choice',
    question: 'Preferred travel month?',
    required: true,
    options: ['June', 'July', 'August'],
  },
  {
    id: 'q2',
    type: 'scale',
    question: 'Rate your budget flexibility (1-10)',
    required: true,
    min: 1,
    max: 10,
    step: 1,
  },
];

/** A minimal active tripSurvey row as Prisma would return it from findUnique
 *  without the `responses` include (used for simple existence checks). */
const MOCK_SURVEY_BASE = {
  id: MOCK_SURVEY_ID,
  tripId: MOCK_TRIP_ID,
  title: 'Trip Preferences',
  questions: MOCK_QUESTIONS,
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 h from now
  createdAt: new Date('2026-03-01'),
};

/** A survey row including the `responses` and `_count` relations returned by
 *  the GET handler's findUnique include. */
const MOCK_SURVEY_WITH_RESPONSES = {
  ...MOCK_SURVEY_BASE,
  responses: [],           // no one has responded yet
  _count: { responses: 0 },
};

/** A minimal surveyResponse row returned by prisma.surveyResponse.upsert. */
const MOCK_SURVEY_RESPONSE = {
  id: 'resp-001',
  surveyId: MOCK_SURVEY_ID,
  userId: MOCK_USER_ID,
  answers: { q1: 'June', q2: 7 },
  createdAt: new Date('2026-03-02'),
  user: { id: MOCK_USER_ID, name: 'Test User', image: null },
};

/** Build a minimal NextRequest accepted by the App Router handlers. */
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
// GET /api/trips/[tripId]/survey
// ===========================================================================
describe('GET /api/trips/[tripId]/survey', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    // Prisma should never be reached when auth fails
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 when the authenticated user is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // findFirst returns null → user has no membership record
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/not a member/i);
    expect(mockPrismaTripSurvey.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when no survey exists for the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    // tripSurvey.findUnique returns null → no survey created yet
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/no survey found/i);
  });

  it('returns 200 with the survey and a hasResponded flag computed from responses', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    // Return a survey with no responses yet → hasResponded should be false
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_WITH_RESPONSES);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`);
    const res = await surveyGET(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_SURVEY_ID);
    // The handler derives hasResponded by searching responses for the current user
    expect(body.data).toHaveProperty('hasResponded');
    expect(body.data.hasResponded).toBe(false);
    // When the user has not yet responded, userResponse is `undefined` and
    // JSON.stringify omits undefined-valued keys — so it will not appear in
    // the parsed body.  Assert the absence rather than presence.
    expect(body.data.userResponse).toBeUndefined();
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/survey  (create a survey)
// ===========================================================================
describe('POST /api/trips/[tripId]/survey', () => {
  /** Valid body satisfying createSurveySchema. */
  const VALID_BODY = {
    title: 'Trip Preferences',
    questions: MOCK_QUESTIONS,
    expirationHours: 48,
  };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripSurvey.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is a plain member (not OWNER or ADMIN)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // POST handler queries for OWNER or ADMIN role; return null for a plain member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/not authorized/i);
    expect(mockPrismaTripSurvey.create).not.toHaveBeenCalled();
  });

  it('returns 400 when a survey already exists for the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    // Simulate an existing survey record
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/survey already exists/i);
    expect(mockPrismaTripSurvey.create).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body fails schema validation (questions missing)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    // No existing survey, so we proceed to schema validation
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(null);

    // Omit the required `questions` array to trigger Zod validation failure
    const invalidBody = { title: 'Trip Preferences', expirationHours: 48 };

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: invalidBody,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation failed/i);
    expect(body.details).toBeDefined();
    expect(mockPrismaTripSurvey.create).not.toHaveBeenCalled();
  });

  it('creates the survey and returns 201 when an owner provides a valid body', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_OWNER_MEMBER);
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(null); // no existing survey
    mockPrismaTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY_BASE);

    // Stub the fire-and-forget trip status update and member notification calls
    vi.mocked(prisma.trip.update).mockResolvedValueOnce({} as never);
    mockPrismaTripMember.findMany.mockResolvedValueOnce([]); // no other members to notify
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 });

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'POST',
      body: VALID_BODY,
    });
    const res = await surveyPOST(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_SURVEY_ID);
    expect(mockPrismaTripSurvey.create).toHaveBeenCalledOnce();

    // Verify the survey is created with the correct tripId, title, and status
    const createCall = mockPrismaTripSurvey.create.mock.calls[0][0];
    expect(createCall.data.tripId).toBe(MOCK_TRIP_ID);
    expect(createCall.data.title).toBe(VALID_BODY.title);
    expect(createCall.data.status).toBe('ACTIVE');
  });
});

// ===========================================================================
// PUT /api/trips/[tripId]/survey  (submit a survey response)
// ===========================================================================
describe('PUT /api/trips/[tripId]/survey', () => {
  /** Valid response body satisfying submitResponseSchema. */
  const VALID_RESPONSE_BODY = {
    answers: {
      q1: 'June',
      q2: 7,
    },
  };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_RESPONSE_BODY,
    });
    const res = await surveyPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaSurveyResponse.upsert).not.toHaveBeenCalled();
  });

  it('persists the response and returns 200 when the survey is active', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER);
    // Return an active survey so the handler proceeds past the status check
    mockPrismaTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY_BASE);
    mockPrismaSurveyResponse.upsert.mockResolvedValueOnce(MOCK_SURVEY_RESPONSE);

    // Simulate 3 members total, only 1 has responded → survey stays ACTIVE
    mockPrismaTripMember.count.mockResolvedValueOnce(3);
    mockPrismaSurveyResponse.count.mockResolvedValueOnce(1);

    const req = makeRequest(`/api/trips/${MOCK_TRIP_ID}/survey`, {
      method: 'PUT',
      body: VALID_RESPONSE_BODY,
    });
    const res = await surveyPUT(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // The upserted response with user data should be returned
    expect(body.data.userId).toBe(MOCK_USER_ID);
    expect(body.data.surveyId).toBe(MOCK_SURVEY_ID);
    expect(mockPrismaSurveyResponse.upsert).toHaveBeenCalledOnce();

    // Verify the upsert targets the correct survey and user
    const upsertCall = mockPrismaSurveyResponse.upsert.mock.calls[0][0];
    expect(upsertCall.where.surveyId_userId.surveyId).toBe(MOCK_SURVEY_ID);
    expect(upsertCall.where.surveyId_userId.userId).toBe(MOCK_USER_ID);

    // Survey must NOT be closed because not all members have responded yet
    expect(mockPrismaTripSurvey.update).not.toHaveBeenCalled();
  });
});
