/**
 * Unit tests for GET + PATCH /api/users/relationship-settings.
 *
 * V1 — per-relationship privacy defaults.
 *
 * Prisma, NextAuth, logger, sentry, and rate-limit mocks are established in
 * src/__tests__/setup.ts. This file re-mocks @/lib/rate-limit to get a
 * controllable reference and re-arms the mock after vi.resetAllMocks() in
 * beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { HeatmapGranularityMode, HeatmapIdentityMode } from '@prisma/client';
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
import { GET, PATCH } from '@/app/api/users/relationship-settings/route';
import { checkRateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// Typed references to mocked Prisma delegates + helpers
// ---------------------------------------------------------------------------
const mockCrew = prisma.crew as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

const mockRelSetting = prisma.crewRelationshipSetting as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);
const mockCaptureException = vi.mocked(captureException);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/users/relationship-settings';

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

/** Minimal user-preview shape returned via the crew include selects. */
const partner = (id: string, name: string | null, overrides: Record<string, unknown> = {}) => ({
  id,
  name,
  image: `https://img/${id}.png`,
  city: 'NYC',
  crewLabel: `label-${id}`,
  ...overrides,
});

/**
 * Build an accepted crew edge. Direction controls which slot the caller
 * occupies: 'A' => caller is userA (partner is userB); 'B' => caller is userB.
 */
const crewEdge = (
  uid: string,
  partnerPreview: ReturnType<typeof partner>,
  direction: 'A' | 'B' = 'A'
) => {
  if (direction === 'A') {
    return {
      id: `edge-${partnerPreview.id}`,
      userAId: uid,
      userBId: partnerPreview.id,
      status: 'ACCEPTED',
      userA: partner(uid, 'Self'),
      userB: partnerPreview,
    };
  }
  return {
    id: `edge-${partnerPreview.id}`,
    userAId: partnerPreview.id,
    userBId: uid,
    status: 'ACCEPTED',
    userA: partnerPreview,
    userB: partner(uid, 'Self'),
  };
};

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
// GET /api/users/relationship-settings
// ===========================================================================
describe('GET /api/users/relationship-settings', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns one entry per accepted crew member with BLOCK/KNOWN defaults when no stored row', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      crewEdge('user-1', partner('user-2', 'Bob'), 'A'),
      crewEdge('user-1', partner('user-3', 'Carol'), 'A'),
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings).toHaveLength(2);

    for (const entry of body.data.settings) {
      expect(entry.granularityMode).toBe(HeatmapGranularityMode.BLOCK);
      expect(entry.identityMode).toBe(HeatmapIdentityMode.KNOWN);
    }

    // Sorted by name asc: Bob then Carol.
    expect(body.data.settings.map((s: { name: string }) => s.name)).toEqual(['Bob', 'Carol']);
    // Entry carries the resolved partner preview fields.
    const bob = body.data.settings[0];
    expect(bob.targetId).toBe('user-2');
    expect(bob.image).toBe('https://img/user-2.png');
    expect(bob.crewLabel).toBe('label-user-2');
  });

  it('overrides defaults with a stored row', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      crewEdge('user-1', partner('user-2', 'Bob'), 'A'),
      crewEdge('user-1', partner('user-3', 'Carol'), 'A'),
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([
      {
        viewerId: 'user-1',
        targetId: 'user-2',
        granularityMode: HeatmapGranularityMode.DYNAMIC_CELL,
        identityMode: HeatmapIdentityMode.ANONYMOUS,
      },
    ]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();

    const byTarget = Object.fromEntries(
      body.data.settings.map((s: { targetId: string }) => [s.targetId, s])
    );

    // user-2 has a stored row -> override.
    expect(byTarget['user-2'].granularityMode).toBe(HeatmapGranularityMode.DYNAMIC_CELL);
    expect(byTarget['user-2'].identityMode).toBe(HeatmapIdentityMode.ANONYMOUS);
    // user-3 has no stored row -> defaults.
    expect(byTarget['user-3'].granularityMode).toBe(HeatmapGranularityMode.BLOCK);
    expect(byTarget['user-3'].identityMode).toBe(HeatmapIdentityMode.KNOWN);
  });

  it('resolves the partner correctly whether the caller is userA or userB', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([
      // Caller in the userA slot -> partner is userB (user-2).
      crewEdge('user-1', partner('user-2', 'Bob'), 'A'),
      // Caller in the userB slot -> partner is userA (user-3).
      crewEdge('user-1', partner('user-3', 'Carol'), 'B'),
    ]);
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    const targetIds = body.data.settings.map((s: { targetId: string }) => s.targetId).sort();
    expect(targetIds).toEqual(['user-2', 'user-3']);
    // Caller's own id must never appear as a target.
    expect(targetIds).not.toContain('user-1');
  });

  it('returns an empty settings list when the caller has no crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findMany.mockResolvedValueOnce([]);
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.settings).toEqual([]);
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
    mockCrew.findMany.mockRejectedValueOnce(new Error('db down'));
    mockRelSetting.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeGetReq());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to list relationship settings');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// PATCH /api/users/relationship-settings
