/**
 * Integration tests for /api/intents/[id] route handlers (PATCH, DELETE).
 *
 * The route only exports PATCH and DELETE. There is no GET on this endpoint
 * (mine/crew listings live at /api/intents/mine and /api/intents/crew), so
 * GET test cases are intentionally omitted per task rule 7.
 *
 * Global mocks (prisma, next-auth, sentry, logger) come from
 * src/__tests__/setup.ts. checkRateLimit is mocked locally and re-armed in
 * beforeEach after vi.resetAllMocks() (per MEMORY.md feedback note).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { PATCH, DELETE } from '@/app/api/intents/[id]/route';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
type MockFn = ReturnType<typeof vi.fn>;

const mockPrismaIntent = prisma.intent as unknown as {
  findUnique: MockFn;
  update: MockFn;
};
const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: `${id}@example.com` },
  expires: '2099-01-01',
});

const baseExisting = (over: Record<string, unknown> = {}) => ({
  userId: 'user-1',
  windowPreset: 'EVENING',
  dayOffset: 0,
  startAt: null,
  endAt: null,
  ...over,
});

const fakeIntent = (over: Record<string, unknown> = {}) => ({
  id: 'cli12345intent000000001',
  userId: 'user-1',
  topicId: 'cltopic1234567890drinks0',
  windowPreset: 'EVENING',
  startAt: null,
  endAt: null,
  dayOffset: 0,
  state: 'INTERESTED',
  cityArea: null,
  venueId: null,
  rawText: 'drinks tonight',
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  createdAt: new Date(),
  ...over,
});

const makePatchReq = (body: unknown) =>
  new NextRequest('http://localhost/api/intents/intent-xyz', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const makeDeleteReq = () =>
  new NextRequest('http://localhost/api/intents/intent-xyz', { method: 'DELETE' });

const params = { params: { id: 'intent-xyz' } };

beforeEach(() => {
  vi.resetAllMocks();
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// PATCH /api/intents/[id]
// ===========================================================================
describe('PATCH /api/intents/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await PATCH(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('400 on invalid JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH(makePatchReq('not-json'), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON body');
  });

  it('400 on empty body (Zod refine requires at least one field)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH(makePatchReq({}), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('400 on out-of-range dayOffset (>7)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    const res = await PATCH(makePatchReq({ dayOffset: 99 }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('404 when intent not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(null);
    const res = await PATCH(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Intent not found');
  });

  it('403 when caller is not the owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaIntent.findUnique.mockResolvedValueOnce(baseExisting({ userId: 'user-2' }));
    const res = await PATCH(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('200 transitions INTERESTED → COMMITTED without touching expiresAt', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(baseExisting());
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent({ state: 'COMMITTED' }));

    const res = await PATCH(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('COMMITTED');

    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.state).toBe('COMMITTED');
    expect(updateCall.data.expiresAt).toBeUndefined();
    expect(updateCall.data.startAt).toBeUndefined();
    expect(updateCall.data.endAt).toBeUndefined();
  });

  it('200 recomputes window + expiresAt when windowPreset changes', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(baseExisting());
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent({ windowPreset: 'NIGHT' }));

    const res = await PATCH(makePatchReq({ windowPreset: 'NIGHT', dayOffset: 1 }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.windowPreset).toBe('NIGHT');
    expect(updateCall.data.dayOffset).toBe(1);
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
    // Existing startAt/endAt were null (preset-derived), so they stay null
    // when no explicit override is supplied — only expiresAt recomputes.
    expect(updateCall.data.startAt).toBeNull();
    expect(updateCall.data.endAt).toBeNull();
  });

  it('200 recomputes startAt/endAt when explicit overrides supplied', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(baseExisting());
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent());

    const start = '2030-06-01T18:00:00+00:00';
    const end = '2030-06-01T22:00:00+00:00';
    const res = await PATCH(makePatchReq({ startAt: start, endAt: end }), params);
    expect(res.status).toBe(200);

    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.startAt).toBeInstanceOf(Date);
    expect(updateCall.data.endAt).toBeInstanceOf(Date);
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
  });

  it('200 updates cityArea without recomputing window', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(baseExisting());
    mockPrismaIntent.update.mockResolvedValueOnce(fakeIntent({ cityArea: 'East Village' }));

    const res = await PATCH(makePatchReq({ cityArea: 'East Village' }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cityArea).toBe('East Village');

    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.data.cityArea).toBe('East Village');
    expect(updateCall.data.expiresAt).toBeUndefined();
  });

  it('400 when explicit endAt precedes startAt (resolveIntentWindow throws)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(baseExisting());

    const start = '2030-06-01T20:00:00+00:00';
    const end = '2030-06-01T18:00:00+00:00';
    const res = await PATCH(makePatchReq({ startAt: start, endAt: end }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endAt must be after startAt/i);
  });

  it('500 on prisma update failure (captured by Sentry)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(baseExisting());
    mockPrismaIntent.update.mockRejectedValueOnce(new Error('DB exploded'));

    const res = await PATCH(makePatchReq({ state: 'COMMITTED' }), params);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to update intent');
  });
});

// ===========================================================================
// DELETE /api/intents/[id]
// ===========================================================================
describe('DELETE /api/intents/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await DELETE(makeDeleteReq(), params);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);
    const res = await DELETE(makeDeleteReq(), params);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('404 when intent not found', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce(null);
    const res = await DELETE(makeDeleteReq(), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Intent not found');
  });

  it('403 when caller is not the owner', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-2' });
    const res = await DELETE(makeDeleteReq(), params);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('200 marks intent expired by setting expiresAt ≈ now (audit, no row delete)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-1' });
    const expiredAt = new Date();
    mockPrismaIntent.update.mockResolvedValueOnce({
      id: 'intent-xyz',
      expiresAt: expiredAt,
    });

    const res = await DELETE(makeDeleteReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('intent-xyz');

    const updateCall = mockPrismaIntent.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe('intent-xyz');
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
    const drift = Math.abs(updateCall.data.expiresAt.getTime() - Date.now());
    expect(drift).toBeLessThan(5000);
  });

  it('500 on prisma update failure (captured by Sentry)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaIntent.findUnique.mockResolvedValueOnce({ userId: 'user-1' });
    mockPrismaIntent.update.mockRejectedValueOnce(new Error('DB exploded'));

    const res = await DELETE(makeDeleteReq(), params);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to expire intent');
  });
});
