/**
 * Integration tests: full trip lifecycle
 *
 * Phases covered
 * --------------
 * 1. Trip creation   — POST /api/trips
 * 2. Trip retrieval  — GET  /api/trips/[tripId]
 * 3. Member listing  — GET  /api/trips/[tripId]/members
 * 4. Invitations     — POST /api/trips/[tripId]/invitations
 *                      GET  /api/trips/[tripId]/invitations
 * 5. Activities      — POST /api/trips/[tripId]/activities
 *                      GET  /api/trips/[tripId]/activities
 * 6. Voting          — POST /api/trips/[tripId]/voting  (create session)
 *                      GET  /api/trips/[tripId]/voting  (list sessions)
 *                      PUT  /api/trips/[tripId]/voting  (submit vote)
 * 7. Survey          — POST /api/trips/[tripId]/survey  (create)
 *                      GET  /api/trips/[tripId]/survey  (fetch)
 *                      PUT  /api/trips/[tripId]/survey  (submit response)
 * 8. Permissions     — ownership / non-member edge cases
 * 9. Happy-path flow — sequential lifecycle steps as independent it() blocks
 *
 * Hygiene rules
 * -------------
 * - vi.clearAllMocks() in beforeEach
 * - mockResolvedValueOnce() only — no persistent mock state
 * - Static top-level imports for all route handlers
 * - Valid CUIDs for all IDs
 * - No production source files modified
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { processInvitations } from '@/lib/invitations';

// ---------------------------------------------------------------------------
// Override the prisma mock completely (not extending the original) so we have
// full control over all methods needed by the routes under test, including
// surveyResponse.count which setup.ts does not define.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    trip: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tripMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    tripInvitation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    activity: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    activityRating: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      aggregate: vi.fn(),
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
    tripSurvey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    surveyResponse: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pendingInvitation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock: rate-limit (prevent live Redis calls)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  apiRateLimiter: null,
  getRateLimitHeaders: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Static imports of route handlers under test
// (must appear after vi.mock declarations)
// ---------------------------------------------------------------------------
import { GET as tripsGET, POST as tripsPost } from '@/app/api/trips/route';
import {
  GET as tripByIdGET,
  PATCH as tripByIdPATCH,
  DELETE as tripByIdDELETE,
} from '@/app/api/trips/[tripId]/route';
import {
  GET as membersGET,
  POST as membersPOST,
} from '@/app/api/trips/[tripId]/members/route';
import {
  GET as invitationsGET,
  POST as invitationsPOST,
} from '@/app/api/trips/[tripId]/invitations/route';
import {
  GET as activitiesGET,
  POST as activitiesPOST,
} from '@/app/api/trips/[tripId]/activities/route';
import {
  GET as votingGET,
  POST as votingPOST,
  PUT as votingPUT,
} from '@/app/api/trips/[tripId]/voting/route';
import {
  GET as surveyGET,
  POST as surveyPOST,
  PUT as surveyPUT,
} from '@/app/api/trips/[tripId]/survey/route';

// ---------------------------------------------------------------------------
// Typed mock references (cast to expose vi.fn() methods)
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);

const mockTrip = prisma.trip as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockTripMember = prisma.tripMember as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

const mockTripInvitation = prisma.tripInvitation as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

const mockActivity = prisma.activity as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

const mockActivityRating = prisma.activityRating as unknown as {
  aggregate: ReturnType<typeof vi.fn>;
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

const mockTripSurvey = prisma.tripSurvey as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockSurveyResponse = prisma.surveyResponse as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

const mockNotification = prisma.notification as unknown as {
  createMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixture constants (valid CUIDs)
// ---------------------------------------------------------------------------
const OWNER_USER_ID     = 'clh7nz5vr0000mg0hb9gkfxe0';
const MEMBER_USER_ID    = 'clh7nz5vr0001mg0hkrtwqhf1';
const OUTSIDE_USER_ID   = 'clh7nz5vr0002mg0hpqrstuvw2';
const TRIP_ID           = 'clh7nz5vr0003mg0habcdef123';
const ACTIVITY_ID       = 'clh7nz5vr0004mg0hactivity1';
const VOTING_SESSION_ID = 'clh7nz5vr0005mg0hvotesess1';
const SURVEY_ID         = 'clh7nz5vr0006mg0hsurveyid1';
const MEMBER_ROW_ID     = 'clh7nz5vr0007mg0hmemberrow';
const INVITE_ID         = 'clh7nz5vr0008mg0hinviteid1';

const OWNER_SESSION = {
  user: { id: OWNER_USER_ID, name: 'Owner User', email: 'owner@example.com' },
  expires: '2099-01-01',
};

const MEMBER_SESSION = {
  user: { id: MEMBER_USER_ID, name: 'Member User', email: 'member@example.com' },
  expires: '2099-01-01',
};

const OUTSIDE_SESSION = {
  user: { id: OUTSIDE_USER_ID, name: 'Outside User', email: 'outside@example.com' },
  expires: '2099-01-01',
};

/** Minimal trip row returned by Prisma */
const MOCK_TRIP_ROW = {
  id: TRIP_ID,
  title: 'Barcelona Adventure',
  description: 'Sun, tapas, and architecture',
  destination: { city: 'Barcelona', country: 'Spain' },
  startDate: new Date('2026-08-01'),
  endDate: new Date('2026-08-10'),
  isPublic: false,
  ownerId: OWNER_USER_ID,
  status: 'PLANNING' as const,
  viewCount: 0,
  coverImage: null,
  budget: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  owner: { id: OWNER_USER_ID, name: 'Owner User', image: null },
  members: [
    {
      id: MEMBER_ROW_ID,
      userId: OWNER_USER_ID,
      tripId: TRIP_ID,
      role: 'OWNER' as const,
      joinedAt: new Date('2026-01-01'),
      user: { id: OWNER_USER_ID, name: 'Owner User', image: null },
    },
  ],
  activities: [],
  survey: null,
  itinerary: [],
  invitations: [],
  _count: { members: 1, activities: 0 },
};

