/**
 * Unit tests for GET + PATCH /api/users/notification-preferences.
 *
 * V1 Phase 5 — notification preferences.
 *
 * Prisma, NextAuth, logger, sentry, and rate-limit mocks are established in
 * src/__tests__/setup.ts. This file re-mocks @/lib/rate-limit to get a
 * controllable reference and re-arms the mock after vi.resetAllMocks() in
 * beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { NotificationPreferenceTrigger } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mock for @/lib/rate-limit — must be declared before any
// imports that transitively pull the module.
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
import { GET, PATCH } from '@/app/api/users/notification-preferences/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegate + helpers
// ---------------------------------------------------------------------------
const mockPrismaNotifPref = prisma.notificationPreference as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCaptureException = vi.mocked(captureException);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/users/notification-preferences';

const sessionFor = (id = 'user-1', name = 'Alice') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

const makeGetReq = () => new NextRequest(BASE_URL);

const makePatchReq = (body: unknown) =>
  new NextRequest(BASE_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** PATCH request with a raw (possibly malformed) string body. */
const makePatchReqRaw = (raw: string) =>
  new NextRequest(BASE_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });

/** Minimal stored preference row returned from prisma. */
const fakeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'np-1',
  userId: 'user-1',
  trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
  enabled: true,
  schedule: null,
  perMemberTargets: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const RL_PASS = { success: true, limit: 100, remaining: 99, reset: 0 };
const RL_FAIL = { success: false, limit: 100, remaining: 0, reset: 0 };

// ---------------------------------------------------------------------------
// beforeEach — reset and re-arm permanent mocks
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();

  // Re-arm rate-limit pass-through after resetAllMocks wipes mockResolvedValue.
  mockCheckRateLimit.mockResolvedValue(RL_PASS);
});

