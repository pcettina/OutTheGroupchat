/**
 * Unit tests for the Profile API route handlers.
 *
 * Route: /api/profile  (GET, PUT)
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts.  This file extends those mocks with the
 *   additional prisma.user.update method the PUT handler requires.
 * - The GET and PUT handlers receive a NextRequest argument.
 * - The route returns plain-text responses (not JSON) for error conditions
 *   (401, 404, 500), so those are read with res.text() rather than res.json().
 * - Successful responses return JSON via NextResponse.json().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Extend the global prisma mock with prisma.user.update, which the PUT
// handler calls but the setup.ts stub does not include.
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Import handlers after the mock declaration.
import { GET, PUT } from '@/app/api/profile/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-profile-333';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Profile Tester',
    email: 'profile@example.com',
  },
  expires: '2099-01-01',
};

/** A minimal user row as returned by prisma.user.findUnique with the profile select. */
const MOCK_USER_PROFILE = {
  id: MOCK_USER_ID,
  name: 'Profile Tester',
  email: 'profile@example.com',
  city: 'New York',
  bio: 'Travel enthusiast',
  preferences: { currency: 'USD' },
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

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/profile
// ===========================================================================
describe('GET /api/profile', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('/api/profile');
    const res = await GET(req);
    // The GET handler returns plain text for 401, not JSON
    expect(res.status).toBe(401);
    expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
  });

  it('returns the user profile as JSON when authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(MOCK_USER_PROFILE);

    const req = makeRequest('/api/profile');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(MOCK_USER_ID);
    expect(body.name).toBe('Profile Tester');
    expect(body.email).toBe('profile@example.com');
    expect(body.bio).toBe('Travel enthusiast');
  });

  it('queries Prisma with the session user id', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(MOCK_USER_PROFILE);

    const req = makeRequest('/api/profile');
    await GET(req);

    const callArgs = mockPrismaUser.findUnique.mock.calls[0][0];
    expect(callArgs.where.id).toBe(MOCK_USER_ID);
  });

  it('returns 404 when the user record does not exist in the database', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest('/api/profile');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns 500 when Prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('DB error'));

    const req = makeRequest('/api/profile');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// PUT /api/profile
// ===========================================================================
describe('PUT /api/profile', () => {
  const VALID_BODY = {
    name: 'Updated Name',
    city: 'Los Angeles',
    bio: 'Updated bio',
    preferences: { currency: 'EUR' },
  };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest('/api/profile', { method: 'PUT', body: VALID_BODY });
    const res = await PUT(req);

    expect(res.status).toBe(401);
    expect(mockPrismaUser.update).not.toHaveBeenCalled();
  });

  it('updates the user profile and returns the updated record as JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    const updatedProfile = { ...MOCK_USER_PROFILE, name: 'Updated Name', city: 'Los Angeles' };
    mockPrismaUser.update.mockResolvedValueOnce(updatedProfile);

    const req = makeRequest('/api/profile', { method: 'PUT', body: VALID_BODY });
    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.name).toBe('Updated Name');
    expect(body.city).toBe('Los Angeles');
    expect(mockPrismaUser.update).toHaveBeenCalledOnce();
  });

  it('passes the session user id as the where clause for update', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.update.mockResolvedValueOnce(MOCK_USER_PROFILE);

    const req = makeRequest('/api/profile', { method: 'PUT', body: VALID_BODY });
    await PUT(req);

    const callArgs = mockPrismaUser.update.mock.calls[0][0];
    expect(callArgs.where.id).toBe(MOCK_USER_ID);
  });

  it('passes the request body fields to the update data', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.update.mockResolvedValueOnce(MOCK_USER_PROFILE);

    const req = makeRequest('/api/profile', { method: 'PUT', body: VALID_BODY });
    await PUT(req);

    const callArgs = mockPrismaUser.update.mock.calls[0][0];
    expect(callArgs.data.name).toBe(VALID_BODY.name);
    expect(callArgs.data.city).toBe(VALID_BODY.city);
    expect(callArgs.data.bio).toBe(VALID_BODY.bio);
  });

  it('returns 500 when Prisma throws during update', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaUser.update.mockRejectedValueOnce(new Error('DB error'));

    const req = makeRequest('/api/profile', { method: 'PUT', body: VALID_BODY });
    const res = await PUT(req);

    expect(res.status).toBe(500);
  });
});
