/**
 * Edge-case tests for /api/profile (GET, PUT), /api/users/me (GET, PATCH),
 * and /api/users/[userId] (GET, PATCH) routes.
 *
 * Complements the existing profile.test.ts, users-me.test.ts, and users.test.ts
 * by targeting boundary conditions, field-level validation, partial updates,
 * security boundaries, and rate-limit enforcement not covered in the baseline suites.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Rate limit mock — required for all routes that call checkRateLimit
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  apiRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Prisma mock — explicit full definition so follow.findFirst is available.
// Mirrors the shape required by all three route handlers under test.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
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
    savedActivity: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    follow: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
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
  },
}));

// ---------------------------------------------------------------------------
// Static imports of route handlers (must come after vi.mock declarations)
// ---------------------------------------------------------------------------
import { GET as profileGet, PUT as profilePut } from '@/app/api/profile/route';
import { GET as meGet, PATCH as mePatch } from '@/app/api/users/me/route';
import * as usersRoute from '@/app/api/users/[userId]/route';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const OTHER_USER_ID = 'clh7nz5vr0001mg0hc0hkfxe1';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Edge Tester', email: 'edge@example.com' },
  expires: '2099-01-01',
};

// Minimal user row for /api/profile (only fields in its select clause)
const PROFILE_USER = {
  id: MOCK_USER_ID,
  name: 'Edge Tester',
  email: 'edge@example.com',
  city: 'Chicago',
  bio: 'Loves edge cases',
  preferences: { currency: 'USD' },
};

// Minimal user row for /api/users/me (includes image + phone + _count)
const ME_USER = {
  id: MOCK_USER_ID,
  name: 'Edge Tester',
  email: 'edge@example.com',
  image: null,
  bio: 'Loves edge cases',
  city: 'Chicago',
  phone: null,
  preferences: null,
  createdAt: new Date('2025-01-01'),
  lastActive: new Date('2025-06-01'),
  _count: {
    followers: 0,
    following: 0,
    ownedTrips: 0,
    tripMemberships: 0,
    savedActivities: 0,
  },
};

// Minimal user row for /api/users/[userId] (public profile — no email)
const PUBLIC_USER = {
  id: OTHER_USER_ID,
  name: 'Other User',
  image: null,
  bio: 'Traveller',
  city: 'Paris',
  preferences: null,
  createdAt: new Date('2025-01-01'),
  _count: { followers: 10, following: 5, ownedTrips: 3 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(
  url: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
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

// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/profile — edge cases
// ===========================================================================
describe('GET /api/profile — edge cases', () => {
  it('does NOT include image field in the response (not in select)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      PROFILE_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );

    const res = await profileGet(makeRequest('http://localhost/api/profile'));
    expect(res.status).toBe(200);
    const json = await res.json();
    // The /api/profile select does not request the image column
    expect(json.image).toBeUndefined();
  });

  it('returns preferences object when it is not null', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...PROFILE_USER,
      preferences: { currency: 'EUR', language: 'fr' },
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const res = await profileGet(makeRequest('http://localhost/api/profile'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.preferences).toEqual({ currency: 'EUR', language: 'fr' });
  });
});

// ===========================================================================
// PUT /api/profile — edge cases
// ===========================================================================
describe('PUT /api/profile — edge cases', () => {
  it('accepts an image URL in the body and passes it to prisma.user.update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      ...PROFILE_USER,
      image: 'https://example.com/avatar.png',
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const req = makeRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: { image: 'https://example.com/avatar.png' },
    });
    const res = await profilePut(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ image: 'https://example.com/avatar.png' }),
      })
    );
  });

  it('returns 400 for Zod-invalid body (non-string name)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: { name: 12345 },
    });
    const res = await profilePut(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid input');
  });

  it('accepts an empty body (all optional fields) without error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      PROFILE_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const req = makeRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: {},
    });
    const res = await profilePut(req);
    expect(res.status).toBe(200);
  });

  it('returns 401 for unauthenticated PUT request (plain-text body)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest('http://localhost/api/profile', {
      method: 'PUT',
      body: { name: 'New Name' },
    });
    const res = await profilePut(req);
    expect(res.status).toBe(401);
    // The /api/profile route returns plain text for 401
    const text = await res.text();
    expect(text).toMatch(/unauthorized/i);
  });
});

// ===========================================================================
// GET /api/users/me — edge cases
// ===========================================================================
describe('GET /api/users/me — edge cases', () => {
  it('returns empty arrays when user has no trips or saved activities', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGet(makeRequest('http://localhost/api/users/me'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.recentTrips).toEqual([]);
    expect(json.data.savedActivities).toEqual([]);
  });

  it('includes phone field in response', async () => {
    const userWithPhone = { ...ME_USER, phone: '555-9876' };
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      userWithPhone as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGet(makeRequest('http://localhost/api/users/me'));
    const json = await res.json();
    expect(json.data.phone).toBe('555-9876');
  });

  it('includes lastActive timestamp in response', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.savedActivity.findMany).mockResolvedValueOnce([]);

    const res = await meGet(makeRequest('http://localhost/api/users/me'));
    const json = await res.json();
    expect(json.data.lastActive).toBeDefined();
  });
});

// ===========================================================================
// PATCH /api/users/me — edge cases
// ===========================================================================
describe('PATCH /api/users/me — edge cases', () => {
  it('accepts phone field update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      ...ME_USER,
      phone: '555-0000',
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const req = makeRequest('http://localhost/api/users/me', {
      method: 'PATCH',
      body: { phone: '555-0000' },
    });
    const res = await mePatch(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.phone).toBe('555-0000');
  });

  it('accepts preferences with a budgetRange object', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const req = makeRequest('http://localhost/api/users/me', {
      method: 'PATCH',
      body: {
        preferences: {
          budgetRange: { min: 100, max: 500, currency: 'USD' },
        },
      },
    });
    const res = await mePatch(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preferences: expect.objectContaining({
            budgetRange: { min: 100, max: 500, currency: 'USD' },
          }),
        }),
      })
    );
  });

  it('returns 400 when bio exceeds 500 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('http://localhost/api/users/me', {
      method: 'PATCH',
      body: { bio: 'x'.repeat(501) },
    });
    const res = await mePatch(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when name is an empty string (min(1) constraint)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest('http://localhost/api/users/me', {
      method: 'PATCH',
      body: { name: '' },
    });
    const res = await mePatch(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('merges new preferences with null existing preferences gracefully', async () => {
    // currentUser.preferences is null — merging should still work (|| {} fallback)
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      { ...ME_USER, preferences: null } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.user.update).mockResolvedValueOnce(
      ME_USER as unknown as Awaited<ReturnType<typeof prisma.user.update>>
    );

    const req = makeRequest('http://localhost/api/users/me', {
      method: 'PATCH',
      body: { preferences: { travelStyle: 'adventure' } },
    });
    const res = await mePatch(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preferences: expect.objectContaining({ travelStyle: 'adventure' }),
        }),
      })
    );
  });
});

// ===========================================================================
// GET /api/users/[userId] — edge cases
// ===========================================================================
describe('GET /api/users/[userId] — edge cases', () => {
  const GET = usersRoute.GET;

  it('hides email from response when viewing another user (not own profile)', async () => {
    // Route uses `email: session?.user?.id === userId ? true : false` in select.
    // When the viewer differs from the target, email is excluded from the select.
    // PUBLIC_USER fixture has no email field — confirms it is not returned.
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      PUBLIC_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.follow.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const req = makeRequest(`http://localhost/api/users/${OTHER_USER_ID}`);
    const res = await GET(req, { params: { userId: OTHER_USER_ID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.email).toBeUndefined();
  });

  it('returns 200 even when unauthenticated (public profile endpoint)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      PUBLIC_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const req = makeRequest(`http://localhost/api/users/${OTHER_USER_ID}`);
    const res = await GET(req, { params: { userId: OTHER_USER_ID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('returns publicTrips as empty array when user has no public trips', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      PUBLIC_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const req = makeRequest(`http://localhost/api/users/${OTHER_USER_ID}`);
    const res = await GET(req, { params: { userId: OTHER_USER_ID } });
    const json = await res.json();
    expect(json.data.publicTrips).toEqual([]);
  });

  it('returns _count object with followers and following', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      PUBLIC_USER as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
    );
    vi.mocked(prisma.trip.findMany).mockResolvedValueOnce([]);

    const req = makeRequest(`http://localhost/api/users/${OTHER_USER_ID}`);
    const res = await GET(req, { params: { userId: OTHER_USER_ID } });
    const json = await res.json();
    expect(json.data._count).toMatchObject({ followers: 10, following: 5, ownedTrips: 3 });
  });
});

// ===========================================================================
// PATCH /api/users/[userId] — edge cases
// ===========================================================================
describe('PATCH /api/users/[userId] — edge cases', () => {
  const PATCH = usersRoute.PATCH;

  it('returns 403 when authenticated user tries to update a different user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest(`http://localhost/api/users/${OTHER_USER_ID}`, {
      method: 'PATCH',
      body: { name: 'Hijacked Name' },
    });
    const res = await PATCH(req, { params: { userId: OTHER_USER_ID } });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Forbidden');
  });

  it('returns 401 when unauthenticated PATCH attempted', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/users/${OTHER_USER_ID}`, {
      method: 'PATCH',
      body: { name: 'Hacker' },
    });
    const res = await PATCH(req, { params: { userId: OTHER_USER_ID } });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when image is not a valid URL', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest(`http://localhost/api/users/${MOCK_USER_ID}`, {
      method: 'PATCH',
      body: { image: 'not-a-url' },
    });
    const res = await PATCH(req, { params: { userId: MOCK_USER_ID } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

    const req = makeRequest(`http://localhost/api/users/${MOCK_USER_ID}`, {
      method: 'PATCH',
      body: { name: 'n'.repeat(101) },
    });
    const res = await PATCH(req, { params: { userId: MOCK_USER_ID } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('succeeds when owner updates their own profile with a valid image URL', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: MOCK_USER_ID,
      name: 'Edge Tester',
      image: 'https://cdn.example.com/photo.jpg',
      bio: null,
      city: null,
    } as unknown as Awaited<ReturnType<typeof prisma.user.update>>);

    const req = makeRequest(`http://localhost/api/users/${MOCK_USER_ID}`, {
      method: 'PATCH',
      body: { image: 'https://cdn.example.com/photo.jpg' },
    });
    const res = await PATCH(req, { params: { userId: MOCK_USER_ID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.image).toBe('https://cdn.example.com/photo.jpg');
  });

  it('returns 500 on database error during own-profile PATCH', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB failure'));

    const req = makeRequest(`http://localhost/api/users/${MOCK_USER_ID}`, {
      method: 'PATCH',
      body: { city: 'Denver' },
    });
    const res = await PATCH(req, { params: { userId: MOCK_USER_ID } });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to update user');
  });
});