/** Owner membership row */
const OWNER_MEMBERSHIP = {
  id: MEMBER_ROW_ID,
  userId: OWNER_USER_ID,
  tripId: TRIP_ID,
  role: 'OWNER' as const,
  joinedAt: new Date('2026-01-01'),
};

/** Regular member row */
const MEMBER_MEMBERSHIP = {
  id: 'clh7nz5vr0009mg0hmem2rowid',
  userId: MEMBER_USER_ID,
  tripId: TRIP_ID,
  role: 'MEMBER' as const,
  joinedAt: new Date('2026-01-02'),
};

/** Minimal activity row */
const MOCK_ACTIVITY_ROW = {
  id: ACTIVITY_ID,
  tripId: TRIP_ID,
  name: 'Sagrada Familia Tour',
  description: 'Guided tour of the iconic basilica',
  category: 'CULTURE' as const,
  status: 'SUGGESTED' as const,
  location: { address: 'Carrer de Mallorca, 401, Barcelona' },
  date: new Date('2026-08-03'),
  startTime: null,
  endTime: null,
  duration: 120,
  cost: 35,
  currency: 'EUR',
  priceRange: 'MODERATE' as const,
  costDetails: null,
  bookingStatus: 'RECOMMENDED' as const,
  bookingUrl: null,
  requirements: null,
  externalLinks: null,
  isPublic: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  _count: { comments: 0, ratings: 0, savedBy: 0 },
};

/** Minimal voting session row */
const MOCK_VOTING_SESSION = {
  id: VOTING_SESSION_ID,
  tripId: TRIP_ID,
  type: 'ACTIVITY' as const,
  title: 'Which activity should we do?',
  options: [
    { id: 'opt-1', title: 'Sagrada Familia' },
    { id: 'opt-2', title: 'Park Güell' },
  ],
  status: 'ACTIVE' as const,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  createdAt: new Date('2026-01-01'),
  votes: [],
  _count: { votes: 0 },
};

