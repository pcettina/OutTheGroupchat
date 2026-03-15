/**
 * Unit tests for the Feed Share API route handler.
 *
 * Route: POST /api/feed/share
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked.
 * - The handler is called directly with minimal Request objects.
 * - Tests cover: auth guard, Zod validation, trip sharing, activity sharing,
 *   visibility/access control, and owner notification creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      trip: {
        findUnique: vi.fn(),
      },
      activity: {
        findUnique: vi.fn(),
      },
      tripMember: {
        findUnique: vi.fn(),
      },
      notification: {
        create: vi.fn(),
      },
    },
  };
});

import { POST } from '@/app/api/feed/share/route';

const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaTrip = vi.mocked(prisma.trip);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaTripMember = vi.mocked(prisma.tripMember);
const mockPrismaNotification = vi.mocked(prisma.notification);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-share-001';
const MOCK_OWNER_ID = 'user-share-owner';
const MOCK_TRIP_ID = 'trip-share-111';
const MOCK_ACTIVITY_ID = 'activity-share-222';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Share Tester', email: 'share@example.com' },
  expires: '2099-01-01',
};

const MOCK_PUBLIC_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Nashville Weekend',
  ownerId: MOCK_OWNER_ID,
  isPublic: true,
  status: 'PLANNING',
};

const MOCK_PRIVATE_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Private Getaway',
  ownerId: MOCK_OWNER_ID,
  isPublic: false,
  status: 'PLANNING',
};

const MOCK_PUBLIC_ACTIVITY = {
  id: MOCK_ACTIVITY_ID,
  name: 'Broadway Bar Crawl',
  isPublic: true,
  trip: { id: MOCK_TRIP_ID, title: 'Nashville Weekend', ownerId: MOCK_OWNER_ID },
};

const MOCK_PRIVATE_ACTIVITY = {
  id: MOCK_ACTIVITY_ID,
  name: 'Secret Dinner',
  isPublic: false,
  trip: { id: MOCK_TRIP_ID, title: 'Private Getaway', ownerId: MOCK_OWNER_ID },
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/feed/share', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockPrismaNotification.create.mockResolvedValue({} as never);
});

// ===========================================================================
// Auth guard
// ===========================================================================
describe('POST /api/feed/share — auth guard', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// Input validation
// ===========================================================================
describe('POST /api/feed/share — input validation', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns 400 when itemId is missing', async () => {
    const res = await POST(makeRequest({ itemType: 'trip' }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is invalid', async () => {
    const res = await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'user' }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });

  it('returns 400 when message exceeds 500 characters', async () => {
    const res = await POST(makeRequest({
      itemId: MOCK_TRIP_ID,
      itemType: 'trip',
      message: 'x'.repeat(501),
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid request');
  });
});

// ===========================================================================
// Trip sharing
// ===========================================================================
describe('POST /api/feed/share — trip sharing', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns 404 when trip does not exist', async () => {
    mockPrismaTrip.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Trip not found');
  });

  it('returns 200 and correct shareUrl for a public trip', async () => {
    mockPrismaTrip.findUnique.mockResolvedValue(MOCK_PUBLIC_TRIP as never);

    const res = await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.shareUrl).toBe(`/trips/${MOCK_TRIP_ID}`);
    expect(body.itemType).toBe('trip');
    expect(body.itemId).toBe(MOCK_TRIP_ID);
  });

  it('creates a notification to the owner when sharer is not the owner', async () => {
    mockPrismaTrip.findUnique.mockResolvedValue(MOCK_PUBLIC_TRIP as never);

    await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));

    expect(mockPrismaNotification.create).toHaveBeenCalledOnce();
    expect(mockPrismaNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: MOCK_OWNER_ID,
          type: 'TRIP_UPDATE',
          title: 'Someone shared your trip',
        }),
      })
    );
  });

  it('does NOT create a notification when the owner shares their own trip', async () => {
    const ownSession = {
      user: { id: MOCK_OWNER_ID, name: 'Owner', email: 'owner@example.com' },
      expires: '2099-01-01',
    };
    mockGetServerSession.mockResolvedValue(ownSession);
    mockPrismaTrip.findUnique.mockResolvedValue(MOCK_PUBLIC_TRIP as never);

    await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));

    expect(mockPrismaNotification.create).not.toHaveBeenCalled();
  });

  it('returns 403 for a private trip when user is not a member', async () => {
    mockPrismaTrip.findUnique.mockResolvedValue(MOCK_PRIVATE_TRIP as never);
    mockPrismaTripMember.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 for a private trip when user is a member', async () => {
    mockPrismaTrip.findUnique.mockResolvedValue(MOCK_PRIVATE_TRIP as never);
    mockPrismaTripMember.findUnique.mockResolvedValue({ id: 'member-1' } as never);

    const res = await POST(makeRequest({ itemId: MOCK_TRIP_ID, itemType: 'trip' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('accepts optional platform and message fields', async () => {
    mockPrismaTrip.findUnique.mockResolvedValue(MOCK_PUBLIC_TRIP as never);

    const res = await POST(makeRequest({
      itemId: MOCK_TRIP_ID,
      itemType: 'trip',
      platform: 'native',
      message: 'Check this out!',
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.platform).toBe('native');
    expect(body.message).toBe('Check this out!');
  });
});

// ===========================================================================
// Activity sharing
// ===========================================================================
describe('POST /api/feed/share — activity sharing', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(MOCK_SESSION);
  });

  it('returns 404 when activity does not exist', async () => {
    mockPrismaActivity.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Activity not found');
  });

  it('returns 200 and correct shareUrl for a public activity', async () => {
    mockPrismaActivity.findUnique.mockResolvedValue(MOCK_PUBLIC_ACTIVITY as never);

    const res = await POST(makeRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.shareUrl).toBe(`/trips/${MOCK_TRIP_ID}?activity=${MOCK_ACTIVITY_ID}`);
    expect(body.itemType).toBe('activity');
  });

  it('returns 403 for a private activity when user is not a member', async () => {
    mockPrismaActivity.findUnique.mockResolvedValue(MOCK_PRIVATE_ACTIVITY as never);
    mockPrismaTripMember.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 for a private activity when user is a member of the trip', async () => {
    mockPrismaActivity.findUnique.mockResolvedValue(MOCK_PRIVATE_ACTIVITY as never);
    mockPrismaTripMember.findUnique.mockResolvedValue({ id: 'member-1' } as never);

    const res = await POST(makeRequest({ itemId: MOCK_ACTIVITY_ID, itemType: 'activity' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
