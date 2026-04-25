/**
 * Unit tests for src/lib/subcrew/window-adjacency.ts and
 * src/lib/subcrew/try-form.ts (V1 Phase 2 — auto-formation).
 *
 * Covers ship criteria from V1_IMPLEMENTATION_PLAN.md Phase 2:
 *   - tryFormSubCrew has unit tests covering adjacent-window collapse + multi-user match
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Intent } from '@prisma/client';
import {
  adjacentPresets,
  presetsAdjacent,
  presetDistance,
} from '@/lib/subcrew/window-adjacency';
import { tryFormSubCrew, type FormSubCrewPrisma } from '@/lib/subcrew/try-form';

type MockFn = ReturnType<typeof vi.fn>;

function makePrisma(): FormSubCrewPrisma & {
  crew: { findMany: MockFn };
  intent: { findMany: MockFn };
  subCrew: { findFirst: MockFn; create: MockFn };
  subCrewMember: { create: MockFn };
  notification: { createMany: MockFn };
} {
  return {
    crew: { findMany: vi.fn().mockResolvedValue([]) },
    intent: { findMany: vi.fn().mockResolvedValue([]) },
    subCrew: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sc-new' }),
    },
    subCrewMember: { create: vi.fn() },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
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

// ---------------------------------------------------------------------------
// window-adjacency
// ---------------------------------------------------------------------------
describe('window-adjacency', () => {
  it('adjacentPresets includes self + neighbors', () => {
    expect(adjacentPresets('EVENING').sort()).toEqual(
      ['AFTERNOON', 'EVENING', 'NIGHT'].sort(),
    );
  });

  it('endpoints have only one neighbor', () => {
    expect(adjacentPresets('EARLY_MORNING')).toEqual(['EARLY_MORNING', 'MORNING']);
    expect(adjacentPresets('NIGHT')).toEqual(['NIGHT', 'EVENING']);
  });

  it('presetsAdjacent is symmetric', () => {
    expect(presetsAdjacent('EVENING', 'NIGHT')).toBe(true);
    expect(presetsAdjacent('NIGHT', 'EVENING')).toBe(true);
    expect(presetsAdjacent('MORNING', 'NIGHT')).toBe(false);
  });

  it('presetDistance: 0 self, 1 adjacent, Infinity otherwise', () => {
    expect(presetDistance('EVENING', 'EVENING')).toBe(0);
    expect(presetDistance('EVENING', 'NIGHT')).toBe(1);
    expect(presetDistance('EVENING', 'AFTERNOON')).toBe(1);
    expect(presetDistance('MORNING', 'EVENING')).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// tryFormSubCrew
// ---------------------------------------------------------------------------
describe('tryFormSubCrew', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
  });

  it('returns null when focal Intent is COMMITTED', async () => {
    const result = await tryFormSubCrew(focalIntent({ state: 'COMMITTED' }), prisma);
    expect(result).toBeNull();
    expect(prisma.crew.findMany).not.toHaveBeenCalled();
  });

  it('returns null when focal Intent already expired', async () => {
    const result = await tryFormSubCrew(
      focalIntent({ expiresAt: new Date(Date.now() - 60 * 1000) }),
      prisma,
    );
    expect(result).toBeNull();
  });

  it('returns null when caller has no accepted Crew partners', async () => {
    prisma.crew.findMany.mockResolvedValueOnce([]);
    const result = await tryFormSubCrew(focalIntent(), prisma);
    expect(result).toBeNull();
  });

  it('returns null when no candidate Intents exist', async () => {
    prisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'user-A', userBId: 'user-B' },
    ]);
    prisma.intent.findMany.mockResolvedValueOnce([]);

    const result = await tryFormSubCrew(focalIntent(), prisma);
    expect(result).toBeNull();
  });

  it('forms a SubCrew when an exact-match Crew Intent exists', async () => {
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

    const result = await tryFormSubCrew(focalIntent(), prisma);
    expect(result).toEqual({
      subCrewId: 'sc-new',
      seedUserIds: ['user-A', 'user-B'],
    });
    expect(prisma.subCrew.create).toHaveBeenCalledOnce();
    expect(prisma.notification.createMany).toHaveBeenCalledOnce();
    const notifData = prisma.notification.createMany.mock.calls[0][0].data;
    expect(notifData).toHaveLength(2);
    expect(notifData.every((n: { type: string }) => n.type === 'SUBCREW_FORMED')).toBe(true);
  });

  it('R17 collapse — single user with EVENING + NIGHT yields ONE SubCrew using EVENING (closer)', async () => {
    prisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'user-A', userBId: 'user-B' },
    ]);
    // user-B has both EVENING and NIGHT live Intents (a hedge).
    prisma.intent.findMany.mockResolvedValueOnce([
      {
        id: 'intent-B-evening',
        userId: 'user-B',
        windowPreset: 'EVENING',
        startAt: null,
        endAt: null,
        cityArea: null,
      },
      {
        id: 'intent-B-night',
        userId: 'user-B',
        windowPreset: 'NIGHT',
        startAt: null,
        endAt: null,
        cityArea: null,
      },
    ]);

    const result = await tryFormSubCrew(focalIntent(), prisma);
    expect(result).not.toBeNull();
    expect(prisma.subCrew.create).toHaveBeenCalledOnce();

    // The created SubCrew should reference the EVENING intent (distance 0),
    // NOT the NIGHT one (distance 1).
    const createCall = prisma.subCrew.create.mock.calls[0][0];
    const seedMembers = createCall.data.members.create as Array<{
      intentId: string;
      userId: string;
    }>;
    const partnerSeed = seedMembers.find((m) => m.userId === 'user-B');
    expect(partnerSeed?.intentId).toBe('intent-B-evening');
  });

  it('multi-user match selects the closest-distance partner', async () => {
    prisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'user-A', userBId: 'user-B' },
      { userAId: 'user-A', userBId: 'user-C' },
    ]);
    // user-B has NIGHT (distance 1), user-C has EVENING (distance 0).
    prisma.intent.findMany.mockResolvedValueOnce([
      {
        id: 'intent-B-night',
        userId: 'user-B',
        windowPreset: 'NIGHT',
        startAt: null,
        endAt: null,
        cityArea: null,
      },
      {
        id: 'intent-C-evening',
        userId: 'user-C',
        windowPreset: 'EVENING',
        startAt: null,
        endAt: null,
        cityArea: null,
      },
    ]);

    const result = await tryFormSubCrew(focalIntent(), prisma);
    expect(result?.seedUserIds).toEqual(['user-A', 'user-C']);

    const createCall = prisma.subCrew.create.mock.calls[0][0];
    const seedMembers = createCall.data.members.create as Array<{
      intentId: string;
      userId: string;
    }>;
    expect(seedMembers.find((m) => m.userId === 'user-C')?.intentId).toBe('intent-C-evening');
  });

  it('skips formation when an existing SubCrew already covers this pair + topic', async () => {
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
        cityArea: null,
      },
    ]);
    prisma.subCrew.findFirst.mockResolvedValueOnce({ id: 'sc-existing' });

    const result = await tryFormSubCrew(focalIntent(), prisma);
    expect(result).toBeNull();
    expect(prisma.subCrew.create).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('cityArea filter — focal supplies one; candidate with non-matching cityArea is excluded by the prisma where clause', async () => {
    prisma.crew.findMany.mockResolvedValueOnce([
      { userAId: 'user-A', userBId: 'user-B' },
    ]);
    prisma.intent.findMany.mockResolvedValueOnce([]);

    await tryFormSubCrew(focalIntent({ cityArea: 'east-village' }), prisma);

    const where = prisma.intent.findMany.mock.calls[0][0].where;
    // Where clause includes OR: [{cityArea: 'east-village'}, {cityArea: null}]
    expect(where.OR).toEqual([
      { cityArea: 'east-village' },
      { cityArea: null },
    ]);
  });
});