/** Minimal survey row */
const MOCK_SURVEY = {
  id: SURVEY_ID,
  tripId: TRIP_ID,
  title: 'Trip Preferences Survey',
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      question: 'Preferred travel pace?',
      required: true,
      options: ['Relaxed', 'Moderate', 'Fast'],
    },
  ],
  status: 'ACTIVE' as const,
  expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  createdAt: new Date('2026-01-01'),
  responses: [],
  _count: { responses: 0 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Request with optional body */
function makeRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Params object for App Router handlers that use Promise<params> */
function makeParams(tripId: string): { params: Promise<{ tripId: string }> } {
  return { params: Promise.resolve({ tripId }) };
}

/** Params object for App Router handlers that use sync params */
function makeSyncParams(tripId: string): { params: { tripId: string } } {
  return { params: { tripId } };
}

// ============================================================================
// beforeEach: reset all mock state (flushes mockResolvedValueOnce queues)
// and re-establish factory mock implementations that resetAllMocks clears.
// ============================================================================
beforeEach(() => {
  vi.resetAllMocks();
  // Re-establish factory mock implementations cleared by resetAllMocks.
  vi.mocked(checkRateLimit).mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 });
  vi.mocked(getRateLimitHeaders).mockReturnValue({});
  vi.mocked(processInvitations).mockResolvedValue({ invitations: [], errors: [] } as never);
});

