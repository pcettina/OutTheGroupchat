/**
 * Unit tests for dispatchPerMemberIntent
 * (src/lib/notifications/per-member-intent.ts).
 *
 * A user opts into PER_MEMBER_INTENT alerts for a specific Crew partner by
 * enabling the preference and adding the watched author's userId to
 * perMemberTargets. When that author signals an Intent, every watcher who (a)
 * flagged them via an enabled PER_MEMBER_INTENT preference AND (b) is an
 * ACCEPTED Crew partner of the author receives a SYSTEM notification.
 *
 * Unlike daily-prompt, this module takes an INJECTED prisma (a narrow Pick
 * type), so we build a LOCAL hand-rolled mock prisma here rather than relying
 * on the global setup.ts mock. sentry + logger are still module mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchPerMemberIntent } from '@/lib/notifications/per-member-intent';
import type { PerMemberIntentPrisma } from '@/lib/notifications/per-member-intent';
import type { Intent } from '@prisma/client';

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  apiLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

type MockFn = ReturnType<typeof vi.fn>;

interface MockPrisma {
  notificationPreference: { findMany: MockFn };
  crew: { findMany: MockFn };
  topic: { findUnique: MockFn };
  user: { findUnique: MockFn };
  notification: { create: MockFn };
}

let mockPrisma: MockPrisma;

/** Cast helper so the hand-rolled mock satisfies the injected Pick type. */
function asPrisma(p: MockPrisma): PerMemberIntentPrisma {
  return p as unknown as PerMemberIntentPrisma;
}

/** Minimal Intent stub — only the fields the dispatcher reads. */
function makeIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: 'intent-1',
    userId: 'author-1',
    topicId: 'topic-1',
    ...overrides,
  } as unknown as Intent;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = {
    notificationPreference: { findMany: vi.fn() },
    crew: { findMany: vi.fn() },
    topic: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
  };
});

