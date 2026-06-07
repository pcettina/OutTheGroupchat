import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Local mocks (rate-limit and sentry mock follows project convention)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn(),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { getServerSession } from 'next-auth';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Inline-cast prisma to add notificationPreference until Wave 3 adds it to
// src/__tests__/setup.ts. Re-armed in beforeEach so vi.resetAllMocks() does
// not leave stale fns in place.
// ---------------------------------------------------------------------------
type NotifPrefMock = {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function attachNotifPrefMock(): NotifPrefMock {
  const m: NotifPrefMock = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  (prisma as unknown as { notificationPreference: NotifPrefMock }).notificationPreference = m;
  return m;
}

let notifPref: NotifPrefMock = attachNotifPrefMock();

const MOCK_SESSION = { user: { id: 'user-1', name: 'Alice' } };
const BASE_URL = 'http://localhost/api/users/notification-preferences';
const VALID_CUID_A = 'c' + 'a'.repeat(24);
const VALID_CUID_B = 'c' + 'b'.repeat(24);

function makeGetRequest() {
  return new NextRequest(BASE_URL);
}

function makePatchRequest(body: unknown) {
  return new NextRequest(BASE_URL, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Re-arm prisma.notificationPreference (resetAllMocks wipes implementations).
  notifPref = attachNotifPrefMock();
  // Re-arm rate-limit mock — factory mockResolvedValue is wiped on resetAllMocks.
  vi.mocked(checkRateLimit).mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: Date.now() + 60000,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/notification-preferences
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/users/notification-preferences', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/users/notification-preferences/route');
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns 429 when rate limit denied', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    const { GET } = await import('@/app/api/users/notification-preferences/route');
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(429);
  });

  it('returns 3 trigger entries with defaults when no rows exist', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.findMany.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/users/notification-preferences/route');
    const res = await GET(makeGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.preferences).toBeDefined();
    expect(json.preferences.DAILY_PROMPT).toEqual({
      enabled: false,
      schedule: null,
      perMemberTargets: [],
    });
    expect(json.preferences.PER_MEMBER_INTENT).toEqual({
      enabled: false,
      schedule: null,
      perMemberTargets: [],
    });
    expect(json.preferences.GROUP_FORMATION).toEqual({
      enabled: false,
      schedule: null,
      perMemberTargets: [],
    });
  });

  it('merges existing rows over defaults (DAILY_PROMPT row with schedule)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.findMany.mockResolvedValueOnce([
      {
        id: 'pref-1',
        userId: 'user-1',
        trigger: 'DAILY_PROMPT',
        enabled: true,
        schedule: '09:00',
        perMemberTargets: [],
      },
    ]);

    const { GET } = await import('@/app/api/users/notification-preferences/route');
    const res = await GET(makeGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.preferences.DAILY_PROMPT).toEqual({
      enabled: true,
      schedule: '09:00',
      perMemberTargets: [],
    });
    // Other triggers still default
    expect(json.preferences.PER_MEMBER_INTENT.enabled).toBe(false);
    expect(json.preferences.GROUP_FORMATION.enabled).toBe(false);
  });

  it('returns 500 when prisma throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.findMany.mockRejectedValueOnce(new Error('DB down'));
    const { GET } = await import('@/app/api/users/notification-preferences/route');
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/notification-preferences
// ──────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/users/notification-preferences', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({ trigger: 'DAILY_PROMPT', enabled: false })
    );
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit denied', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({ trigger: 'DAILY_PROMPT', enabled: false })
    );
    expect(res.status).toBe(429);
  });

  it('returns 400 when Zod fails (invalid trigger)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({ trigger: 'NOT_A_REAL_TRIGGER', enabled: true })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when Zod fails (invalid schedule format like "25:00")', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({
        trigger: 'DAILY_PROMPT',
        enabled: true,
        schedule: '25:00',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when JSON body is invalid', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const req = new NextRequest(BASE_URL, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when DAILY_PROMPT enabled without schedule and no existing row', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.findUnique.mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({ trigger: 'DAILY_PROMPT', enabled: true })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 200 when toggling DAILY_PROMPT enabled with valid schedule', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const updatedAt = new Date('2026-04-28T12:00:00Z');
    notifPref.upsert.mockResolvedValueOnce({
      id: 'pref-1',
      userId: 'user-1',
      trigger: 'DAILY_PROMPT',
      enabled: true,
      schedule: '08:30',
      perMemberTargets: [],
      updatedAt,
    });

    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({
        trigger: 'DAILY_PROMPT',
        enabled: true,
        schedule: '08:30',
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.preference.trigger).toBe('DAILY_PROMPT');
    expect(json.preference.enabled).toBe(true);
    expect(json.preference.schedule).toBe('08:30');
    expect(notifPref.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 200 when updating PER_MEMBER_INTENT with perMemberTargets array', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const targets = [VALID_CUID_A, VALID_CUID_B];
    notifPref.upsert.mockResolvedValueOnce({
      id: 'pref-2',
      userId: 'user-1',
      trigger: 'PER_MEMBER_INTENT',
      enabled: true,
      schedule: null,
      perMemberTargets: targets,
      updatedAt: new Date(),
    });

    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({
        trigger: 'PER_MEMBER_INTENT',
        enabled: true,
        perMemberTargets: targets,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.preference.perMemberTargets).toEqual(targets);
    // Verify upsert called with correct compound key
    const call = notifPref.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      userId_trigger: { userId: 'user-1', trigger: 'PER_MEMBER_INTENT' },
    });
    expect(call.create.perMemberTargets).toEqual(targets);
    expect(call.update.perMemberTargets).toEqual(targets);
  });

  it('returns 200 when toggling GROUP_FORMATION (no schedule/targets needed)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.upsert.mockResolvedValueOnce({
      id: 'pref-3',
      userId: 'user-1',
      trigger: 'GROUP_FORMATION',
      enabled: true,
      schedule: null,
      perMemberTargets: [],
      updatedAt: new Date(),
    });

    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({ trigger: 'GROUP_FORMATION', enabled: true })
    );

    expect(res.status).toBe(200);
    // GROUP_FORMATION should not include schedule or perMemberTargets in updateData
    const call = notifPref.upsert.mock.calls[0][0];
    expect(call.update).toEqual({ enabled: true });
    expect(call.create.schedule).toBeNull();
    expect(call.create.perMemberTargets).toEqual([]);
  });

  it('upsert called with userId_trigger compound key', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.upsert.mockResolvedValueOnce({
      id: 'pref-4',
      userId: 'user-1',
      trigger: 'GROUP_FORMATION',
      enabled: false,
      schedule: null,
      perMemberTargets: [],
      updatedAt: new Date(),
    });

    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    await PATCH(makePatchRequest({ trigger: 'GROUP_FORMATION', enabled: false }));

    expect(notifPref.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_trigger: { userId: 'user-1', trigger: 'GROUP_FORMATION' } },
      })
    );
  });

  it('returns 400 when perMemberTargets exceeds max length 100', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const tooMany = Array.from({ length: 101 }, () => VALID_CUID_A);
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({
        trigger: 'PER_MEMBER_INTENT',
        enabled: true,
        perMemberTargets: tooMany,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when perMemberTargets contains an invalid (non-CUID) id', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({
        trigger: 'PER_MEMBER_INTENT',
        enabled: true,
        perMemberTargets: ['not-a-cuid'],
      })
    );
    expect(res.status).toBe(400);
  });

  it('allows DAILY_PROMPT enabled when no schedule provided but existing row has one', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.findUnique.mockResolvedValueOnce({ schedule: '07:00' });
    notifPref.upsert.mockResolvedValueOnce({
      id: 'pref-5',
      userId: 'user-1',
      trigger: 'DAILY_PROMPT',
      enabled: true,
      schedule: '07:00',
      perMemberTargets: [],
      updatedAt: new Date(),
    });

    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({ trigger: 'DAILY_PROMPT', enabled: true })
    );
    expect(res.status).toBe(200);
  });

  it('returns 500 when prisma upsert throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    notifPref.upsert.mockRejectedValueOnce(new Error('DB down'));
    const { PATCH } = await import('@/app/api/users/notification-preferences/route');
    const res = await PATCH(
      makePatchRequest({ trigger: 'GROUP_FORMATION', enabled: true })
    );
    expect(res.status).toBe(500);
  });
});
