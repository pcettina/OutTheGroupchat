/**
 * Extended edge-case tests for Notifications API routes.
 *
 * Routes:
 *   GET   /api/notifications                     — list with pagination, filter
 *   PATCH /api/notifications                     — mark all as read
 *   PATCH /api/notifications/[notificationId]    — mark single as read
 *   DELETE /api/notifications/[notificationId]   — delete single
 *
 * Coverage intent
 * ---------------
 * This file targets scenarios NOT covered by notifications.test.ts:
 *   - Pagination (limit param, large page numbers)
 *   - unread=false query param (include read)
 *   - Invalid query param values → 400
 *   - Mark-all-read when zero unread notifications exist
 *   - Mark-all-read when Prisma count throws (500)
 *   - PATCH single: marking an already-read notification read again (idempotent)
 *   - PATCH single: explicit read:false to mark unread
 *   - PATCH single: invalid JSON body → 400
 *   - PATCH single: invalid notificationId format (non-CUID) → 400
 *   - PATCH single: DB error on update (after findUnique succeeds) → 500
 *   - DELETE: invalid notificationId format → 400
 *   - DELETE: DB error on delete (after findUnique succeeds) → 500
 *   - DELETE: missing session → 401 (auth checked after param validation)
 *   - GET: count query scoped to userId (not all unread system-wide)
 *   - GET: unreadCount independent of unread filter
 *   - GET: multiple notification types returned
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Re-declare the notification mock so this file is self-contained, matching
// the pattern used in notifications.test.ts.
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

import { GET, PATCH } from '@/app/api/notifications/route';
import {
  PATCH as patchById,
  DELETE as deleteById,
} from '@/app/api/notifications/[notificationId]/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockNotification = prisma.notification as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_NOTIF_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_NOTIF_ID_2 = 'clh7nz5vr0003mg0hb9gkfxe3';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, email: 'test@example.com', name: 'Test User' },
  expires: '2099-01-01',
};

const MOCK_NOTIFICATION_UNREAD = {
  id: MOCK_NOTIF_ID,
  userId: MOCK_USER_ID,
  type: 'TRIP_INVITATION',
  title: 'You were invited',
  message: 'Join the Paris trip',
  read: false,
  data: { tripId: 'cltrip000000000000000000' },
  createdAt: new Date('2026-04-01T10:00:00Z'),
};

const MOCK_NOTIFICATION_READ = {
  ...MOCK_NOTIFICATION_UNREAD,
  id: MOCK_NOTIF_ID_2,
  read: true,
  createdAt: new Date('2026-04-01T09:00:00Z'),
};

function makeRequest(
  path: string,
  options: { method?: string; body?: unknown; bodyRaw?: string } = {}
): Request {
  const url = `http://localhost:3000${path}`;
  const init: RequestInit = { method: options.method ?? 'GET' };

  if (options.bodyRaw !== undefined) {
    init.body = options.bodyRaw;
    init.headers = { 'Content-Type': 'application/json' };
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  return new Request(url, init);
}

async function parseJson(res: Response) {
  return res.json();
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// GET /api/notifications — extended pagination & filter edge cases
// ===========================================================================
describe('GET /api/notifications — extended edge cases', () => {
  it('respects custom limit param and passes it to findMany', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([MOCK_NOTIFICATION_UNREAD]);
    mockNotification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/notifications?limit=10'));
    expect(res.status).toBe(200);

    const callArgs = mockNotification.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });

  it('returns 400 for limit=0 (below min of 1)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeRequest('/api/notifications?limit=0'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 for limit exceeding max of 200', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeRequest('/api/notifications?limit=201'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 for page=0 (below min of 1)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeRequest('/api/notifications?page=0'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 for non-numeric page param', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeRequest('/api/notifications?page=abc'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns 400 for invalid unread param value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeRequest('/api/notifications?unread=yes'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });

  it('does NOT add read filter when unread=false is passed', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([
      MOCK_NOTIFICATION_UNREAD,
      MOCK_NOTIFICATION_READ,
    ]);
    mockNotification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/notifications?unread=false'));
    expect(res.status).toBe(200);

    const callArgs = mockNotification.findMany.mock.calls[0][0];
    // No read filter should be applied
    expect(callArgs.where.read).toBeUndefined();
  });

  it('returns multiple notifications of different types', async () => {
    const notifTrip = { ...MOCK_NOTIFICATION_UNREAD, type: 'TRIP_INVITATION' };
    const notifActivity = {
      ...MOCK_NOTIFICATION_UNREAD,
      id: MOCK_NOTIF_ID_2,
      type: 'ACTIVITY_ADDED',
      read: true,
    };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([notifTrip, notifActivity]);
    mockNotification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.notifications).toHaveLength(2);
    expect(body.data.notifications[0].type).toBe('TRIP_INVITATION');
    expect(body.data.notifications[1].type).toBe('ACTIVITY_ADDED');
  });

  it('returns unreadCount independently of the unread filter (shows total unread, not filtered set)', async () => {
    // When filtering to unread=true, count should still reflect total unread
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([MOCK_NOTIFICATION_UNREAD]);
    mockNotification.count.mockResolvedValueOnce(5);

    const res = await GET(makeRequest('/api/notifications?unread=true'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.unreadCount).toBe(5);
    // The count query must be scoped to userId
    const countArgs = mockNotification.count.mock.calls[0][0];
    expect(countArgs.where.userId).toBe(MOCK_USER_ID);
    expect(countArgs.where.read).toBe(false);
  });

  it('uses default limit of 50 when no limit param provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([]);
    mockNotification.count.mockResolvedValueOnce(0);

    await GET(makeRequest('/api/notifications'));

    const callArgs = mockNotification.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(50);
  });

  it('orders notifications by createdAt descending', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([]);
    mockNotification.count.mockResolvedValueOnce(0);

    await GET(makeRequest('/api/notifications'));

    const callArgs = mockNotification.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('returns 500 when count query throws (after findMany succeeds)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([MOCK_NOTIFICATION_UNREAD]);
    mockNotification.count.mockRejectedValueOnce(new Error('Count DB error'));

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch notifications');
  });
});

// ===========================================================================
// PATCH /api/notifications — mark-all-read edge cases
// ===========================================================================
describe('PATCH /api/notifications — mark-all-read edge cases', () => {
  it('succeeds and returns success message when there are zero unread notifications', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    // updateMany returns count:0 — no records updated
    mockNotification.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await PATCH(makeRequest('/api/notifications', { method: 'PATCH' }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('All notifications marked as read');
  });

  it('updateMany data sets read:true', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.updateMany.mockResolvedValueOnce({ count: 2 });

    await PATCH(makeRequest('/api/notifications', { method: 'PATCH' }));

    const callArgs = mockNotification.updateMany.mock.calls[0][0];
    expect(callArgs.data).toEqual({ read: true });
  });

  it('only marks notifications belonging to the session user', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.updateMany.mockResolvedValueOnce({ count: 1 });

    await PATCH(makeRequest('/api/notifications', { method: 'PATCH' }));

    const callArgs = mockNotification.updateMany.mock.calls[0][0];
    expect(callArgs.where.userId).toBe(MOCK_USER_ID);
  });
});

// ===========================================================================
// PATCH /api/notifications/[notificationId] — single-read edge cases
// ===========================================================================
describe('PATCH /api/notifications/[notificationId] — extended edge cases', () => {
  const ROUTE_PARAMS = { params: { notificationId: MOCK_NOTIF_ID } };

  it('returns 400 for a non-CUID notificationId (invalid format)', async () => {
    const req = makeRequest('/api/notifications/invalid-id', { method: 'PATCH' });
    const res = await patchById(req, { params: { notificationId: 'invalid-id' } });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid notification ID');
    // Must not reach auth check
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it('returns 400 for empty string notificationId', async () => {
    const req = makeRequest('/api/notifications/', { method: 'PATCH' });
    const res = await patchById(req, { params: { notificationId: '' } });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid notification ID');
  });

  it('returns 400 for invalid JSON body', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, {
      method: 'PATCH',
      bodyRaw: '{ not valid json',
    });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid JSON in request body');
    expect(mockNotification.update).not.toHaveBeenCalled();
  });

  it('returns 400 for body with read as a non-boolean string', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, {
      method: 'PATCH',
      body: { read: 'yes' },
    });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid input');
    expect(mockNotification.update).not.toHaveBeenCalled();
  });

  it('marks an already-read notification as read again (idempotent — still 200)', async () => {
    const alreadyRead = { ...MOCK_NOTIFICATION_UNREAD, read: true };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(alreadyRead);
    mockNotification.update.mockResolvedValueOnce(alreadyRead);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.read).toBe(true);
    expect(mockNotification.update).toHaveBeenCalledOnce();
  });

  it('can explicitly mark a notification as unread (read:false)', async () => {
    const alreadyRead = { ...MOCK_NOTIFICATION_UNREAD, read: true };
    const markedUnread = { ...alreadyRead, read: false };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(alreadyRead);
    mockNotification.update.mockResolvedValueOnce(markedUnread);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, {
      method: 'PATCH',
      body: { read: false },
    });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MOCK_NOTIF_ID },
        data: { read: false },
      })
    );
  });

  it('defaults to read:true when body is empty', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);
    mockNotification.update.mockResolvedValueOnce({ ...MOCK_NOTIFICATION_UNREAD, read: true });

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);

    expect(res.status).toBe(200);
    const callArgs = mockNotification.update.mock.calls[0][0];
    expect(callArgs.data.read).toBe(true);
  });

  it('returns 500 when update throws after successful findUnique', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);
    mockNotification.update.mockRejectedValueOnce(new Error('Update DB error'));

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update notification');
  });

  it('does not call update when notification belongs to a different user (403)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce({
      ...MOCK_NOTIFICATION_UNREAD,
      userId: MOCK_OTHER_USER_ID,
    });

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized');
    expect(mockNotification.update).not.toHaveBeenCalled();
  });

  it('returns the full updated notification object on success', async () => {
    const updated = { ...MOCK_NOTIFICATION_UNREAD, read: true };
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);
    mockNotification.update.mockResolvedValueOnce(updated);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'PATCH' });
    const res = await patchById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(MOCK_NOTIF_ID);
    expect(body.data.read).toBe(true);
    expect(body.data.userId).toBe(MOCK_USER_ID);
  });
});

// ===========================================================================
// DELETE /api/notifications/[notificationId] — extended edge cases
// ===========================================================================
describe('DELETE /api/notifications/[notificationId] — extended edge cases', () => {
  const ROUTE_PARAMS = { params: { notificationId: MOCK_NOTIF_ID } };

  it('returns 400 for a non-CUID notificationId (param validation runs before auth)', async () => {
    const req = makeRequest('/api/notifications/bad-id', { method: 'DELETE' });
    const res = await deleteById(req, { params: { notificationId: 'bad-id' } });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid notification ID');
    // Auth should not be called
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it('returns 400 for numeric-string notificationId (not a CUID)', async () => {
    const req = makeRequest('/api/notifications/12345', { method: 'DELETE' });
    const res = await deleteById(req, { params: { notificationId: '12345' } });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid notification ID');
  });

  it('returns 401 for unauthenticated request with valid CUID', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockNotification.findUnique).not.toHaveBeenCalled();
  });

  it('returns 500 when delete throws after successful findUnique', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);
    mockNotification.delete.mockRejectedValueOnce(new Error('Delete DB error'));

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to delete notification');
  });

  it('can delete an already-read notification (no restriction on read status)', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_READ);
    mockNotification.delete.mockResolvedValueOnce(MOCK_NOTIFICATION_READ);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Notification deleted');
  });

  it('calls prisma.notification.delete with the exact notificationId', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);
    mockNotification.delete.mockResolvedValueOnce(MOCK_NOTIFICATION_UNREAD);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    await deleteById(req, ROUTE_PARAMS);

    expect(mockNotification.delete).toHaveBeenCalledWith({
      where: { id: MOCK_NOTIF_ID },
    });
  });

  it('returns 403 when attempting to delete another user notification', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce({
      ...MOCK_NOTIFICATION_UNREAD,
      userId: MOCK_OTHER_USER_ID,
    });

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Unauthorized');
    expect(mockNotification.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when notification does not exist and never calls delete', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findUnique.mockResolvedValueOnce(null);

    const req = makeRequest(`/api/notifications/${MOCK_NOTIF_ID}`, { method: 'DELETE' });
    const res = await deleteById(req, ROUTE_PARAMS);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.error).toBe('Notification not found');
    expect(mockNotification.delete).not.toHaveBeenCalled();
  });
});