describe('dispatchPerMemberIntent', () => {
  it('returns { eligible: 0, sent: 0 } and never creates a notification when no preferences match', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([]);

    const result = await dispatchPerMemberIntent(makeIntent(), asPrisma(mockPrisma));

    expect(result).toEqual({ eligible: 0, sent: 0 });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    // Short-circuits before the Crew guard / lookups.
    expect(mockPrisma.crew.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.topic.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('queries only enabled PER_MEMBER_INTENT prefs targeting the author and excluding the author', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([]);

    await dispatchPerMemberIntent(
      makeIntent({ userId: 'author-1' }),
      asPrisma(mockPrisma),
    );

    const where = mockPrisma.notificationPreference.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      trigger: 'PER_MEMBER_INTENT',
      enabled: true,
      perMemberTargets: { has: 'author-1' },
      userId: { not: 'author-1' },
    });
  });

  it('notifies one eligible watcher who IS an ACCEPTED Crew partner with correct SYSTEM payload', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'watcher-1' },
    ]);
    mockPrisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'author-1', userBId: 'watcher-1' },
    ]);
    mockPrisma.topic.findUnique.mockResolvedValueOnce({ displayName: 'Climbing' });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ name: 'Alex' });
    mockPrisma.notification.create.mockResolvedValueOnce({ id: 'notif-1' });

    const result = await dispatchPerMemberIntent(
      makeIntent({ id: 'intent-9', userId: 'author-1', topicId: 'topic-7' }),
      asPrisma(mockPrisma),
    );

    expect(result).toEqual({ eligible: 1, sent: 1 });
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);

    const arg = mockPrisma.notification.create.mock.calls[0][0];
    expect(arg.data.userId).toBe('watcher-1');
    expect(arg.data.type).toBe('SYSTEM');
    expect(arg.data.title).toBe('Alex is up for Climbing');
    expect(arg.data.data.kind).toBe('PER_MEMBER_INTENT');
    expect(arg.data.data.authorUserId).toBe('author-1');
    expect(arg.data.data.intentId).toBe('intent-9');
    expect(arg.data.data.topicId).toBe('topic-7');
    expect(arg.data.data.link).toBe('/intents/intent-9');
  });

  it('resolves the Crew partner id when the author is userBId (OR branch symmetry)', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'watcher-2' },
    ]);
    // Author appears as userBId; watcher as userAId.
    mockPrisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'watcher-2', userBId: 'author-1' },
    ]);
    mockPrisma.topic.findUnique.mockResolvedValueOnce({ displayName: 'Tennis' });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ name: 'Jordan' });
    mockPrisma.notification.create.mockResolvedValueOnce({ id: 'n' });

    const result = await dispatchPerMemberIntent(
      makeIntent({ userId: 'author-1' }),
      asPrisma(mockPrisma),
    );

    expect(result).toEqual({ eligible: 1, sent: 1 });
    expect(mockPrisma.notification.create.mock.calls[0][0].data.userId).toBe(
      'watcher-2',
    );
  });

  it('falls back to neutral copy when topic and author lookups return null', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'watcher-1' },
    ]);
    mockPrisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'author-1', userBId: 'watcher-1' },
    ]);
    mockPrisma.topic.findUnique.mockResolvedValueOnce(null);
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockPrisma.notification.create.mockResolvedValueOnce({ id: 'n' });

    await dispatchPerMemberIntent(makeIntent({ userId: 'author-1' }), asPrisma(mockPrisma));

    const arg = mockPrisma.notification.create.mock.calls[0][0];
    expect(arg.data.title).toBe('A Crew member is up for something');
  });

  it('never notifies the author themselves even if they slip into the watcher set', async () => {
    // Both the author and a real watcher come back from the preference query.
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'author-1' },
      { userId: 'watcher-1' },
    ]);
    // Crew rows include the author paired with watcher-1, but the author is
    // never their own Crew partner, so they must be filtered out.
    mockPrisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'author-1', userBId: 'watcher-1' },
    ]);
    mockPrisma.topic.findUnique.mockResolvedValueOnce({ displayName: 'Surfing' });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ name: 'Sam' });
    mockPrisma.notification.create.mockResolvedValueOnce({ id: 'n' });

    const result = await dispatchPerMemberIntent(
      makeIntent({ userId: 'author-1' }),
      asPrisma(mockPrisma),
    );

    expect(result).toEqual({ eligible: 1, sent: 1 });
    const notifiedUserIds = mockPrisma.notification.create.mock.calls.map(
      (c) => c[0].data.userId,
    );
    expect(notifiedUserIds).toEqual(['watcher-1']);
    expect(notifiedUserIds).not.toContain('author-1');
  });

  it('excludes a watcher who opted in but is NOT an ACCEPTED Crew partner (Crew guard)', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'watcher-1' },
    ]);
    // No Crew row links the watcher to the author -> guard rejects them.
    mockPrisma.crew.findMany.mockResolvedValueOnce([]);

    const result = await dispatchPerMemberIntent(
      makeIntent({ userId: 'author-1' }),
      asPrisma(mockPrisma),
    );

    expect(result).toEqual({ eligible: 0, sent: 0 });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    // Guard short-circuits before topic/author copy resolution.
    expect(mockPrisma.topic.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('queries Crew for ACCEPTED partnerships in both userA/userB directions', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'watcher-1' },
    ]);
    mockPrisma.crew.findMany.mockResolvedValueOnce([]);

    await dispatchPerMemberIntent(makeIntent({ userId: 'author-1' }), asPrisma(mockPrisma));

    const where = mockPrisma.crew.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('ACCEPTED');
    expect(where.OR).toEqual([
      { userAId: 'author-1', userBId: { in: ['watcher-1'] } },
      { userBId: 'author-1', userAId: { in: ['watcher-1'] } },
    ]);
  });

  it('sent === eligible when every notification.create succeeds for multiple watchers', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'watcher-1' },
      { userId: 'watcher-2' },
      { userId: 'watcher-3' },
    ]);
    mockPrisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'author-1', userBId: 'watcher-1' },
      { userAId: 'author-1', userBId: 'watcher-2' },
      { userAId: 'author-1', userBId: 'watcher-3' },
    ]);
    mockPrisma.topic.findUnique.mockResolvedValueOnce({ displayName: 'Hiking' });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ name: 'Robin' });
    mockPrisma.notification.create
      .mockResolvedValueOnce({ id: 'n1' })
      .mockResolvedValueOnce({ id: 'n2' })
      .mockResolvedValueOnce({ id: 'n3' });

    const result = await dispatchPerMemberIntent(
      makeIntent({ userId: 'author-1' }),
      asPrisma(mockPrisma),
    );

    expect(result).toEqual({ eligible: 3, sent: 3 });
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(3);
  });

  it('swallows a per-row notification.create rejection — sent counts only successes, no throw', async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'watcher-1' },
      { userId: 'watcher-2' },
      { userId: 'watcher-3' },
    ]);
    mockPrisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'author-1', userBId: 'watcher-1' },
      { userAId: 'author-1', userBId: 'watcher-2' },
      { userAId: 'author-1', userBId: 'watcher-3' },
    ]);
    mockPrisma.topic.findUnique.mockResolvedValueOnce({ displayName: 'Climbing' });
    mockPrisma.user.findUnique.mockResolvedValueOnce({ name: 'Alex' });
    // Second write fails; first and third must still be attempted.
    mockPrisma.notification.create
      .mockResolvedValueOnce({ id: 'n1' })
      .mockRejectedValueOnce(new Error('row write failed'))
      .mockResolvedValueOnce({ id: 'n3' });

    const result = await dispatchPerMemberIntent(
      makeIntent({ userId: 'author-1' }),
      asPrisma(mockPrisma),
    );

    expect(result).toEqual({ eligible: 3, sent: 2 });
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(3);
  });
});