// ===========================================================================
// GET /api/users/notification-preferences
// ===========================================================================
describe('GET /api/users/notification-preferences', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns all 3 triggers as opted-out defaults when no rows exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaNotifPref.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.preferences).toHaveLength(3);

    const triggers = body.data.preferences.map(
      (p: { trigger: string }) => p.trigger
    );
    expect(triggers).toEqual([
      NotificationPreferenceTrigger.DAILY_PROMPT,
      NotificationPreferenceTrigger.PER_MEMBER_INTENT,
      NotificationPreferenceTrigger.GROUP_FORMATION,
    ]);

    // Every default is opted out.
    for (const pref of body.data.preferences) {
      expect(pref.enabled).toBe(false);
      expect(pref.schedule).toBeNull();
      expect(pref.perMemberTargets).toEqual([]);
    }
  });

  it('merges existing stored rows over defaults', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaNotifPref.findMany.mockResolvedValueOnce([
      fakeRow({
        trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
        enabled: true,
        schedule: '09:00',
        perMemberTargets: [],
      }),
      fakeRow({
        trigger: NotificationPreferenceTrigger.PER_MEMBER_INTENT,
        enabled: true,
        schedule: null,
        perMemberTargets: ['user-2', 'user-3'],
      }),
    ]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.preferences).toHaveLength(3);

    const byTrigger = Object.fromEntries(
      body.data.preferences.map((p: { trigger: string }) => [p.trigger, p])
    );

    // DAILY_PROMPT comes from a stored row.
    expect(byTrigger[NotificationPreferenceTrigger.DAILY_PROMPT].enabled).toBe(true);
    expect(byTrigger[NotificationPreferenceTrigger.DAILY_PROMPT].schedule).toBe('09:00');

    // PER_MEMBER_INTENT comes from a stored row with targets.
    expect(byTrigger[NotificationPreferenceTrigger.PER_MEMBER_INTENT].enabled).toBe(true);
    expect(
      byTrigger[NotificationPreferenceTrigger.PER_MEMBER_INTENT].perMemberTargets
    ).toEqual(['user-2', 'user-3']);

    // GROUP_FORMATION has no stored row — falls back to opted-out default.
    expect(byTrigger[NotificationPreferenceTrigger.GROUP_FORMATION].enabled).toBe(false);
  });

  it('queries only the caller user ID in the prisma where clause', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-42'));
    mockPrismaNotifPref.findMany.mockResolvedValueOnce([]);

    await GET(makeGetReq());

    const whereArg = mockPrismaNotifPref.findMany.mock.calls[0]?.[0]?.where;
    expect(whereArg?.userId).toBe('user-42');
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns 500 and calls captureException when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaNotifPref.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeGetReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to list notification preferences');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// PATCH /api/users/notification-preferences
// ===========================================================================
describe('PATCH /api/users/notification-preferences', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchReq({ trigger: 'DAILY_PROMPT', enabled: true })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 on invalid JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await PATCH(makePatchReqRaw('{ not valid json'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 400 on an invalid trigger enum value (Zod)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await PATCH(
      makePatchReq({ trigger: 'NOT_A_REAL_TRIGGER', enabled: true })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 on a malformed schedule format (e.g. "25:00")', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await PATCH(
      makePatchReq({
        trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
        enabled: true,
        schedule: '25:00',
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when enabled is missing (required field)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await PATCH(
      makePatchReq({ trigger: NotificationPreferenceTrigger.DAILY_PROMPT })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('upserts DAILY_PROMPT with a schedule and returns 200', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaNotifPref.upsert.mockResolvedValueOnce(
      fakeRow({
        trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
        enabled: true,
        schedule: '08:30',
        perMemberTargets: [],
      })
    );

    const res = await PATCH(
      makePatchReq({
        trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
        enabled: true,
        schedule: '08:30',
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.trigger).toBe(NotificationPreferenceTrigger.DAILY_PROMPT);
    expect(body.data.enabled).toBe(true);
    expect(body.data.schedule).toBe('08:30');

    // Verify upsert keyed on (userId, trigger) and create carries the schedule.
    const upsertArg = mockPrismaNotifPref.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where?.userId_trigger).toEqual({
      userId: 'user-1',
      trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
    });
    expect(upsertArg?.create?.schedule).toBe('08:30');
    expect(upsertArg?.update?.schedule).toBe('08:30');
  });

  it('upserts PER_MEMBER_INTENT with perMemberTargets and returns 200', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaNotifPref.upsert.mockResolvedValueOnce(
      fakeRow({
        trigger: NotificationPreferenceTrigger.PER_MEMBER_INTENT,
        enabled: true,
        schedule: null,
        perMemberTargets: ['user-7', 'user-8'],
      })
    );

    const res = await PATCH(
      makePatchReq({
        trigger: NotificationPreferenceTrigger.PER_MEMBER_INTENT,
        enabled: true,
        perMemberTargets: ['user-7', 'user-8'],
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.trigger).toBe(NotificationPreferenceTrigger.PER_MEMBER_INTENT);
    expect(body.data.perMemberTargets).toEqual(['user-7', 'user-8']);

    const upsertArg = mockPrismaNotifPref.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.create?.perMemberTargets).toEqual(['user-7', 'user-8']);
    expect(upsertArg?.update?.perMemberTargets).toEqual(['user-7', 'user-8']);
  });

  it('upserts a disable (enabled=false) without schedule/targets', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockPrismaNotifPref.upsert.mockResolvedValueOnce(
      fakeRow({
        trigger: NotificationPreferenceTrigger.GROUP_FORMATION,
        enabled: false,
        schedule: null,
        perMemberTargets: [],
      })
    );

    const res = await PATCH(
      makePatchReq({
        trigger: NotificationPreferenceTrigger.GROUP_FORMATION,
        enabled: false,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.enabled).toBe(false);

    // schedule omitted → create defaults to null, update does not set it.
    const upsertArg = mockPrismaNotifPref.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.create?.schedule).toBeNull();
    expect(upsertArg?.update?.schedule).toBeUndefined();
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await PATCH(
      makePatchReq({
        trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
        enabled: true,
      })
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns 500 and calls captureException when prisma upsert throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaNotifPref.upsert.mockRejectedValueOnce(new Error('db down'));

    const res = await PATCH(
      makePatchReq({
        trigger: NotificationPreferenceTrigger.DAILY_PROMPT,
        enabled: true,
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update notification preference');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
