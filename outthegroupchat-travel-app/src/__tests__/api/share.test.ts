/**
 * Unit tests for the Feed Share API route handler.
 *
 * Route: POST /api/feed/share
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked.
 * - Handlers are invoked directly with a minimal Request object.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: @/lib/prisma — extend global setup
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      trip: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      activity: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      notification: {
        create: vi.fn(),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/feed/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockSession = { user: { id: 'user-1', name: 'Tester', email: 'test@test.com' } };

const mockPublicTrip = {
  id: 'trip-1',
  title: 'Paris Trip',
  isPublic: true,
  ownerId: 'user-2',
};

const mockActivity = {
  id: 'activity-1',
  name: 'Eiffel Tower Visit',
};

// ---------------------------------------------------------------------------
// POST /api/feed/share
// ---------------------------------------------------------------------------
describe('POST /api/feed/share', () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/app/api/feed/share/route');
    POST = mod.POST;
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest({ itemId: 'trip-1', itemType: 'trip' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when itemId is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ itemType: 'trip' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid request');
  });

  it('returns 400 when itemType is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ itemId: 'trip-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when itemType is invalid', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ itemId: 'trip-1', itemType: 'post' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it('returns 400 when message exceeds 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const res = await POST(makeRequest({ itemId: 'trip-1', itemType: 'trip', message: 'x'.repeat(501) }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when trip is not found or not accessible', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ itemId: 'nonexistent', itemType: 'trip' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it('returns 200 and share URL when trip share succeeds', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(mockPublicTrip as Awaited<ReturnType<typeof prisma.trip.findFirst>>);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(mockPublicTrip as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    vi.mocked(prisma.notification.create).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.notification.create>>);

    const res = await POST(makeRequest({ itemId: 'trip-1', itemType: 'trip' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.shared).toBe(true);
    expect(json.data.shareUrl).toBe('/trips/trip-1');
  });

  it('sends a notification when sharing a trip owned by another user', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(mockPublicTrip as Awaited<ReturnType<typeof prisma.trip.findFirst>>);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(mockPublicTrip as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    vi.mocked(prisma.notification.create).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.notification.create>>);

    await POST(makeRequest({ itemId: 'trip-1', itemType: 'trip', message: 'Check this out!' }));

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-2',
          type: 'TRIP_LIKE',
        }),
      })
    );
  });

  it('does not send a notification when sharing own trip', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    const ownTrip = { ...mockPublicTrip, ownerId: 'user-1' };
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(ownTrip as Awaited<ReturnType<typeof prisma.trip.findFirst>>);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(ownTrip as Awaited<ReturnType<typeof prisma.trip.findUnique>>);

    await POST(makeRequest({ itemId: 'trip-1', itemType: 'trip' }));

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('returns 404 when activity is not found or not public', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.activity.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ itemId: 'nonexistent', itemType: 'activity' }));
    expect(res.status).toBe(404);
  });

  it('returns 200 and share URL when activity share succeeds', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.activity.findFirst).mockResolvedValue(mockActivity as Awaited<ReturnType<typeof prisma.activity.findFirst>>);

    const res = await POST(makeRequest({ itemId: 'activity-1', itemType: 'activity' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.shareUrl).toBe('/activities/activity-1');
  });

  it('returns 500 on unexpected internal error', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findFirst).mockRejectedValue(new Error('DB failure'));

    const res = await POST(makeRequest({ itemId: 'trip-1', itemType: 'trip' }));
    expect(res.status).toBe(500);
  });

  it('accepts optional message field', async () => {
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.trip.findFirst).mockResolvedValue(mockPublicTrip as Awaited<ReturnType<typeof prisma.trip.findFirst>>);
    vi.mocked(prisma.trip.findUnique).mockResolvedValue(mockPublicTrip as Awaited<ReturnType<typeof prisma.trip.findUnique>>);
    vi.mocked(prisma.notification.create).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.notification.create>>);

    const res = await POST(makeRequest({ itemId: 'trip-1', itemType: 'trip', message: 'Amazing destination!' }));
    expect(res.status).toBe(200);
  });
});
