import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET, POST, PUT } from '@/app/api/activities/[activityId]/route';

// ---------------------------------------------------------------------------
// Rate-limit mock (precautionary — route may add it in future)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_ACTIVITY_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_SAVE_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const MOCK_RATING_ID = 'clh7nz5vr0004mg0hb9gkfxe4';
const MOCK_COMMENT_ID = 'clh7nz5vr0005mg0hb9gkfxe5';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, email: 'test@example.com', name: 'Test User' },
  expires: '2099-01-01',
};

const BASE_URL = `http://localhost:3000/api/activities/${MOCK_ACTIVITY_ID}`;

function makeRequest(method: string, body?: unknown): NextRequest {
  if (body !== undefined) {
    return new NextRequest(BASE_URL, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest(BASE_URL, { method });
}

const MOCK_PUBLIC_ACTIVITY = {
  id: MOCK_ACTIVITY_ID,
  tripId: MOCK_TRIP_ID,
  title: 'Test Activity',
  description: 'A test activity',
  category: 'FOOD',
  isPublic: true,
  shareCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  trip: {
    id: MOCK_TRIP_ID,
    title: 'Test Trip',
    destination: 'Paris',
    isPublic: true,
    ownerId: 'owner-id-123',
  },
  comments: [],
  ratings: [],
  _count: { savedBy: 0, comments: 0, ratings: 0 },
};

const MOCK_PRIVATE_ACTIVITY = {
  ...MOCK_PUBLIC_ACTIVITY,
  isPublic: false,
  trip: {
    ...MOCK_PUBLIC_ACTIVITY.trip,
    isPublic: false,
  },
};

const PARAMS = { params: { activityId: MOCK_ACTIVITY_ID } };

// ---------------------------------------------------------------------------
// GET /api/activities/[activityId]
// ---------------------------------------------------------------------------
describe('GET /api/activities/[activityId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when activity does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(null);

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Activity not found');
  });

  it('returns 200 for public activity without session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(MOCK_ACTIVITY_ID);
    expect(json.data.averageRating).toBeNull();
    expect(json.data.userActions).toEqual({ saved: false, rating: null });
  });

  it('returns 200 for public activity and calculates average rating', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const activityWithRatings = {
      ...MOCK_PUBLIC_ACTIVITY,
      ratings: [
        { score: 4, review: null, user: { id: 'u1', name: 'Alice', image: null } },
        { score: 2, review: 'ok', user: { id: 'u2', name: 'Bob', image: null } },
      ],
    };
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      activityWithRatings as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.averageRating).toBe(3); // (4+2)/2
  });

  it('returns 401 for private activity when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PRIVATE_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 403 for private activity when authenticated but not a member', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PRIVATE_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce(null);

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not authorized to view this activity');
  });

  it('returns 200 for private activity when authenticated and a trip member', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PRIVATE_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.tripMember.findFirst).mockResolvedValueOnce(
      { id: 'member-1', tripId: MOCK_TRIP_ID, userId: MOCK_USER_ID, role: 'MEMBER', joinedAt: new Date() } as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    // savedActivity + activityRating lookups for userActions
    vi.mocked(prisma.savedActivity.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.activityRating.findFirst).mockResolvedValueOnce(null);

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(MOCK_ACTIVITY_ID);
  });

  it('returns userActions with saved=true when user has saved the activity', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.savedActivity.findFirst).mockResolvedValueOnce(
      { id: MOCK_SAVE_ID, userId: MOCK_USER_ID, activityId: MOCK_ACTIVITY_ID } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findFirst>>
    );
    vi.mocked(prisma.activityRating.findFirst).mockResolvedValueOnce(null);

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.userActions.saved).toBe(true);
    expect(json.data.userActions.rating).toBeNull();
  });

  it('returns userActions with rating when user has rated the activity', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.savedActivity.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.activityRating.findFirst).mockResolvedValueOnce(
      { id: MOCK_RATING_ID, score: 5, activityId: MOCK_ACTIVITY_ID, userId: MOCK_USER_ID } as unknown as Awaited<ReturnType<typeof prisma.activityRating.findFirst>>
    );

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.userActions.rating).toBe(5);
  });

  it('returns 500 on unexpected database error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.activity.findUnique).mockRejectedValueOnce(new Error('DB error'));

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to fetch activity');
  });

  it('skips userActions lookup when no session (public activity)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );

    const req = makeRequest('GET');
    await GET(req, PARAMS);

    expect(prisma.savedActivity.findFirst).not.toHaveBeenCalled();
    expect(prisma.activityRating.findFirst).not.toHaveBeenCalled();
  });

  it('returns _count fields in the response data', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const activityWithCounts = {
      ...MOCK_PUBLIC_ACTIVITY,
      _count: { savedBy: 10, comments: 3, ratings: 2 },
    };
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      activityWithCounts as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );

    const req = makeRequest('GET');
    const res = await GET(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data._count.savedBy).toBe(10);
    expect(json.data._count.comments).toBe(3);
    expect(json.data._count.ratings).toBe(2);
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
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest('POST');
    const res = await POST(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 404 when activity does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(null);

    const req = makeRequest('POST');
    const res = await POST(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Activity not found');
  });

  it('saves activity when not already saved', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.savedActivity.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.savedActivity.create).mockResolvedValueOnce(
      { id: MOCK_SAVE_ID, userId: MOCK_USER_ID, activityId: MOCK_ACTIVITY_ID } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.create>>
    );
    vi.mocked(prisma.activity.update).mockResolvedValueOnce(
      { ...MOCK_PUBLIC_ACTIVITY, shareCount: 1 } as unknown as Awaited<ReturnType<typeof prisma.activity.update>>
    );

    const req = makeRequest('POST');
    const res = await POST(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.saved).toBe(true);
    expect(json.message).toBe('Activity saved');
    expect(prisma.savedActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: MOCK_USER_ID, activityId: MOCK_ACTIVITY_ID },
      })
    );
  });

  it('unsaves activity when already saved', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.savedActivity.findFirst).mockResolvedValueOnce(
      { id: MOCK_SAVE_ID, userId: MOCK_USER_ID, activityId: MOCK_ACTIVITY_ID } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findFirst>>
    );
    vi.mocked(prisma.savedActivity.delete).mockResolvedValueOnce(
      { id: MOCK_SAVE_ID } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.delete>>
    );
    vi.mocked(prisma.activity.update).mockResolvedValueOnce(
      { ...MOCK_PUBLIC_ACTIVITY, shareCount: 0 } as unknown as Awaited<ReturnType<typeof prisma.activity.update>>
    );

    const req = makeRequest('POST');
    const res = await POST(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.saved).toBe(false);
    expect(json.message).toBe('Activity unsaved');
    expect(prisma.savedActivity.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MOCK_SAVE_ID } })
    );
  });

  it('increments shareCount when saving', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.savedActivity.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.savedActivity.create).mockResolvedValueOnce(
      { id: MOCK_SAVE_ID } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.create>>
    );
    vi.mocked(prisma.activity.update).mockResolvedValueOnce(
      { ...MOCK_PUBLIC_ACTIVITY } as unknown as Awaited<ReturnType<typeof prisma.activity.update>>
    );

    const req = makeRequest('POST');
    await POST(req, PARAMS);

    expect(prisma.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { shareCount: { increment: 1 } },
      })
    );
  });

  it('decrements shareCount when unsaving', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockResolvedValueOnce(
      MOCK_PUBLIC_ACTIVITY as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>
    );
    vi.mocked(prisma.savedActivity.findFirst).mockResolvedValueOnce(
      { id: MOCK_SAVE_ID } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findFirst>>
    );
    vi.mocked(prisma.savedActivity.delete).mockResolvedValueOnce(
      { id: MOCK_SAVE_ID } as unknown as Awaited<ReturnType<typeof prisma.savedActivity.delete>>
    );
    vi.mocked(prisma.activity.update).mockResolvedValueOnce(
      { ...MOCK_PUBLIC_ACTIVITY } as unknown as Awaited<ReturnType<typeof prisma.activity.update>>
    );

    const req = makeRequest('POST');
    await POST(req, PARAMS);

    expect(prisma.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { shareCount: { decrement: 1 } },
      })
    );
  });

  it('returns 500 on database error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activity.findUnique).mockRejectedValueOnce(new Error('DB error'));

    const req = makeRequest('POST');
    const res = await POST(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to save/unsave activity');
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
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest('PUT', { action: 'comment', text: 'Great activity!' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  // --- Comment action ---
  it('creates comment successfully with valid payload', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const MOCK_COMMENT = {
      id: MOCK_COMMENT_ID,
      activityId: MOCK_ACTIVITY_ID,
      userId: MOCK_USER_ID,
      text: 'Great activity!',
      createdAt: new Date(),
      user: { id: MOCK_USER_ID, name: 'Test User', image: null },
    };
    vi.mocked(prisma.activityComment.create).mockResolvedValueOnce(
      MOCK_COMMENT as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>
    );

    const req = makeRequest('PUT', { action: 'comment', text: 'Great activity!' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(MOCK_COMMENT_ID);
    expect(json.data.text).toBe('Great activity!');
    expect(prisma.activityComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          activityId: MOCK_ACTIVITY_ID,
          userId: MOCK_USER_ID,
          text: 'Great activity!',
        },
      })
    );
  });

  it('returns 400 when comment text is empty', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', { action: 'comment', text: '' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid comment');
  });

  it('returns 400 when comment text exceeds 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', { action: 'comment', text: 'a'.repeat(501) });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid comment');
  });

  it('returns 400 when comment text is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', { action: 'comment' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid comment');
  });

  it('accepts comment text at exactly 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const longText = 'a'.repeat(500);
    const MOCK_COMMENT = {
      id: MOCK_COMMENT_ID,
      activityId: MOCK_ACTIVITY_ID,
      userId: MOCK_USER_ID,
      text: longText,
      createdAt: new Date(),
      user: { id: MOCK_USER_ID, name: 'Test User', image: null },
    };
    vi.mocked(prisma.activityComment.create).mockResolvedValueOnce(
      MOCK_COMMENT as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>
    );

    const req = makeRequest('PUT', { action: 'comment', text: longText });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  // --- Rating action ---
  it('creates or updates rating successfully with valid payload', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const MOCK_RATING = {
      id: MOCK_RATING_ID,
      activityId: MOCK_ACTIVITY_ID,
      userId: MOCK_USER_ID,
      score: 4,
      review: 'Really enjoyed it',
    };
    vi.mocked(prisma.activityRating.upsert).mockResolvedValueOnce(
      MOCK_RATING as unknown as Awaited<ReturnType<typeof prisma.activityRating.upsert>>
    );

    const req = makeRequest('PUT', { action: 'rate', score: 4, review: 'Really enjoyed it' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.score).toBe(4);
    expect(json.data.review).toBe('Really enjoyed it');
  });

  it('creates rating without optional review', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const MOCK_RATING = {
      id: MOCK_RATING_ID,
      activityId: MOCK_ACTIVITY_ID,
      userId: MOCK_USER_ID,
      score: 3,
      review: undefined,
    };
    vi.mocked(prisma.activityRating.upsert).mockResolvedValueOnce(
      MOCK_RATING as unknown as Awaited<ReturnType<typeof prisma.activityRating.upsert>>
    );

    const req = makeRequest('PUT', { action: 'rate', score: 3 });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.score).toBe(3);
  });

  it('returns 400 when score is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', { action: 'rate' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid rating');
  });

  it('returns 400 when score is below minimum (0)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', { action: 'rate', score: 0 });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid rating');
  });

  it('returns 400 when score exceeds maximum (6)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', { action: 'rate', score: 6 });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid rating');
  });

  it('accepts score at boundary minimum (1)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activityRating.upsert).mockResolvedValueOnce(
      { id: MOCK_RATING_ID, score: 1 } as unknown as Awaited<ReturnType<typeof prisma.activityRating.upsert>>
    );

    const req = makeRequest('PUT', { action: 'rate', score: 1 });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('accepts score at boundary maximum (5)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activityRating.upsert).mockResolvedValueOnce(
      { id: MOCK_RATING_ID, score: 5 } as unknown as Awaited<ReturnType<typeof prisma.activityRating.upsert>>
    );

    const req = makeRequest('PUT', { action: 'rate', score: 5 });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('calls upsert with correct where clause for rating', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activityRating.upsert).mockResolvedValueOnce(
      { id: MOCK_RATING_ID, score: 5 } as unknown as Awaited<ReturnType<typeof prisma.activityRating.upsert>>
    );

    const req = makeRequest('PUT', { action: 'rate', score: 5, review: 'Perfect!' });
    await PUT(req, PARAMS);

    expect(prisma.activityRating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          activityId_userId: {
            activityId: MOCK_ACTIVITY_ID,
            userId: MOCK_USER_ID,
          },
        },
      })
    );
  });

  // --- Invalid action ---
  it('returns 400 for unknown action', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', { action: 'delete' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid action');
  });

  it('returns 400 when no action provided', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('PUT', {});
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid action');
  });

  it('returns 500 on database error during comment creation', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activityComment.create).mockRejectedValueOnce(new Error('DB error'));

    const req = makeRequest('PUT', { action: 'comment', text: 'Great!' });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to process action');
  });

  it('returns 500 on database error during rating upsert', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.activityRating.upsert).mockRejectedValueOnce(new Error('DB error'));

    const req = makeRequest('PUT', { action: 'rate', score: 4 });
    const res = await PUT(req, PARAMS);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to process action');
  });
});
