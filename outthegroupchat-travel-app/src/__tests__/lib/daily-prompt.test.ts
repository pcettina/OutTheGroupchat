/**
 * Unit tests for sendDailyPrompts (src/lib/notifications/daily-prompt.ts).
 *
 * Selects every user with the DAILY_PROMPT NotificationPreference enabled and
 * writes each a SYSTEM Notification deep-linking to /intents/new. A single
 * notification.create rejection is logged and skipped — it must NOT abort the
 * batch. Prisma + sentry mocks come from src/__tests__/setup.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { sendDailyPrompts } from '@/lib/notifications/daily-prompt';
import type { PrismaClient } from '@prisma/client';

type MockFn = ReturnType<typeof vi.fn>;
const mockNotificationPreference = prisma.notificationPreference as unknown as {
  findMany: MockFn;
};
const mockNotification = prisma.notification as unknown as {
  create: MockFn;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockNotificationPreference.findMany.mockResolvedValue([]);
  mockNotification.create.mockResolvedValue({ id: 'notif-1' });
});

describe('sendDailyPrompts', () => {
  it('returns { eligible: 0, sent: 0 } and creates no notifications when no prefs are enabled', async () => {
    mockNotificationPreference.findMany.mockResolvedValueOnce([]);

    const result = await sendDailyPrompts(prisma as unknown as PrismaClient);

    expect(result).toEqual({ eligible: 0, sent: 0 });
    expect(mockNotification.create).not.toHaveBeenCalled();
  });

  it('queries only DAILY_PROMPT prefs that are enabled', async () => {
    await sendDailyPrompts(prisma as unknown as PrismaClient);

    const where = mockNotificationPreference.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ trigger: 'DAILY_PROMPT', enabled: true });
  });

  it('creates a SYSTEM notification for an enabled user linking to /intents/new', async () => {
    mockNotificationPreference.findMany.mockResolvedValueOnce([{ userId: 'user-1' }]);

    const result = await sendDailyPrompts(prisma as unknown as PrismaClient);

    expect(result).toEqual({ eligible: 1, sent: 1 });
    expect(mockNotification.create).toHaveBeenCalledTimes(1);

    const arg = mockNotification.create.mock.calls[0][0];
    expect(arg.data.userId).toBe('user-1');
    expect(arg.data.type).toBe('SYSTEM');
    expect(arg.data.data.link).toBe('/intents/new');
  });

  it('sent === eligible when every notification.create succeeds for multiple users', async () => {
    mockNotificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'user-1' },
      { userId: 'user-2' },
      { userId: 'user-3' },
    ]);

    const result = await sendDailyPrompts(prisma as unknown as PrismaClient);

    expect(result.eligible).toBe(3);
    expect(result.sent).toBe(3);
    expect(mockNotification.create).toHaveBeenCalledTimes(3);
  });

  it('creates one notification per distinct eligible user', async () => {
    mockNotificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'a' },
      { userId: 'b' },
    ]);

    await sendDailyPrompts(prisma as unknown as PrismaClient);

    const userIds = mockNotification.create.mock.calls.map((c) => c[0].data.userId);
    expect(userIds).toEqual(['a', 'b']);
  });

  it('a single notification.create rejection does NOT abort the batch', async () => {
    mockNotificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'user-1' },
      { userId: 'user-2' },
      { userId: 'user-3' },
    ]);
    // Second user's write fails; first and third must still be attempted.
    mockNotification.create
      .mockResolvedValueOnce({ id: 'n1' })
      .mockRejectedValueOnce(new Error('row write failed'))
      .mockResolvedValueOnce({ id: 'n3' });

    const result = await sendDailyPrompts(prisma as unknown as PrismaClient);

    expect(result.eligible).toBe(3);
    expect(result.sent).toBe(2);
    expect(mockNotification.create).toHaveBeenCalledTimes(3);
  });

  it('sent reflects only successful writes when the first user fails', async () => {
    mockNotificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ]);
    mockNotification.create
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'n2' });

    const result = await sendDailyPrompts(prisma as unknown as PrismaClient);

    expect(result.eligible).toBe(2);
    expect(result.sent).toBe(1);
  });
});
