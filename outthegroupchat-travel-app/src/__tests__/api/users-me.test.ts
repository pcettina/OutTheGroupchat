/**
 * Unit tests for the /api/users/me route handlers.
 *
 * Routes:
 *  - GET   /api/users/me  — fetch current user's full profile
 *  - PATCH /api/users/me  — update current user's profile
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked via setup.ts.
 * - Handlers are invoked directly with a minimal Request object.
 * - Each test sets up its own mocks using mockResolvedValueOnce / mockRejectedValueOnce.
 * - vi.clearAllMocks() in beforeEach prevents state leakage between tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET, PATCH } from '@/app/api/users/me/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(): Request {
  return new Request('http://localhost/api/users/me', { method: 'GET' });
}

function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockSession = { user: { id: 'user-1', name: 'Tester', email: 'test@test.com' } };

const mockUser = {
  id: 'user-1',
  name: 'Tester',
  email: 'test@test.com',
  image: null,
  bio: 'Love to travel',
  city: 'Austin',
  phone: null,
  preferences: null,
  createdAt: new Date('2025-01-01'),
  lastActive: new Date('2025-06-01'),
  _count: {
    followers: 2,
    following: 3,
    ownedTrips: 4,
    tripMemberships: 5,
    savedActivities: 6,
  },
};

const mockTrips = [
  {
    id: 'trip-1',
    title: 'Tokyo Trip',
    destination: { city: 'Tokyo', country: 'Japan' },
    startDate: new Date('2025-09-01'),
    endDate: new Date('2025-09-15'),
    status: 'PLANNING',
  },
];

const mockSavedActivities = [
  {
    id: 'saved-1',
    userId: 'user-1',
    activityId: 'act-1',
    savedAt: new Date('2025-07-01'),
    activity: {
      id: 'act-1',
      name: 'Ramen Tour',
      category: 'FOOD',
      location: 'Tokyo',
      cost: 25,
    },
  },
];

const mockUpdatedUser = {
  id: 'user-1',
  name: 'Updated Name',
  email: 'test@test.com',
  image: null,
  bio: 'Updated bio',
  city: 'New York',
  phone: '555-1234',
  preferences: null,
};

// ---------------------------------------------------------------------------
// GET /api/users/me
// ---------------------------------------------------------------------------
describe('GET /api/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 404 when user is not found in the database', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('User not found');
  });

  it('returns 200 with full profile data on success', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      mockTrips as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce(
      mockSavedActivities as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('user-1');
    expect(json.data.name).toBe('Tester');
    expect(json.data.email).toBe('test@test.com');
  });

  it('includes _count stats in successful response', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await GET();
    const json = await res.json();
    expect(json.data._count).toMatchObject({
      followers: 2,
      following: 3,
      ownedTrips: 4,
    });
  });

  it('includes recentTrips in successful response', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce(
      mockTrips as unknown as Awaited<ReturnType<typeof prisma.trip.findMany>>
    );
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await GET();
    const json = await res.json();
    expect(json.data.recentTrips).toHaveLength(1);
    expect(json.data.recentTrips[0].title).toBe('Tokyo Trip');
  });

  it('includes savedActivities (mapped from activity) in successful response', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce(
      mockSavedActivities as unknown as Awaited<ReturnType<typeof prisma.savedActivity.findMany>>
    );

    const res = await GET();
    const json = await res.json();
    expect(json.data.savedActivities).toHaveLength(1);
    expect(json.data.savedActivities[0].name).toBe('Ramen Tour');
  });

  it('returns 500 on database error during user lookup', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to fetch profile');
  });

  it('returns 500 on database error during trip lookup', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockRejectedValueOnce(new Error('Trip query failed'));

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/me
// ---------------------------------------------------------------------------
describe('PATCH /api/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await PATCH(makePatchRequest({ name: 'New Name' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 on invalid payload (name is empty string)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const res = await PATCH(makePatchRequest({ name: '' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 on invalid payload (bio exceeds 500 chars)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const res = await PATCH(makePatchRequest({ bio: 'x'.repeat(501) }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 on invalid payload (invalid travelStyle enum)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);

    const res = await PATCH(
      makePatchRequest({ preferences: { travelStyle: 'luxury' } })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 200 with updated user on valid name update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      mockUpdatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await PATCH(makePatchRequest({ name: 'Updated Name' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Updated Name');
  });

  it('returns 200 with updated user on valid bio + city update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      mockUpdatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await PATCH(makePatchRequest({ bio: 'Updated bio', city: 'New York' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('merges preferences with existing user preferences', async () => {
    const userWithPrefs = {
      ...mockUser,
      preferences: { travelStyle: 'adventure', language: 'en' },
    };

    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      userWithPrefs as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      mockUpdatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await PATCH(
      makePatchRequest({ preferences: { travelStyle: 'cultural' } })
    );
    expect(res.status).toBe(200);
    // Verify prisma.user.update was called with merged preferences
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preferences: expect.objectContaining({
            travelStyle: 'cultural',
            language: 'en',
          }),
        }),
      })
    );
  });

  it('accepts valid travelStyle enum values', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      mockUpdatedUser as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const res = await PATCH(
      makePatchRequest({ preferences: { travelStyle: 'relaxation' } })
    );
    expect(res.status).toBe(200);
  });

  it('returns 500 on database error during findUnique', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB error'));

    const res = await PATCH(makePatchRequest({ name: 'Test' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to update profile');
  });

  it('returns 500 on database error during update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockSession);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('Update failed'));

    const res = await PATCH(makePatchRequest({ name: 'Test' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to update profile');
  });
});