// ============================================================================
// Phase 1 — Trip creation: POST /api/trips
// ============================================================================
describe('Phase 1 — Trip creation (POST /api/trips)', () => {
  const validCreateBody = {
    title: 'Barcelona Adventure',
    description: 'Sun, tapas, and architecture',
    destination: { city: 'Barcelona', country: 'Spain' },
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    isPublic: false,
  };

  it('creates a trip successfully and returns 201', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.create.mockResolvedValueOnce(MOCK_TRIP_ROW);

    const req = makeRequest('POST', 'http://localhost/api/trips', validCreateBody);
    const res = await tripsPost(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(TRIP_ID);
    expect(json.data.title).toBe('Barcelona Adventure');
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('POST', 'http://localhost/api/trips', validCreateBody);
    const res = await tripsPost(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when title is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);

    const req = makeRequest('POST', 'http://localhost/api/trips', {
      destination: { city: 'Barcelona', country: 'Spain' },
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    });
    const res = await tripsPost(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when destination city is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);

    const req = makeRequest('POST', 'http://localhost/api/trips', {
      title: 'Trip',
      destination: { country: 'Spain' },
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    });
    const res = await tripsPost(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('creates trip with invited emails and returns invitations field', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.create.mockResolvedValueOnce(MOCK_TRIP_ROW);

    const req = makeRequest('POST', 'http://localhost/api/trips', {
      ...validCreateBody,
      memberEmails: ['friend@example.com'],
    });
    const res = await tripsPost(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    // processInvitations is mocked in setup.ts to return { invitations: [], errors: [] }
    expect(json.invitations).toBeDefined();
  });

  it('lists trips for authenticated user', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findMany.mockResolvedValueOnce([MOCK_TRIP_ROW]);

    const req = makeRequest('GET', 'http://localhost/api/trips');
    const res = await tripsGET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it('returns 401 listing trips when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('GET', 'http://localhost/api/trips');
    const res = await tripsGET(req);

    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Phase 2 — Trip retrieval: GET /api/trips/[tripId]
// ============================================================================
describe('Phase 2 — Trip retrieval (GET /api/trips/[tripId])', () => {
  it('returns trip data for a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_ROW);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(TRIP_ID);
  });

  it('returns 404 when trip does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Trip not found');
  });

  it('returns 401 when non-member tries to access private trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OUTSIDE_SESSION);
    // Trip exists but is private and outside user is not in members[]
    mockTrip.findUnique.mockResolvedValueOnce({
      ...MOCK_TRIP_ROW,
      isPublic: false,
      members: [],
    });

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it('allows unauthenticated access to public trips', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    mockTrip.findUnique.mockResolvedValueOnce({
      ...MOCK_TRIP_ROW,
      isPublic: true,
    });

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns 403 when non-owner/admin tries to PATCH trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    // findFirst returns null → member doesn't have OWNER or ADMIN role
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('PATCH', `http://localhost/api/trips/${TRIP_ID}`, {
      title: 'Updated Title',
    });
    const res = await tripByIdPATCH(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it('returns 403 when non-owner tries to DELETE trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    // isTripOwner calls trip.findFirst → null = not owner
    mockTrip.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('DELETE', `http://localhost/api/trips/${TRIP_ID}`);
    const res = await tripByIdDELETE(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });
});

// ============================================================================
// Phase 3 — Member management: GET /api/trips/[tripId]/members
// ============================================================================
describe('Phase 3 — Member management (GET /api/trips/[tripId]/members)', () => {
  it('returns member list for authenticated user', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findMany.mockResolvedValueOnce([
      {
        ...OWNER_MEMBERSHIP,
        user: {
          id: OWNER_USER_ID,
          name: 'Owner User',
          email: 'owner@example.com',
          image: null,
          city: null,
          preferences: null,
        },
      },
    ]);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/members`);
    const res = await membersGET(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].role).toBe('OWNER');
  });

  it('returns 401 when unauthenticated user tries to list members', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/members`);
    const res = await membersGET(req, makeSyncParams(TRIP_ID));

    expect(res.status).toBe(401);
  });

  it('adds a new member by userId when owner requests it', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    // requestingMember check: owner membership found with OWNER role
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    // existing member check: no existing entry for target user
    mockTripMember.findFirst.mockResolvedValueOnce(null);
    // create new member
    mockTripMember.create.mockResolvedValueOnce({
      ...MEMBER_MEMBERSHIP,
      user: {
        id: MEMBER_USER_ID,
        name: 'Member User',
        email: 'member@example.com',
        image: null,
      },
    });

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/members`, {
      userId: MEMBER_USER_ID,
    });
    const res = await membersPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.userId).toBe(MEMBER_USER_ID);
  });

  it('returns 403 when a plain member tries to add another member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    // MEMBER role — not OWNER or ADMIN
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/members`, {
      userId: OUTSIDE_USER_ID,
    });
    const res = await membersPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it('returns 409 when user is already a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    // requestingMember: owner
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    // existing member: already there
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/members`, {
      userId: MEMBER_USER_ID,
    });
    const res = await membersPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toBe('User is already a member of this trip');
  });
});

// ============================================================================
// Phase 4 — Invitation flow
// ============================================================================
describe('Phase 4 — Invitation flow', () => {
  it('sends invitations when owner POSTs email list', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    // trip.findUnique and tripMember.findFirst are called in parallel
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID, title: 'Barcelona Adventure' });
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/invitations`, {
      emails: ['friend@example.com'],
      expirationHours: 24,
    });
    const res = await invitationsPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  it('returns 401 when unauthenticated user tries to send invitations', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/invitations`, {
      emails: ['friend@example.com'],
    });
    const res = await invitationsPOST(req, makeParams(TRIP_ID));

    expect(res.status).toBe(401);
  });

  it('returns 404 when trip does not exist for invitation POST', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce(null);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/invitations`, {
      emails: ['friend@example.com'],
    });
    const res = await invitationsPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Trip not found');
  });

  it('returns 403 when plain member tries to send invitations', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    // trip.ownerId is the OWNER, not the MEMBER
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID, title: 'Barcelona Adventure' });
    // membership returned null (MEMBER not OWNER/ADMIN)
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/invitations`, {
      emails: ['friend@example.com'],
    });
    const res = await invitationsPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it('returns 400 when invitation emails array contains invalid email', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID, title: 'Barcelona Adventure' });
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/invitations`, {
      emails: ['not-an-email'],
    });
    const res = await invitationsPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('GET invitations returns list for member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTripInvitation.findMany.mockResolvedValueOnce([
      {
        id: INVITE_ID,
        tripId: TRIP_ID,
        email: 'friend@example.com',
        status: 'PENDING',
        createdAt: new Date('2026-01-01'),
        user: null,
      },
    ]);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/invitations`);
    const res = await invitationsGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].email).toBe('friend@example.com');
  });

  it('GET invitations returns 403 for non-member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OUTSIDE_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/invitations`);
    const res = await invitationsGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });
});

