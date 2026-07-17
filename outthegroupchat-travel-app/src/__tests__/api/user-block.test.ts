/**
 * Unit tests for the user block/unblock API (Day 5 — Trust & Safety I).
 *
 * Route covered:
 *   POST   /api/users/[userId]/block   — block a user (idempotent, severs Crew edge)
 *   DELETE /api/users/[userId]/block   — unblock a user (idempotent)
 *
 * The Prisma (incl. `userBlock` + array-form `$transaction`), NextAuth, logger,
 * and sentry mocks are defined in src/__tests__/setup.ts. This file additionally
 * mocks @/lib/rate-limit to avoid any real Upstash calls.
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

import { POST as blockPOST, DELETE as unblockDELETE } from '@/app/api/users/[userId]/block/route';
import { checkRateLimit } from '@/lib/rate-limit';

const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockGetServerSession = vi.mocked(getServerSession);

const mockPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};
const mockPrismaUserBlock = prisma.userBlock as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};
const mockPrismaCrew = prisma.crew as unknown as {
  deleteMany: ReturnType<typeof vi.fn>;
};
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures — userIds chosen so that A < B lexicographically
// ---------------------------------------------------------------------------
const USER_A = 'user-aaa-1111';
const USER_B = 'user-bbb-2222';

const sessionFor = (id: string, name = 'Tester') => ({
  user: { id, name, email: `${id}@example.com` },
  expires: '2099-01-01',
});

// prisma.crew.deleteMany is not present on the shared setup mock (only
// findFirst/findMany/create/update/delete/upsert/count/findUnique are), so add
// it here. Reassigned in beforeEach because vi.resetAllMocks() wipes it.
beforeEach(() => {
  vi.resetAllMocks();
  // Re-establish the permanent rate-limit pass-through mock after reset.
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0,
  });
  // crew.deleteMany is used by the block transaction but is not declared on the
  // shared prisma mock — arm it as a vi.fn each run.
  mockPrismaCrew.deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  // vi.resetAllMocks() wipes the array-form $transaction implementation defined
  // in setup.ts, so re-arm it here (mirrors sibling transaction tests).
  mockTransaction.mockImplementation(async (writes: unknown) => {
    if (Array.isArray(writes)) {
      return Promise.all(writes.map((w) => Promise.resolve(w)));
    }
    return writes;
  });
});

// ===========================================================================
// POST /api/users/[userId]/block
// ===========================================================================
describe('POST /api/users/[userId]/block', () => {
  const makeReq = (userId: string) =>
    new NextRequest(`http://localhost/api/users/${userId}/block`, { method: 'POST' });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await blockPOST(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(401);
  });

  it('returns 400 when blocking self', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await blockPOST(makeReq(USER_A), { params: { userId: USER_A } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when target user does not exist', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);
    const res = await blockPOST(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await blockPOST(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(429);
  });

  it('blocks the target (200), upserts the block, and severs the Crew edge', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUser.findUnique.mockResolvedValueOnce({ id: USER_B });
    mockPrismaUserBlock.upsert.mockResolvedValueOnce({
      id: 'block-1',
      blockerId: USER_A,
      blockedId: USER_B,
    });
    mockPrismaCrew.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await blockPOST(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ blockerId: USER_A, blockedId: USER_B });

    // upsert keyed on the blocker/blocked pair
    expect(mockPrismaUserBlock.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockPrismaUserBlock.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.where).toEqual({
      blockerId_blockedId: { blockerId: USER_A, blockedId: USER_B },
    });
    expect(upsertArg?.create).toEqual({ blockerId: USER_A, blockedId: USER_B });

    // Crew edge severed with lexicographically-sorted pair (A < B)
    expect(mockPrismaCrew.deleteMany).toHaveBeenCalledTimes(1);
    const deleteArg = mockPrismaCrew.deleteMany.mock.calls[0]?.[0];
    expect(deleteArg?.where).toEqual({ userAId: USER_A, userBId: USER_B });
  });

  it('sorts the Crew pair when blocker ID is > blocked ID', async () => {
    // blocker B, blocked A → crew edge stored as userAId=A, userBId=B
    mockGetServerSession.mockResolvedValue(sessionFor(USER_B));
    mockPrismaUser.findUnique.mockResolvedValueOnce({ id: USER_A });
    mockPrismaUserBlock.upsert.mockResolvedValueOnce({
      id: 'block-2',
      blockerId: USER_B,
      blockedId: USER_A,
    });
    mockPrismaCrew.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await blockPOST(makeReq(USER_A), { params: { userId: USER_A } });
    expect(res.status).toBe(200);
    const deleteArg = mockPrismaCrew.deleteMany.mock.calls[0]?.[0];
    expect(deleteArg?.where).toEqual({ userAId: USER_A, userBId: USER_B });
  });

  it('is idempotent — blocking an already-blocked user still returns 200', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUser.findUnique.mockResolvedValueOnce({ id: USER_B });
    // upsert.update:{} is a no-op — returns the existing row
    mockPrismaUserBlock.upsert.mockResolvedValueOnce({
      id: 'block-1',
      blockerId: USER_A,
      blockedId: USER_B,
    });
    mockPrismaCrew.deleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await blockPOST(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaUserBlock.upsert).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// DELETE /api/users/[userId]/block
// ===========================================================================
describe('DELETE /api/users/[userId]/block', () => {
  const makeReq = (userId: string) =>
    new NextRequest(`http://localhost/api/users/${userId}/block`, { method: 'DELETE' });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await unblockDELETE(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(401);
  });

  it('returns 400 when unblocking self', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    const res = await unblockDELETE(makeReq(USER_A), { params: { userId: USER_A } });
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: 0,
    });
    const res = await unblockDELETE(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(429);
  });

  it('unblocks the target (200) and deletes the block row', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    mockPrismaUserBlock.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await unblockDELETE(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaUserBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: USER_A, blockedId: USER_B },
    });
  });

  it('is idempotent — unblocking a not-blocked user still returns 200', async () => {
    mockGetServerSession.mockResolvedValue(sessionFor(USER_A));
    // deleteMany is a no-op when no row exists
    mockPrismaUserBlock.deleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await unblockDELETE(makeReq(USER_B), { params: { userId: USER_B } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockPrismaUserBlock.deleteMany).toHaveBeenCalledTimes(1);
  });
});