// ===========================================================================
describe('PATCH /api/users/relationship-settings', () => {
  const validBody = {
    targetId: 'user-2',
    granularityMode: HeatmapGranularityMode.DYNAMIC_CELL,
    identityMode: HeatmapIdentityMode.ANONYMOUS,
  };

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await PATCH(makePatchReq(validBody));

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

  it('returns 400 on an invalid granularityMode enum value (Zod)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await PATCH(
      makePatchReq({
        targetId: 'user-2',
        granularityMode: 'NOT_A_REAL_MODE',
        identityMode: HeatmapIdentityMode.KNOWN,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when targetId is missing (required field)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());

    const res = await PATCH(
      makePatchReq({
        granularityMode: HeatmapGranularityMode.BLOCK,
        identityMode: HeatmapIdentityMode.KNOWN,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when targetId is the caller (self-target)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));

    const res = await PATCH(
      makePatchReq({
        targetId: 'user-1',
        granularityMode: HeatmapGranularityMode.BLOCK,
        identityMode: HeatmapIdentityMode.KNOWN,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Cannot set relationship settings for yourself');
  });

  it('returns 403 when the target is not an accepted crew member', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(makePatchReq(validBody));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not in your Crew');
  });

  it('upserts the setting and returns 200 when the target is in crew', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'edge-1' });
    mockRelSetting.upsert.mockResolvedValueOnce({
      viewerId: 'user-1',
      targetId: 'user-2',
      granularityMode: HeatmapGranularityMode.DYNAMIC_CELL,
      identityMode: HeatmapIdentityMode.ANONYMOUS,
    });

    const res = await PATCH(makePatchReq(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.setting).toEqual({
      targetId: 'user-2',
      granularityMode: HeatmapGranularityMode.DYNAMIC_CELL,
      identityMode: HeatmapIdentityMode.ANONYMOUS,
    });

    // Verify upsert keyed on (viewerId, targetId) with correct create/update args.
    const upsertArg = mockRelSetting.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where?.viewerId_targetId).toEqual({
      viewerId: 'user-1',
      targetId: 'user-2',
    });
    expect(upsertArg?.create).toEqual({
      viewerId: 'user-1',
      targetId: 'user-2',
      granularityMode: HeatmapGranularityMode.DYNAMIC_CELL,
      identityMode: HeatmapIdentityMode.ANONYMOUS,
    });
    expect(upsertArg?.update).toEqual({
      granularityMode: HeatmapGranularityMode.DYNAMIC_CELL,
      identityMode: HeatmapIdentityMode.ANONYMOUS,
    });
  });

  it('returns 429 when rate limited', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockCheckRateLimit.mockResolvedValueOnce(RL_FAIL);

    const res = await PATCH(makePatchReq(validBody));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns 500 and calls captureException when prisma upsert throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor('user-1'));
    mockCrew.findFirst.mockResolvedValueOnce({ id: 'edge-1' });
    mockRelSetting.upsert.mockRejectedValueOnce(new Error('db down'));

    const res = await PATCH(makePatchReq(validBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update relationship settings');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