// ============================================================================
// Phase 5 — Activity creation and listing
// ============================================================================
describe('Phase 5 — Activity creation and listing', () => {
  const validActivityBody = {
    name: 'Sagrada Familia Tour',
    category: 'CULTURE',
    description: 'Guided tour of the iconic basilica',
  };

  it('creates an activity as a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID });
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockActivity.create.mockResolvedValueOnce(MOCK_ACTIVITY_ROW);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/activities`, validActivityBody);
    const res = await activitiesPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Sagrada Familia Tour');
    expect(json.data.category).toBe('CULTURE');
    expect(json.data.status).toBe('SUGGESTED');
  });

  it('returns 401 when unauthenticated user tries to create activity', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/activities`, validActivityBody);
    const res = await activitiesPOST(req, makeParams(TRIP_ID));

    expect(res.status).toBe(401);
  });

  it('returns 400 when activity category is invalid (ADVENTURE is not a valid enum value)', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID });
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/activities`, {
      name: 'Skydiving',
      category: 'ADVENTURE', // invalid — not in the enum
    });
    const res = await activitiesPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 403 when non-member tries to create activity', async () => {
    mockGetServerSession.mockResolvedValueOnce(OUTSIDE_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID });
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/activities`, validActivityBody);
    const res = await activitiesPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it('lists activities for a member of a private trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce({ isPublic: false, ownerId: OWNER_USER_ID });
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockActivity.findMany.mockResolvedValueOnce([MOCK_ACTIVITY_ROW]);
    mockActivityRating.aggregate.mockResolvedValueOnce({ _avg: { score: 4.5 } });

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/activities`);
    const res = await activitiesGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].averageRating).toBe(4.5);
  });
});

// ============================================================================
// Phase 6 — Voting
// ============================================================================
describe('Phase 6 — Voting sessions', () => {
  it('creates a voting session as owner/admin', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockTrip.update.mockResolvedValueOnce({ ...MOCK_TRIP_ROW, status: 'VOTING' });
    mockTripMember.findMany.mockResolvedValueOnce([MEMBER_MEMBERSHIP]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      type: 'ACTIVITY',
      title: 'Which activity should we do?',
      options: [
        { id: 'opt-1', title: 'Sagrada Familia' },
        { id: 'opt-2', title: 'Park Güell' },
      ],
      expirationHours: 24,
    });
    const res = await votingPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.type).toBe('ACTIVITY');
    expect(json.data.status).toBe('ACTIVE');
  });

  it('returns 403 when plain member tries to create voting session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    // findFirst returns null — MEMBER role not OWNER or ADMIN
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      type: 'ACTIVITY',
      title: 'Vote',
      options: [{ id: 'opt-1', title: 'Option 1' }],
    });
    const res = await votingPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it('lists voting sessions with results for a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockVotingSession.findMany.mockResolvedValueOnce([MOCK_VOTING_SESSION]);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/voting`);
    const res = await votingGET(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].results).toBeDefined();
    expect(json.data[0].totalVotes).toBe(0);
  });

  it('returns 403 for GET voting sessions when non-member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OUTSIDE_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/voting`);
    const res = await votingGET(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it('submits a vote on an active session', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'clh7nz5vr0010mg0hvoterow1',
      sessionId: VOTING_SESSION_ID,
      orderId: MEMBER_USER_ID,
      optionId: 'opt-1',
      rank: null,
    });
    mockTripMember.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MEMBER_USER_ID }]);

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      sessionId: VOTING_SESSION_ID,
      optionId: 'opt-1',
    });
    const res = await votingPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.optionId).toBe('opt-1');
  });

  it('returns 400 when voting on an invalid option', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      sessionId: VOTING_SESSION_ID,
      optionId: 'opt-does-not-exist',
    });
    const res = await votingPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid option');
  });

  it('returns 400 when voting session is closed', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockVotingSession.findUnique.mockResolvedValueOnce({
      ...MOCK_VOTING_SESSION,
      status: 'CLOSED',
    });

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      sessionId: VOTING_SESSION_ID,
      optionId: 'opt-1',
    });
    const res = await votingPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Voting session is not active');
  });
});

