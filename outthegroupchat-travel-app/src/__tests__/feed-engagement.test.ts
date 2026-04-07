import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET, POST } from '@/app/api/feed/engagement/route';

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
}));

const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OWNER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_ACTIVITY_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_TRIP_ID = 'clh7nz5vr0003mg0hb9gkfxe3';

const BASE_URL = 'http://localhost:3000/api/feed/engagement';

function makeSession(userId = MOCK_USER_ID, name = 'Test User') {
  return { user: { id: userId, name, email: 'test@example.com' } };
}

function makeGetRequest(params: Record<string, string>) {
  const url = new URL(BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

function makePostRequest(body: unknown) {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST — auth guard
// ---------------------------------------------------------------------------
describe('POST /api/feed/engagement — auth', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const res = await POST(makePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// POST — Zod validation errors
// ---------------------------------------------------------------------------
describe('POST /api/feed/engagement — Zod validation', () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
  });

  it('returns 400 when itemId is missing', async () => {
    const res = await POST(makePostRequest({ itemType: 'activity', action: 'like' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it('returns 400 when itemType is invalid', async () => {
    const res = await POST(makePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'invalid', action: 'like' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when action is invalid', async () => {
    const res = await POST(makePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'vote' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when body is empty object', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });
});

// ---------------------------------------------------------------------------
// POST — activity like
// ---------------------------------------------------------------------------
describe('POST /api/feed/engagement — activity like', () => {
  it('returns 200 with likeCount when liking an activity', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.savedActivity.upsert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);

    const res = await POST(makePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.action).toBe('like');
    expect(json.itemType).toBe('activity');
    expect(json.itemId).toBe(MOCK_ACTIVITY_ID);
    expect(json.likeCount).toBe(5);
  });

  it('returns 200 with updated likeCount when unliking an activity', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.savedActivity.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);

    const res = await POST(makePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'unlike' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.action).toBe('unlike');
    expect(json.likeCount).toBe(3);
  });

  it('returns likeCount of 0 when no likes remain after unlike', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.savedActivity.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const res = await POST(makePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'unlike' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.likeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST — trip like
// ---------------------------------------------------------------------------
describe('POST /api/feed/engagement — trip like', () => {
  it('returns 404 when trip does not exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await POST(makePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Trip not found');
  });

  it('returns 200 with likeCount when liking a trip owned by someone else (creates notification)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession(MOCK_USER_ID, 'Alice'));
    vi.mocked(prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OWNER_ID,
      title: 'Paris Adventure',
    });
    vi.mocked(prisma.tripLike.upsert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    vi.mocked(prisma.notification.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(10);

    const res = await POST(makePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.action).toBe('like');
    expect(json.itemType).toBe('trip');
    expect(json.itemId).toBe(MOCK_TRIP_ID);
    expect(json.likeCount).toBe(10);
    expect(vi.mocked(prisma.notification.create)).toHaveBeenCalledOnce();
  });

  it('does NOT create notification when user likes their own trip', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession(MOCK_USER_ID));
    vi.mocked(prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_USER_ID, // same as session user
      title: 'My Own Trip',
    });
    vi.mocked(prisma.tripLike.upsert as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

    const res = await POST(makePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'like' }));
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.notification.create)).not.toHaveBeenCalled();
  });

  it('returns 200 when unliking a trip', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OWNER_ID,
      title: 'Paris Adventure',
    });
    vi.mocked(prisma.tripLike.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(9);

    const res = await POST(makePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'unlike' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe('unlike');
    expect(json.likeCount).toBe(9);
    expect(vi.mocked(prisma.notification.create)).not.toHaveBeenCalled();
  });

  it('returns 200 with likeCount 0 after last unlike on a trip', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MOCK_TRIP_ID,
      ownerId: MOCK_OWNER_ID,
      title: 'Empty Trip',
    });
    vi.mocked(prisma.tripLike.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const res = await POST(makePostRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip', action: 'unlike' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.likeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST — 500 error path
// ---------------------------------------------------------------------------
describe('POST /api/feed/engagement — server errors', () => {
  it('returns 500 when prisma throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.savedActivity.upsert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('DB connection failed')
    );

    const res = await POST(makePostRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity', action: 'like' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to update engagement');
  });
});

// ---------------------------------------------------------------------------
// GET — Zod validation
// ---------------------------------------------------------------------------
describe('GET /api/feed/engagement — Zod validation', () => {
  it('returns 400 when itemId is missing', async () => {
    const res = await GET(makeGetRequest({ itemType: 'activity' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it('returns 400 with "Invalid item type" when itemType is invalid enum value', async () => {
    const res = await GET(makeGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'restaurant' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid item type');
  });

  it('returns 400 when both itemId and itemType are missing', async () => {
    const res = await GET(makeGetRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Array.isArray(json.issues)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET — activity engagement stats (authenticated)
// ---------------------------------------------------------------------------
describe('GET /api/feed/engagement — activity stats (authenticated)', () => {
  it('returns 200 with correct shape and isLiked=true for authenticated user who liked', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    // Promise.all: [likeCount, commentCount, savedActivity.findUnique]
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(7);
    vi.mocked(prisma.activityComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);
    vi.mocked(prisma.savedActivity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      activityId: MOCK_ACTIVITY_ID,
    });

    const res = await GET(makeGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.itemId).toBe(MOCK_ACTIVITY_ID);
    expect(json.itemType).toBe('activity');
    expect(json.likeCount).toBe(7);
    expect(json.commentCount).toBe(2);
    expect(json.isLiked).toBe(true);
  });

  it('returns 200 with isLiked=false when authenticated user has not liked', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);
    vi.mocked(prisma.activityComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    vi.mocked(prisma.savedActivity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isLiked).toBe(false);
    expect(json.likeCount).toBe(3);
    expect(json.commentCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET — activity engagement stats (unauthenticated)
// ---------------------------------------------------------------------------
describe('GET /api/feed/engagement — activity stats (unauthenticated)', () => {
  it('returns 200 with isLiked=false when no session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(4);
    vi.mocked(prisma.activityComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

    const res = await GET(makeGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.isLiked).toBe(false);
    expect(json.likeCount).toBe(4);
    expect(json.commentCount).toBe(1);
    // findUnique should NOT have been called since there's no session user
    expect(vi.mocked(prisma.savedActivity.findUnique)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET — trip engagement stats (authenticated)
// ---------------------------------------------------------------------------
describe('GET /api/feed/engagement — trip stats (authenticated)', () => {
  it('returns 200 with correct shape and isLiked=true for authenticated user who liked', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(15);
    vi.mocked(prisma.tripComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(6);
    vi.mocked(prisma.tripLike.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: MOCK_USER_ID,
      tripId: MOCK_TRIP_ID,
    });

    const res = await GET(makeGetRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.itemId).toBe(MOCK_TRIP_ID);
    expect(json.itemType).toBe('trip');
    expect(json.likeCount).toBe(15);
    expect(json.commentCount).toBe(6);
    expect(json.isLiked).toBe(true);
  });

  it('returns 200 with isLiked=false when user has not liked the trip', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(8);
    vi.mocked(prisma.tripComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);
    vi.mocked(prisma.tripLike.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await GET(makeGetRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isLiked).toBe(false);
    expect(json.likeCount).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// GET — trip engagement stats (unauthenticated)
// ---------------------------------------------------------------------------
describe('GET /api/feed/engagement — trip stats (unauthenticated)', () => {
  it('returns 200 with isLiked=false and does not call findUnique when no session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);
    vi.mocked(prisma.tripComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const res = await GET(makeGetRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isLiked).toBe(false);
    expect(json.likeCount).toBe(2);
    expect(json.commentCount).toBe(0);
    expect(vi.mocked(prisma.tripLike.findUnique)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET — edge cases (zero counts)
// ---------------------------------------------------------------------------
describe('GET /api/feed/engagement — edge cases', () => {
  it('returns likeCount=0 and commentCount=0 for an activity with no engagement', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    vi.mocked(prisma.activityComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const res = await GET(makeGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.likeCount).toBe(0);
    expect(json.commentCount).toBe(0);
    expect(json.isLiked).toBe(false);
  });

  it('returns likeCount=0 and commentCount=0 for a trip with no engagement', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.tripLike.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
    vi.mocked(prisma.tripComment.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);

    const res = await GET(makeGetRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.likeCount).toBe(0);
    expect(json.commentCount).toBe(0);
    expect(json.isLiked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET — 500 error path
// ---------------------------------------------------------------------------
describe('GET /api/feed/engagement — server errors', () => {
  it('returns 500 when prisma throws during GET', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(makeSession());
    vi.mocked(prisma.savedActivity.count as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('DB unavailable')
    );

    const res = await GET(makeGetRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to get engagement');
  });
});
