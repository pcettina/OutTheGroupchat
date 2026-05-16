/**
 * Unit tests for GET /api/cron/send-daily-prompts (V1 Phase 5, R8).
 *
 * Auth: Bearer CRON_SECRET. Reads NotificationPreference rows where
 * trigger='DAILY_PROMPT' AND enabled=true, then bulk-creates Notification
 * rows (type='SYSTEM', data.source='DAILY_PROMPT') for each opted-in user
 * who has not already received today's prompt (UTC). Returns
 * { success, candidateCount, sentCount, skippedDuplicates }.
 *
 * Prisma + sentry mocks come from src/__tests__/setup.ts. The
 * `notificationPreference` model is not yet in setup.ts, so it is
 * inline-cast here. Wave 3 should add it to setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/cron/send-daily-prompts/route';

type MockFn = ReturnType<typeof vi.fn>;

type NotifPrefMock = { findMany: MockFn };
type NotifMock = {
  findMany: MockFn;
  createMany: MockFn;
  create: MockFn;
};

const mockPrismaNotificationPreference = (): NotifPrefMock => {
  // Ensure the property exists on the shared prisma mock.
  const p = prisma as unknown as { notificationPreference?: NotifPrefMock };
  if (!p.notificationPreference) {
    p.notificationPreference = { findMany: vi.fn() };
  }
  return p.notificationPreference;
};

const mockPrismaNotification = prisma.notification as unknown as NotifMock;

const SECRET = 'test-cron-secret';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
  // Re-arm prisma mocks after resetAllMocks().
  const np = mockPrismaNotificationPreference();
  np.findMany = vi.fn().mockResolvedValue([]);
  mockPrismaNotification.findMany = vi.fn().mockResolvedValue([]);
  mockPrismaNotification.createMany = vi.fn().mockResolvedValue({ count: 0 });
  mockPrismaNotification.create = vi.fn().mockResolvedValue({ id: 'n1' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const makeReq = (opts: { secret?: string | null } = {}): Request => {
  const { secret = SECRET } = opts;
  const headers: Record<string, string> = {};
  if (secret !== null) headers['authorization'] = `Bearer ${secret}`;
  return new Request('http://localhost/api/cron/send-daily-prompts', {
    method: 'GET',
    headers,
  });
};

describe('GET /api/cron/send-daily-prompts', () => {
  it('500 when CRON_SECRET env var is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(makeReq({ secret: null }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Cron configuration error');
  });

  it('401 when authorization header is missing', async () => {
    const res = await GET(makeReq({ secret: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('401 when bearer token does not match', async () => {
    const res = await GET(makeReq({ secret: 'wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('200 returns zero counts when no users opted in', async () => {
    const np = mockPrismaNotificationPreference();
    np.findMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      candidateCount: 0,
      sentCount: 0,
      skippedDuplicates: 0,
    });
    // Should not query notifications or insert when no candidates.
    expect(mockPrismaNotification.findMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('200 dispatches notifications to all 3 opted-in users when none have today prompt', async () => {
    const np = mockPrismaNotificationPreference();
    np.findMany.mockResolvedValueOnce([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
    ]);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]); // none already sent
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 3 });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      candidateCount: 3,
      sentCount: 3,
      skippedDuplicates: 0,
    });

    // Verify the preference query filter
    const prefArgs = np.findMany.mock.calls[0][0];
    expect(prefArgs.where).toEqual({
      trigger: 'DAILY_PROMPT',
      enabled: true,
    });

    // Verify createMany got all 3 user rows with correct shape
    const createArgs = mockPrismaNotification.createMany.mock.calls[0][0];
    expect(createArgs.skipDuplicates).toBe(true);
    expect(createArgs.data).toHaveLength(3);
    expect(createArgs.data[0]).toMatchObject({
      userId: 'u1',
      type: 'SYSTEM',
      title: 'What should we get up to today?',
      data: { link: '/intents/new', source: 'DAILY_PROMPT' },
    });
  });

  it('200 idempotent — skips users who already received today prompt', async () => {
    const np = mockPrismaNotificationPreference();
    np.findMany.mockResolvedValueOnce([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
    ]);
    // u2 already received today's prompt
    mockPrismaNotification.findMany.mockResolvedValueOnce([{ userId: 'u2' }]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      candidateCount: 3,
      sentCount: 2,
      skippedDuplicates: 1,
    });

    // createMany should be invoked with only u1 + u3
    const createArgs = mockPrismaNotification.createMany.mock.calls[0][0];
    expect(createArgs.data).toHaveLength(2);
    const userIds = (createArgs.data as Array<{ userId: string }>).map(
      (r) => r.userId,
    );
    expect(userIds.sort()).toEqual(['u1', 'u3']);

    // findMany filter scoped to candidate userIds + today's UTC start
    const findArgs = mockPrismaNotification.findMany.mock.calls[0][0];
    expect(findArgs.where.userId.in).toEqual(['u1', 'u2', 'u3']);
    expect(findArgs.where.type).toBe('SYSTEM');
    expect(findArgs.where.title).toBe('What should we get up to today?');
    expect(findArgs.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('200 deduplicates candidate userIds before counting', async () => {
    const np = mockPrismaNotificationPreference();
    // Same userId appears twice (e.g., trigger row + secondary)
    np.findMany.mockResolvedValueOnce([
      { userId: 'u1' },
      { userId: 'u1' },
      { userId: 'u2' },
    ]);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 2 });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidateCount).toBe(2);
    expect(body.sentCount).toBe(2);
  });

  it('200 falls back to per-row create when bulk createMany throws', async () => {
    const np = mockPrismaNotificationPreference();
    np.findMany.mockResolvedValueOnce([
      { userId: 'u1' },
      { userId: 'u2' },
    ]);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockRejectedValueOnce(
      new Error('bulk failed'),
    );
    // Per-row inserts succeed
    mockPrismaNotification.create
      .mockResolvedValueOnce({ id: 'n-u1' })
      .mockResolvedValueOnce({ id: 'n-u2' });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      candidateCount: 2,
      sentCount: 2,
      skippedDuplicates: 0,
    });
    expect(mockPrismaNotification.create).toHaveBeenCalledTimes(2);
  });

  it('200 continues on per-row failure within fallback path', async () => {
    const np = mockPrismaNotificationPreference();
    np.findMany.mockResolvedValueOnce([
      { userId: 'u1' },
      { userId: 'u2' },
      { userId: 'u3' },
    ]);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.createMany.mockRejectedValueOnce(
      new Error('bulk failed'),
    );
    // u2 fails; u1 and u3 succeed
    mockPrismaNotification.create
      .mockResolvedValueOnce({ id: 'n-u1' })
      .mockRejectedValueOnce(new Error('row failed'))
      .mockResolvedValueOnce({ id: 'n-u3' });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      candidateCount: 3,
      sentCount: 2,
      skippedDuplicates: 0,
    });
  });

  it('500 when notificationPreference.findMany rejects (top-level error)', async () => {
    const np = mockPrismaNotificationPreference();
    np.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Cron failed');
  });
});
