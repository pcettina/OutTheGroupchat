/**
 * Unit tests for the Activities API route handler.
 *
 * Routes:
 *   GET  /api/activities/[activityId] — get activity details (public or auth)
 *   POST /api/activities/[activityId] — save/unsave an activity (auth required)
 *   PUT  /api/activities/[activityId] — add comment or rating (auth required)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in setup.ts.
 * - Handlers are called directly with minimal NextRequest objects.
 * - Params object is passed as the second argument matching Next.js route shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import {
  GET as activityGET,
  POST as activityPOST,
  PUT as activityPUT,
} from '@/app/api/activities/[activityId]/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaTripMember = vi.mocked(prisma.tripMember);
const mockPrismaSavedActivity = vi.mocked(prisma.savedActivity);
const mockPrismaActivityRating = vi.mocked(prisma.activityRating);
const mockPrismaActivityComment = vi.mocked(prisma.activityComment);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_PARAMS = { params: { activityId: 'activity-123' } };
const MOCK_SESSION = { user: { id: 'user-1', name: 'Test User', email: 'test@example.com' } };

const PUBLIC_ACTIVITY = {
  id: 'activity-123',
  name: 'City Tour',
  description: 'A great tour',
  category: 'SIGHTSEEING',
  location: 'Downtown',
  cost: 50,
  currency: 'USD',
  priceRange: 'MODERATE',
  isPublic: true,
  shareCount: 5,
  createdAt: new Date(),
  trip: {
    id: 'trip-1',
    title: 'Summer Trip',
    destination: { city: 'Paris', country: 'France' },
    isPublic: true,
    ownerId: 'owner-1',
  },
  comments: [],
  ratings: [{ score: 4, review: 'Great!', user: { id: 'user-2', name: 'Reviewer', image: null } }],
  _count: { savedBy: 3, comments: 0, ratings: 1 },
};

const PRIVATE_ACTIVITY = {
  ...PUBLIC_ACTIVITY,
  isPublic: false,
  trip: { ...PUBLIC_ACTIVITY.trip, isPublic: false },
};

function makeRequest(body?: unknown, method = 'GET'): NextRequest {
  return new NextRequest('http://localhost:3000/api/activities/activity-123', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// GET /api/activities/[activityId]
// ---------------------------------------------------------------------------
describe('GET /api/activities/[activityId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Explicitly reset session to null (clearAllMocks does not reset implementations)
    mockGetServerSession.mockResolvedValue(null);
  });

  it('returns 404 for unknown activity', async () => {
    mockPrismaActivity.findUnique.mockResolvedValueOnce(null);
    const res = await activityGET(makeRequest(), MOCK_PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns public activity without auth', async () => {
    mockPrismaActivity.findUnique.mockResolvedValueOnce(PUBLIC_ACTIVITY as never);
    // No session → userActions block is skipped
    const res = await activityGET(makeRequest(), MOCK_PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('City Tour');
    expect(body.data.averageRating).toBe(4);
  });

  it('returns 401 for private activity without auth', async () => {
    mockPrismaActivity.findUnique.mockResolvedValueOnce(PRIVATE_ACTIVITY as never);
    const res = await activityGET(makeRequest(), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 403 for private activity when user is not a trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockPrismaActivity.findUnique.mockResolvedValueOnce(PRIVATE_ACTIVITY as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    const res = await activityGET(makeRequest(), MOCK_PARAMS);
    expect(res.status).toBe(403);
  });

  it('returns activity for authenticated trip member', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION as never);
    mockPrismaActivity.findUnique.mockResolvedValueOnce(PRIVATE_ACTIVITY as never);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce({ id: 'member-1' } as never);
    // userActions: savedActivity.findFirst and activityRating.findFirst
    mockPrismaSavedActivity.findFirst.mockResolvedValueOnce(null);
    mockPrismaActivityRating.findFirst.mockResolvedValueOnce(null);
    const res = await activityGET(makeRequest(), MOCK_PARAMS);
    expect(res.status).toBe(200);
  });

  it('returns 500 on database error', async () => {
    mockPrismaActivity.findUnique.mockRejectedValueOnce(new Error('DB error'));
    const res = await activityGET(makeRequest(), MOCK_PARAMS);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/activities/[activityId] — save/unsave
// ---------------------------------------------------------------------------
describe('POST /api/activities/[activityId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await activityPOST(makeRequest(null, 'POST'), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown activity', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    mockPrismaActivity.findUnique.mockResolvedValueOnce(null);
    const res = await activityPOST(makeRequest(null, 'POST'), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('saves activity when not previously saved', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    mockPrismaActivity.findUnique.mockResolvedValueOnce(PUBLIC_ACTIVITY as never);
    mockPrismaSavedActivity.findFirst.mockResolvedValueOnce(null);
    mockPrismaSavedActivity.create.mockResolvedValueOnce({ id: 'saved-1' } as never);
    mockPrismaActivity.update.mockResolvedValueOnce(PUBLIC_ACTIVITY as never);

    const res = await activityPOST(makeRequest(null, 'POST'), MOCK_PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(true);
    expect(body.message).toMatch(/saved/i);
  });

  it('unsaves activity when already saved', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    mockPrismaActivity.findUnique.mockResolvedValueOnce(PUBLIC_ACTIVITY as never);
    mockPrismaSavedActivity.findFirst.mockResolvedValueOnce({ id: 'saved-1' } as never);
    mockPrismaSavedActivity.delete.mockResolvedValueOnce({} as never);
    mockPrismaActivity.update.mockResolvedValueOnce(PUBLIC_ACTIVITY as never);

    const res = await activityPOST(makeRequest(null, 'POST'), MOCK_PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(false);
    expect(body.message).toMatch(/unsaved/i);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/activities/[activityId] — comment or rate
// ---------------------------------------------------------------------------
describe('PUT /api/activities/[activityId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await activityPUT(
      makeRequest({ action: 'comment', text: 'Hello' }, 'PUT'),
      MOCK_PARAMS
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid action', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    const res = await activityPUT(
      makeRequest({ action: 'invalid' }, 'PUT'),
      MOCK_PARAMS
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for comment action with empty text', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    const res = await activityPUT(
      makeRequest({ action: 'comment', text: '' }, 'PUT'),
      MOCK_PARAMS
    );
    expect(res.status).toBe(400);
  });

  it('creates comment on valid comment action', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    const mockComment = { id: 'comment-1', text: 'Great activity!', user: MOCK_SESSION.user };
    mockPrismaActivityComment.create.mockResolvedValueOnce(mockComment as never);

    const res = await activityPUT(
      makeRequest({ action: 'comment', text: 'Great activity!' }, 'PUT'),
      MOCK_PARAMS
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.text).toBe('Great activity!');
  });

  it('returns 400 for rate action with out-of-range score', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    const res = await activityPUT(
      makeRequest({ action: 'rate', score: 10 }, 'PUT'),
      MOCK_PARAMS
    );
    expect(res.status).toBe(400);
  });

  it('upserts rating on valid rate action', async () => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION as never);
    const mockRating = { id: 'rating-1', score: 4, review: 'Nice!' };
    mockPrismaActivityRating.upsert.mockResolvedValueOnce(mockRating as never);

    const res = await activityPUT(
      makeRequest({ action: 'rate', score: 4, review: 'Nice!' }, 'PUT'),
      MOCK_PARAMS
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.score).toBe(4);
  });
});
