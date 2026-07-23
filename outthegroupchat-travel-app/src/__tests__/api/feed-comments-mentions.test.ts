/**
 * Unit tests for the @mention notification path of POST /api/feed/comments.
 *
 * The mention step (route.ts, "Fail-soft @mention notifications" block) runs AFTER
 * the comment is created and the item-owner notification is sent. It:
 *   1. extracts tokens from the comment text,
 *   2. resolves them to users via prisma.user.findMany (case-insensitive name),
 *   3. excludes the comment author and the already-notified item owner,
 *   4. writes SYSTEM notifications with data.kind === 'MENTION' via
 *      prisma.notification.createMany,
 *   5. never fails the request if any of that throws (fail-soft).
 *
 * Strategy
 * --------
 * All external deps (Prisma, NextAuth, logger, sentry) are mocked globally in
 * src/__tests__/setup.ts. The global prisma mock already exposes user.findMany,
 * notification.create and notification.createMany as fresh vi.fn()s, so no local
 * prisma re-mock is needed. This route does NOT use @/lib/rate-limit, so no
 * rate-limit mock is required either.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

import { POST as commentsPOST } from '@/app/api/feed/comments/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaActivityComment = vi.mocked(prisma.activityComment);
const mockPrismaUser = vi.mocked(prisma.user);
const mockPrismaNotification = vi.mocked(prisma.notification);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const AUTHOR_ID = 'user-author-001';
const OWNER_ID = 'user-owner-002';
const BOB_ID = 'user-bob-003';
const TRIP_ID = 'trip-mention-333';
const ACTIVITY_ID = 'activity-mention-444';
const COMMENT_ID = 'comment-mention-555';

const MOCK_SESSION = {
  user: {
    id: AUTHOR_ID,
    name: 'Alice',
    email: 'alice@example.com',
  },
  expires: '2099-01-01',
};

const MOCK_CREATED_AT = new Date('2026-03-01T10:00:00Z');

/** Build a minimal Request accepted by the App Router handlers. */
function makeRequest(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  return new Request(url, init);
}

async function parseJson(res: Response) {
  return res.json();
}

/**
 * Arrange the happy-path prisma stubs for an activity comment whose trip is
 * owned by OWNER_ID (distinct from the author), so the owner notification fires.
 */
function arrangeActivityComment(text: string) {
  mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

  mockPrismaActivity.findUnique.mockResolvedValueOnce({
    id: ACTIVITY_ID,
    tripId: TRIP_ID,
    trip: { ownerId: OWNER_ID, title: 'Tokyo Adventure' },
  } as unknown as Awaited<ReturnType<typeof prisma.activity.findUnique>>);

  mockPrismaActivityComment.create.mockResolvedValueOnce({
    id: COMMENT_ID,
    text,
    createdAt: MOCK_CREATED_AT,
    user: { id: AUTHOR_ID, name: 'Alice', image: null },
  } as unknown as Awaited<ReturnType<typeof prisma.activityComment.create>>);

  // Owner notification (create) succeeds.
  mockPrismaNotification.create.mockResolvedValueOnce({} as never);
}

function postComment(text: string) {
  return commentsPOST(
    makeRequest('/api/feed/comments', {
      method: 'POST',
      body: { itemId: ACTIVITY_ID, itemType: 'activity', text },
    })
  );
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to avoid state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/feed/comments — @mention notifications', () => {
  it('resolves @Name via user.findMany and notifies via createMany with SYSTEM/MENTION', async () => {
    arrangeActivityComment('@Bob check this out');
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: BOB_ID, name: 'Bob' },
    ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);
    mockPrismaNotification.createMany.mockResolvedValueOnce({ count: 1 } as never);

    const res = await postComment('@Bob check this out');
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // Tokens were resolved against User.name.
    expect(mockPrismaUser.findMany).toHaveBeenCalledOnce();

    // A mention notification was written for Bob with the right shape.
    expect(mockPrismaNotification.createMany).toHaveBeenCalledOnce();
    const arg = mockPrismaNotification.createMany.mock.calls[0][0] as unknown as {
      data: Array<{
        userId: string;
        type: string;
        data: { kind: string };
      }>;
    };
    expect(Array.isArray(arg.data)).toBe(true);
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0].userId).toBe(BOB_ID);
    expect(arg.data[0].type).toBe('SYSTEM');
    expect(arg.data[0].data.kind).toBe('MENTION');
  });

  it('never self-notifies the comment author even if they @-mention themselves', async () => {
    arrangeActivityComment('note to self @Alice remember this');
    // findMany resolves the author's own user row.
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: AUTHOR_ID, name: 'Alice' },
    ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);

    const res = await postComment('note to self @Alice remember this');
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Author is filtered out -> no mention notification is written.
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('does not double-notify the item owner already notified by the owner block', async () => {
    arrangeActivityComment('great work @Owner');
    // The mentioned name resolves to the trip owner, who was already notified
    // via notification.create in the owner block.
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: OWNER_ID, name: 'Owner' },
    ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);

    const res = await postComment('great work @Owner');
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Owner already got a notification.create; the mention path must skip them.
    expect(mockPrismaNotification.create).toHaveBeenCalledOnce();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
  });

  it('does not call the mention createMany when the text has no mentions', async () => {
    arrangeActivityComment('just a plain comment with no mentions');

    const res = await postComment('just a plain comment with no mentions');
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // No tokens -> user.findMany and createMany are never reached.
    expect(mockPrismaUser.findMany).not.toHaveBeenCalled();
    expect(mockPrismaNotification.createMany).not.toHaveBeenCalled();
    // The owner notification still fires independently.
    expect(mockPrismaNotification.create).toHaveBeenCalledOnce();
  });

  it('is fail-soft: still returns success when createMany rejects', async () => {
    arrangeActivityComment('@Bob heads up');
    mockPrismaUser.findMany.mockResolvedValueOnce([
      { id: BOB_ID, name: 'Bob' },
    ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);
    mockPrismaNotification.createMany.mockRejectedValueOnce(
      new Error('createMany blew up')
    );

    const res = await postComment('@Bob heads up');
    const body = await parseJson(res);

    // The mention failure is swallowed; the POST still succeeds.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.comment.id).toBe(COMMENT_ID);
    expect(mockPrismaNotification.createMany).toHaveBeenCalledOnce();
  });
});
