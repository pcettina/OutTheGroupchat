/**
 * Unit tests for GET + POST /api/users/onboarding.
 *
 * Day 7 — real onboarding data layer.
 *
 * Prisma (`user`), NextAuth, logger, and sentry mocks are established in
 * src/__tests__/setup.ts. This file re-mocks @/lib/rate-limit to get a
 * controllable reference and re-arms the mock after vi.resetAllMocks() in
 * beforeEach (factory-level mockResolvedValue is wiped by resetAllMocks).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — declared before importing the route.
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Static imports — NEVER use dynamic await import in beforeEach.
import { GET, POST } from '@/app/api/users/onboarding/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegate + helpers
// ---------------------------------------------------------------------------
const mockUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCaptureException = vi.mocked(captureException);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/users/onboarding';

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeGetReq = () => new NextRequest(BASE_URL);

const makePostReq = (body?: unknown) =>
  new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** POST request with a raw (possibly malformed) string body. */
const makePostReqRaw = (raw: string) =>
  new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Re-arm rate-limit pass-through (defensive: survives clear/reset either way).
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/users/onboarding
// ===========================================================================
describe('GET /api/users/onboarding', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns onboarded=false / null when the user has no onboardedAt', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.findUnique.mockResolvedValueOnce({ onboardedAt: null });

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.onboarded).toBe(false);
    expect(body.onboardedAt).toBeNull();
  });

  it('returns onboarded=true with ISO timestamp when onboardedAt is set', async () => {
    const when = new Date('2026-07-19T12:00:00.000Z');
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.findUnique.mockResolvedValueOnce({ onboardedAt: when });

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.onboarded).toBe(true);
    expect(body.onboardedAt).toBe('2026-07-19T12:00:00.000Z');
  });

  it('returns 404 when the user row does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.findUnique.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('User not found');
  });

  it('returns 500 and calls captureException when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.findUnique.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeGetReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// POST /api/users/onboarding
// ===========================================================================
describe('POST /api/users/onboarding', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('marks the user onboarded and stamps onboardedAt (no body)', async () => {
    const when = new Date('2026-07-19T12:00:00.000Z');
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.update.mockResolvedValueOnce({ onboardedAt: when });

    const res = await POST(makePostReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.onboardedAt).toBe('2026-07-19T12:00:00.000Z');

    // Verify update keyed on the session user id, stamping a Date.
    const updateArg = mockUser.update.mock.calls[0]?.[0];
    expect(updateArg?.where).toEqual({ id: 'user-1' });
    expect(updateArg?.data?.onboardedAt).toBeInstanceOf(Date);
  });

  it('accepts an optional topicIds body without failing (topics not persisted here)', async () => {
    const when = new Date('2026-07-19T12:00:00.000Z');
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.update.mockResolvedValueOnce({ onboardedAt: when });

    const res = await POST(makePostReq({ topicIds: ['topic-a', 'topic-b'] }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // topicIds must not leak into the prisma update payload.
    const updateArg = mockUser.update.mock.calls[0]?.[0];
    expect(updateArg?.data).toEqual({ onboardedAt: expect.any(Date) });
  });

  it('is idempotent — a second call succeeds and re-stamps (overwrite semantics)', async () => {
    const first = new Date('2026-07-19T12:00:00.000Z');
    const second = new Date('2026-07-19T12:05:00.000Z');
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.update.mockResolvedValueOnce({ onboardedAt: first });

    const res1 = await POST(makePostReq());
    expect(res1.status).toBe(200);
    expect((await res1.json()).onboardedAt).toBe('2026-07-19T12:00:00.000Z');

    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.update.mockResolvedValueOnce({ onboardedAt: second });

    const res2 = await POST(makePostReq());
    expect(res2.status).toBe(200);
    expect((await res2.json()).onboardedAt).toBe('2026-07-19T12:05:00.000Z');

    expect(mockUser.update).toHaveBeenCalledTimes(2);
  });

  it('returns 400 on a malformed JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    const res = await POST(makePostReqRaw('{ not valid json'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid JSON body');
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid topicIds type (Zod)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    const res = await POST(makePostReq({ topicIds: 'not-an-array' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns 500 and calls captureException when prisma update throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockUser.update.mockRejectedValueOnce(new Error('db down'));

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to complete onboarding');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
