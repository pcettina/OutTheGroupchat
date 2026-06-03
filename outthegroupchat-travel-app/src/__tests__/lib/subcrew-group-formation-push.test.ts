/**
 * Unit tests for the additive GROUP_FORMATION real-time push behavior in
 * src/lib/subcrew/try-form.ts (V1 Phase 5, step 8).
 *
 * After a SubCrew forms and the SUBCREW_FORMED in-app notifications are written,
 * the code queries enabled GROUP_FORMATION NotificationPreferences for the two
 * seed users and calls `broadcastToUser(userId, 'subcrew:formed', { subCrewId })`
 * for each. The whole push block is wrapped in try/catch and is non-fatal — a
 * formation must still succeed even if the preference query or broadcast throws.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Intent } from '@prisma/client';

// Mock the real-time + observability surfaces so we can assert on the push and
// confirm formation is never aborted by a swallowed push error.
vi.mock('@/lib/pusher', () => ({ broadcastToUser: vi.fn(), events: {} }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  apiLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { broadcastToUser } from '@/lib/pusher';
import { tryFormSubCrew, type FormSubCrewPrisma } from '@/lib/subcrew/try-form';

type MockFn = ReturnType<typeof vi.fn>;

function makePrisma(): FormSubCrewPrisma & {
  crew: { findMany: MockFn };
  intent: { findMany: MockFn };
  subCrew: { findFirst: MockFn; create: MockFn };
  subCrewMember: { create: MockFn };
  notification: { createMany: MockFn };
  notificationPreference: { findMany: MockFn };
} {
  return {
    crew: { findMany: vi.fn().mockResolvedValue([]) },
    intent: { findMany: vi.fn().mockResolvedValue([]) },
    subCrew: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sc-new' }),
    },
    subCrewMember: { create: vi.fn() },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    notificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
  } as never;
}

const focalIntent = (over: Partial<Intent> = {}): Intent =>
  ({
    id: 'intent-focal',
    userId: 'user-A',
    topicId: 'topic-drinks',
    windowPreset: 'EVENING',
    state: 'INTERESTED',
    cityArea: 'east-village',
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    createdAt: new Date(),
    startAt: null,
    endAt: null,
    dayOffset: 0,
    venueId: null,
    rawText: 'drinks tonight',
    ...over,
  }) as Intent;

/** Arrange crew + intent mocks so a SubCrew between user-A and user-B forms. */
function arrangeSuccessfulFormation(prisma: ReturnType<typeof makePrisma>) {
  prisma.crew.findMany.mockResolvedValueOnce([
    { userAId: 'user-A', userBId: 'user-B' },
  ]);
  prisma.intent.findMany.mockResolvedValueOnce([
    {
      id: 'intent-B',
      userId: 'user-B',
      windowPreset: 'EVENING',
      startAt: null,
      endAt: null,
      cityArea: 'east-village',
    },
  ]);
}

describe('tryFormSubCrew — GROUP_FORMATION real-time push (step 8)', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
  });

  it('broadcasts to BOTH seed users when both have GROUP_FORMATION enabled', async () => {
    arrangeSuccessfulFormation(prisma);
    prisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'user-A' },
      { userId: 'user-B' },
    ]);

    const result = await tryFormSubCrew(focalIntent(), prisma);

    expect(result).toEqual({
      subCrewId: 'sc-new',
      seedUserIds: ['user-A', 'user-B'],
    });

    // The preference query targets the GROUP_FORMATION trigger, enabled only,
    // scoped to the two seed users.
    expect(prisma.notificationPreference.findMany).toHaveBeenCalledOnce();
    const prefWhere = prisma.notificationPreference.findMany.mock.calls[0][0].where;
    expect(prefWhere.trigger).toBe('GROUP_FORMATION');
    expect(prefWhere.enabled).toBe(true);
    expect(prefWhere.userId).toEqual({ in: ['user-A', 'user-B'] });

    // broadcastToUser fired for both users with the expected event + payload.
    expect(vi.mocked(broadcastToUser)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(broadcastToUser)).toHaveBeenCalledWith(
      'user-A',
      'subcrew:formed',
      { subCrewId: 'sc-new' },
    );
    expect(vi.mocked(broadcastToUser)).toHaveBeenCalledWith(
      'user-B',
      'subcrew:formed',
      { subCrewId: 'sc-new' },
    );
  });

  it('broadcasts to exactly ONE user when only that user has it enabled', async () => {
    arrangeSuccessfulFormation(prisma);
    prisma.notificationPreference.findMany.mockResolvedValueOnce([
      { userId: 'user-B' },
    ]);

    const result = await tryFormSubCrew(focalIntent(), prisma);
    expect(result).not.toBeNull();

    expect(vi.mocked(broadcastToUser)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(broadcastToUser)).toHaveBeenCalledWith(
      'user-B',
      'subcrew:formed',
      { subCrewId: 'sc-new' },
    );
    expect(vi.mocked(broadcastToUser)).not.toHaveBeenCalledWith(
      'user-A',
      expect.anything(),
      expect.anything(),
    );
  });

  it('never broadcasts when no seed user has it enabled, but formation still succeeds', async () => {
    arrangeSuccessfulFormation(prisma);
    prisma.notificationPreference.findMany.mockResolvedValueOnce([]);

    const result = await tryFormSubCrew(focalIntent(), prisma);

    // Formation succeeds and the SUBCREW_FORMED notifications were still written.
    expect(result).toEqual({
      subCrewId: 'sc-new',
      seedUserIds: ['user-A', 'user-B'],
    });
    expect(prisma.subCrew.create).toHaveBeenCalledOnce();
    expect(prisma.notification.createMany).toHaveBeenCalledOnce();

    // No push went out.
    expect(vi.mocked(broadcastToUser)).not.toHaveBeenCalled();
  });

  it('still returns a non-null result when the preference query rejects (push is non-fatal)', async () => {
    arrangeSuccessfulFormation(prisma);
    prisma.notificationPreference.findMany.mockRejectedValueOnce(
      new Error('db down'),
    );

    let result: Awaited<ReturnType<typeof tryFormSubCrew>> = null;
    await expect(
      (async () => {
        result = await tryFormSubCrew(focalIntent(), prisma);
      })(),
    ).resolves.toBeUndefined();

    // The push block swallowed the error; the SubCrew was still created.
    expect(result).toEqual({
      subCrewId: 'sc-new',
      seedUserIds: ['user-A', 'user-B'],
    });
    expect(prisma.subCrew.create).toHaveBeenCalledOnce();
    expect(prisma.notification.createMany).toHaveBeenCalledOnce();
    expect(vi.mocked(broadcastToUser)).not.toHaveBeenCalled();
  });
});