// ============================================================================
// Phase 7 — Survey
// ============================================================================
describe('Phase 7 — Survey', () => {
  const validSurveyBody = {
    title: 'Trip Preferences Survey',
    questions: [
      {
        id: 'q1',
        type: 'single_choice',
        question: 'Preferred travel pace?',
        required: true,
        options: ['Relaxed', 'Moderate', 'Fast'],
      },
    ],
    expirationHours: 48,
  };

  it('creates a survey as owner/admin', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null); // no existing survey
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY);
    mockTrip.update.mockResolvedValueOnce({ ...MOCK_TRIP_ROW, status: 'SURVEYING' });
    mockTripMember.findMany.mockResolvedValueOnce([MEMBER_MEMBERSHIP]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/survey`, validSurveyBody);
    const res = await surveyPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Trip Preferences Survey');
    expect(json.data.status).toBe('ACTIVE');
  });

  it('returns 400 when survey already exists for the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY); // already exists

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/survey`, validSurveyBody);
    const res = await surveyPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Survey already exists for this trip');
  });

  it('returns 403 when plain member tries to create survey', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    // findFirst returns null — MEMBER not OWNER or ADMIN
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/survey`, validSurveyBody);
    const res = await surveyPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not authorized to create survey');
  });

  it('fetches survey for a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/survey`);
    const res = await surveyGET(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Trip Preferences Survey');
    expect(json.data.hasResponded).toBe(false);
  });

  it('returns 404 when no survey exists for the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}/survey`);
    const res = await surveyGET(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('No survey found for this trip');
  });

  it('submits a survey response as a member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY);
    mockSurveyResponse.upsert.mockResolvedValueOnce({
      id: 'clh7nz5vr0011mg0hresponse1',
      surveyId: SURVEY_ID,
      userId: MEMBER_USER_ID,
      answers: { q1: 'Relaxed' },
      createdAt: new Date('2026-01-01'),
      user: { id: MEMBER_USER_ID, name: 'Member User', image: null },
    });
    // memberCount: 2, responseCount: 1 → survey stays open
    mockTripMember.count.mockResolvedValueOnce(2);
    mockSurveyResponse.count.mockResolvedValueOnce(1);

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/survey`, {
      answers: { q1: 'Relaxed' },
    });
    const res = await surveyPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.answers).toEqual({ q1: 'Relaxed' });
  });

  it('returns 400 when submitting response to a closed survey', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce({
      ...MOCK_SURVEY,
      status: 'CLOSED',
    });

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/survey`, {
      answers: { q1: 'Relaxed' },
    });
    const res = await surveyPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Survey is not active');
  });
});

// ============================================================================
// Phase 8 — Permission / ownership edge cases
// ============================================================================
describe('Phase 8 — Permission / ownership edge cases', () => {
  it('only trip owner can delete the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findFirst.mockResolvedValueOnce(MOCK_TRIP_ROW); // isTripOwner passes
    mockTrip.delete.mockResolvedValueOnce(MOCK_TRIP_ROW);

    const req = makeRequest('DELETE', `http://localhost/api/trips/${TRIP_ID}`);
    const res = await tripByIdDELETE(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('Trip deleted successfully');
  });

  it('owner can PATCH trip (update title)', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTrip.update.mockResolvedValueOnce({
      ...MOCK_TRIP_ROW,
      title: 'Updated Title',
    });

    const req = makeRequest('PATCH', `http://localhost/api/trips/${TRIP_ID}`, {
      title: 'Updated Title',
    });
    const res = await tripByIdPATCH(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Updated Title');
  });

  it('returns 401 for voting PUT when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      sessionId: VOTING_SESSION_ID,
      optionId: 'opt-1',
    });
    const res = await votingPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 for voting PUT when non-member', async () => {
    mockGetServerSession.mockResolvedValueOnce(OUTSIDE_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      sessionId: VOTING_SESSION_ID,
      optionId: 'opt-1',
    });
    const res = await votingPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
  });
});

