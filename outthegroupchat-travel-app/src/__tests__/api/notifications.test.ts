/**
 * Unit tests for the Notifications API route handlers.
 *
 * Routes:
 *   GET  /api/notifications            — list notifications for the current user
 *   PATCH /api/notifications           — mark all notifications as read
 *   PATCH /api/notifications/[id]      — mark a single notification as read
 *   DELETE /api/notifications/[id]     — delete a single notification
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger) are mocked in
 *   src/__tests__/setup.ts.  This file extends those mocks with the
 *   additional notification methods the handlers require: findMany, count,
 *   updateMany, findUnique, update, and delete.
 * - Handlers are called directly with a minimal Request built from the
 *   web-platform APIs available in the Vitest node environment.
 * - The [notificationId] route receives params as a plain object (not a
 *   Promise) matching the shape used by that route file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Extend the global prisma mock with the notification methods required by
// these route handlers.
vi.mock('@/lib/prisma', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/prisma')>();
  return {
    ...original,
    prisma: {
      ...original.prisma,
      notification: {
        findMany: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

// Import handlers after the mock declaration.
import { GET, PATCH } from '@/app/api/notifications/route';
import {
  PATCH as patchById,
  DELETE as deleteById,
} from '@/app/api/notifications/[notificationId]/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockPrismaNotification = prisma.notification as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-notif-111';
const MOCK_OTHER_USER_ID = 'user-notif-999';
const MOCK_NOTIF_ID = 'notif-abc-222';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Notif Tester',
    email: 'notif@example.com',
  },
  expires: '2099-01-01',
};

/** A minimal notification row as Prisma would return it. */
const MOCK_NOTIFICATION = {
  id: MOCK_NOTIF_ID,
  userId: MOCK_USER_ID,
  type: 'TRIP_INVITATION',
  title: 'Trip Invitation',
  message: 'You have been invited to join "Paris Trip"!',
  read: false,
  data: { tripId: 'trip-001' },
  createdAt: new Date('2026-03-01'),
};

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

/** Parse JSON from a NextResponse-compatible Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests to prevent state leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/notifications
// ===========================================================================
describe('GET /api/notifications', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaNotification.findMany).not.toHaveBeenCalled();
  });

  it('returns notifications and unreadCount for the authenticated user', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([MOCK_NOTIFICATION]);
    mockPrismaNotification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.notifications[0].id).toBe(MOCK_NOTIF_ID);
    expect(body.data.unreadCount).toBe(1);
  });

  it('queries notifications scoped to the session user id', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.count.mockResolvedValueOnce(0);

    await GET(makeRequest('/api/notifications'));

    const callArgs = mockPrismaNotification.findMany.mock.calls[0][0];
    expect(callArgs.where.userId).toBe(MOCK_USER_ID);
  });

  it('filters to unread-only when ?unread=true is passed', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.count.mockResolvedValueOnce(0);

    await GET(makeRequest('/api/notifications?unread=true'));

    const callArgs = mockPrismaNotification.findMany.mock.calls[0][0];
    expect(callArgs.where.read).toBe(false);
  });

  it('returns 200 with empty notifications list when none exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockResolvedValueOnce([]);
    mockPrismaNotification.count.mockResolvedValueOnce(0);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications).toEqual([]);
    expect(body.data.unreadCount).toBe(0);
  });

  it('returns 500 when Prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findMany.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// PATCH /api/notifications  (mark all as read)
// ===========================================================================
describe('PATCH /api/notifications', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest('/api/notifications', { method: 'PATCH' }));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaNotification.updateMany).not.toHaveBeenCalled();
  });

  it('marks all unread notifications as read for the authenticated user', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.updateMany.mockResolvedValueOnce({ count: 3 });

    const res = await PATCH(makeRequest('/api/notifications', { method: 'PATCH' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('All notifications marked as read');
    expect(mockPrismaNotification.updateMany).toHaveBeenCalledOnce();
  });

  it('passes the correct where clause to updateMany', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.updateMany.mockResolvedValueOnce({ count: 0 });

    await PATCH(makeRequest('/api/notifications', { method: 'PATCH' }));

    const callArgs = mockPrismaNotification.updateMany.mock.calls[0][0];
    expect(callArgs.where.userId).toBe(MOCK_USER_ID);
    expect(callArgs.where.read).toBe(false);
    expect(callArgs.data.read).toBe(true);
  });

  it('returns 500 when Prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.updateMany.mockRejectedValueOnce(new Error('DB error'));

    const res = await PATCH(makeRequest('/api/notifications', { method: 'PATCH' }));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// PATCH /api/notifications/[notificationId]  (mark single as read)
// ===========================================================================
describe('PATCH /api/notifications/[notificationId]', () => {
  const ROUTE_PARAMS = { params: { notificationId: MOCK_NOTIF_ID } };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaNotification.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when the notification does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Notification not found');
    expect(mockPrismaNotification.update).not.toHaveBeenCalled();
  });

  it('returns 403 when the notification belongs to a different user', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // The notification's userId does not match the session user
    mockPrismaNotification.findUnique.mockResolvedValueOnce({
      ...MOCK_NOTIFICATION,
      userId: MOCK_OTHER_USER_ID,
    });

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaNotification.update).not.toHaveBeenCalled();
  });

  it('marks the notification as read and returns the updated record', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION);
    const updatedNotification = { ...MOCK_NOTIFICATION, read: true };
    mockPrismaNotification.update.mockResolvedValueOnce(updatedNotification);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(MOCK_NOTIF_ID);
    expect(mockPrismaNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_NOTIF_ID },
        data: { read: true },
      })
    );
  });

  it('returns 500 when Prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findUnique.mockRejectedValueOnce(new Error('DB error'));

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// DELETE /api/notifications/[notificationId]
// ===========================================================================
describe('DELETE /api/notifications/[notificationId]', () => {
  const ROUTE_PARAMS = { params: { notificationId: MOCK_NOTIF_ID } };

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaNotification.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the notification does not exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(mockPrismaNotification.delete).not.toHaveBeenCalled();
  });

  it('returns 403 when the notification belongs to a different user', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findUnique.mockResolvedValueOnce({
      ...MOCK_NOTIFICATION,
      userId: MOCK_OTHER_USER_ID,
    });

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockPrismaNotification.delete).not.toHaveBeenCalled();
  });

  it('deletes the notification and returns success message', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION);
    mockPrismaNotification.delete.mockResolvedValueOnce(MOCK_NOTIFICATION);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Notification deleted');
    expect(mockPrismaNotification.delete).toHaveBeenCalledWith({
      where: { id: MOCK_NOTIF_ID },
    });
  });
});