// ============================================================================
// Phase 9 — Full happy-path lifecycle (sequential steps)
// ============================================================================
describe('Phase 9 — Full happy-path lifecycle', () => {
  it('Step 1: owner creates the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.create.mockResolvedValueOnce(MOCK_TRIP_ROW);

    const req = makeRequest('POST', 'http://localhost/api/trips', {
      title: 'Barcelona Adventure',
      destination: { city: 'Barcelona', country: 'Spain' },
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    });
    const res = await tripsPost(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.ownerId).toBe(OWNER_USER_ID);
  });

  it('Step 2: owner retrieves the newly created trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce(MOCK_TRIP_ROW);

    const req = makeRequest('GET', `http://localhost/api/trips/${TRIP_ID}`);
    const res = await tripByIdGET(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('PLANNING');
  });

  it('Step 3: owner invites a friend by email', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID, title: 'Barcelona Adventure' });
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/invitations`, {
      emails: ['friend@example.com'],
    });
    const res = await invitationsPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('Step 4: owner adds an activity to the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTrip.findUnique.mockResolvedValueOnce({ ownerId: OWNER_USER_ID });
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockActivity.create.mockResolvedValueOnce(MOCK_ACTIVITY_ROW);

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/activities`, {
      name: 'Sagrada Familia Tour',
      category: 'CULTURE',
    });
    const res = await activitiesPOST(req, makeParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe('SUGGESTED');
  });

  it('Step 5: owner creates a voting session to choose activities', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockVotingSession.create.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockTrip.update.mockResolvedValueOnce({ ...MOCK_TRIP_ROW, status: 'VOTING' });
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      type: 'ACTIVITY',
      title: 'Which activity?',
      options: [
        { id: 'opt-1', title: 'Sagrada Familia' },
        { id: 'opt-2', title: 'Park Güell' },
      ],
    });
    const res = await votingPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe('ACTIVE');
  });

  it('Step 6: member casts a vote', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockVotingSession.findUnique.mockResolvedValueOnce(MOCK_VOTING_SESSION);
    mockVote.upsert.mockResolvedValueOnce({
      id: 'clh7nz5vr0012mg0hvote2id1',
      sessionId: VOTING_SESSION_ID,
      orderId: MEMBER_USER_ID,
      optionId: 'opt-2',
      rank: null,
    });
    mockTripMember.count.mockResolvedValueOnce(2);
    mockVote.groupBy.mockResolvedValueOnce([{ orderId: MEMBER_USER_ID }]);

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/voting`, {
      sessionId: VOTING_SESSION_ID,
      optionId: 'opt-2',
    });
    const res = await votingPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.optionId).toBe('opt-2');
  });

  it('Step 7: owner creates survey to gather preferences', async () => {
    mockGetServerSession.mockResolvedValueOnce(OWNER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce(null); // no existing survey
    mockTripSurvey.create.mockResolvedValueOnce(MOCK_SURVEY);
    mockTrip.update.mockResolvedValueOnce({ ...MOCK_TRIP_ROW, status: 'SURVEYING' });
    mockTripMember.findMany.mockResolvedValueOnce([]);
    mockNotification.createMany.mockResolvedValueOnce({ count: 0 });

    const req = makeRequest('POST', `http://localhost/api/trips/${TRIP_ID}/survey`, {
      title: 'Trip Preferences Survey',
      questions: [
        {
          id: 'q1',
          type: 'single_choice',
          question: 'Preferred travel pace?',
          required: true,
          options: ['Relaxed', 'Moderate', 'Fast'],
        },
      ],
    });
    const res = await surveyPOST(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe('ACTIVE');
  });

  it('Step 8: member submits survey response completing the lifecycle', async () => {
    mockGetServerSession.mockResolvedValueOnce(MEMBER_SESSION);
    mockTripMember.findFirst.mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    mockTripSurvey.findUnique.mockResolvedValueOnce(MOCK_SURVEY);
    mockSurveyResponse.upsert.mockResolvedValueOnce({
      id: 'clh7nz5vr0013mg0hresponse2',
      surveyId: SURVEY_ID,
      userId: MEMBER_USER_ID,
      answers: { q1: 'Moderate' },
      createdAt: new Date('2026-01-01'),
      user: { id: MEMBER_USER_ID, name: 'Member User', image: null },
    });
    // responseCount >= memberCount → survey closes
    mockTripMember.count.mockResolvedValueOnce(2);
    mockSurveyResponse.count.mockResolvedValueOnce(2);
    mockTripSurvey.update.mockResolvedValueOnce({ ...MOCK_SURVEY, status: 'CLOSED' });

    const req = makeRequest('PUT', `http://localhost/api/trips/${TRIP_ID}/survey`, {
      answers: { q1: 'Moderate' },
    });
    const res = await surveyPUT(req, makeSyncParams(TRIP_ID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.answers).toEqual({ q1: 'Moderate' });
  });
});
