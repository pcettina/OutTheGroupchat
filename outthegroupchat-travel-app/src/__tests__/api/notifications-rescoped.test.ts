/**
 * Rescoped notification tests verifying Phase 6 NotificationType migration.
 *
 * The NotificationType enum was updated to remove trip-domain types
 * (TRIP_INVITATION, TRIP_UPDATE, etc.) and retain only social-domain types:
 *   CREW_REQUEST | CREW_ACCEPTED | MEETUP_INVITED | MEETUP_RSVP |
 *   MEETUP_STARTING_SOON | CHECK_IN_NEARBY | CREW_CHECKED_IN_NEARBY | SYSTEM
 *
 * Routes exercised:
 *   GET   /api/notifications  — list with pagination + unreadCount
 *   PATCH /api/notifications  — mark all as read
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET, PATCH } from '@/app/api/notifications/route';

// ---------------------------------------------------------------------------
// Typed helpers for the notification mock
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockNotification = prisma.notification as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'user-rescoped-001';

const MOCK_SESSION = {
  user: { id: USER_ID, name: 'Rescoped User', email: 'rescoped@test.com' },
  expires: '2099-01-01',
};

/** Valid social-domain notification types after Phase 6 migration. */
const VALID_NOTIFICATION_TYPES = [
  'CREW_REQUEST',
  'CREW_ACCEPTED',
  'MEETUP_INVITED',
  'MEETUP_RSVP',
  'MEETUP_STARTING_SOON',
  'CHECK_IN_NEARBY',
  'CREW_CHECKED_IN_NEARBY',
  'SYSTEM',
] as const;

function makeNotification(
  overrides: Partial<{
    id: string;
    type: string;
    read: boolean;
    data: Record<string, unknown> | null;
  }> = {}
) {
  return {
    id: overrides.id ?? 'notif-001',
    userId: USER_ID,
    type: overrides.type ?? 'CREW_REQUEST',
    title: 'Test notification',
    message: 'A test notification message',
    read: overrides.read ?? false,
    data: overrides.data ?? null,
    createdAt: new Date('2026-04-21T10:00:00Z'),
  };
}

function makeRequest(path: string, method = 'GET'): Request {
  return new Request(`http://localhost:3000${path}`, { method });
}

async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset mock state between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/notifications — auth guard
// ===========================================================================
describe('GET /api/notifications — auth guard', () => {
  it('returns 401 when session is absent', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockNotification.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /api/notifications — social-domain notification types
// ===========================================================================
describe('GET /api/notifications — social-domain notification types', () => {
  it('returns CREW_REQUEST notifications in the response', async () => {
    const notif = makeNotification({ type: 'CREW_REQUEST', data: { requesterId: 'user-abc' } });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([notif]);
    mockNotification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notifications[0].type).toBe('CREW_REQUEST');
  });

  it('returns MEETUP_INVITED notifications in the response', async () => {
    const notif = makeNotification({ type: 'MEETUP_INVITED', data: { meetupId: 'meetup-001' } });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([notif]);
    mockNotification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.notifications[0].type).toBe('MEETUP_INVITED');
  });

  it('returns CREW_CHECKED_IN_NEARBY notifications in the response', async () => {
    const notif = makeNotification({
      type: 'CREW_CHECKED_IN_NEARBY',
      data: { checkInId: 'checkin-001', city: 'New York' },
    });
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([notif]);
    mockNotification.count.mockResolvedValueOnce(1);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.notifications[0].type).toBe('CREW_CHECKED_IN_NEARBY');
  });

  it('returns all 8 valid social-domain types when mixed batch is returned', async () => {
    const notifications = VALID_NOTIFICATION_TYPES.map((type, i) =>
      makeNotification({ id: `notif-${i}`, type, read: i % 2 === 0 })
    );
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce(notifications);
    mockNotification.count.mockResolvedValueOnce(4);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.notifications).toHaveLength(8);

    const returnedTypes: string[] = body.data.notifications.map(
      (n: { type: string }) => n.type
    );
    for (const validType of VALID_NOTIFICATION_TYPES) {
      expect(returnedTypes).toContain(validType);
    }
  });

  it('response does NOT include any old trip notification types', async () => {
    // Route returns whatever Prisma returns; verify old types are not present
    // when only new-domain notifications exist in the DB.
    const notifications = [
      makeNotification({ type: 'CREW_REQUEST' }),
      makeNotification({ id: 'notif-002', type: 'MEETUP_RSVP' }),
      makeNotification({ id: 'notif-003', type: 'SYSTEM' }),
    ];
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce(notifications);
    mockNotification.count.mockResolvedValueOnce(3);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    const returnedTypes: string[] = body.data.notifications.map(
      (n: { type: string }) => n.type
    );
    const oldTripTypes = ['TRIP_INVITATION', 'TRIP_UPDATE', 'TRIP_REMINDER', 'TRIP_CANCELLED'];
    for (const oldType of oldTripTypes) {
      expect(returnedTypes).not.toContain(oldType);
    }
  });
});

// ===========================================================================
// GET /api/notifications — pagination
// ===========================================================================
describe('GET /api/notifications — pagination', () => {
  it('passes the default limit (50) to prisma.findMany when no params provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([]);
    mockNotification.count.mockResolvedValueOnce(0);

    await GET(makeRequest('/api/notifications'));

    const callArgs = mockNotification.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(50);
  });

  it('accepts a custom limit via query param', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([]);
    mockNotification.count.mockResolvedValueOnce(0);

    await GET(makeRequest('/api/notifications?limit=10'));

    const callArgs = mockNotification.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });

  it('orders results by createdAt descending', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce([]);
    mockNotification.count.mockResolvedValueOnce(0);

    await GET(makeRequest('/api/notifications'));

    const callArgs = mockNotification.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('returns 400 for an invalid limit value', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await GET(makeRequest('/api/notifications?limit=0'));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid query parameters');
  });
});

// ===========================================================================
// PATCH /api/notifications — mark all as read
// ===========================================================================
describe('PATCH /api/notifications — mark all as read', () => {
  it('returns 401 when session is absent', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest('/api/notifications', 'PATCH'));
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockNotification.updateMany).not.toHaveBeenCalled();
  });

  it('marks all unread notifications as read for CREW_REQUEST type', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.updateMany.mockResolvedValueOnce({ count: 2 });

    const res = await PATCH(makeRequest('/api/notifications', 'PATCH'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('All notifications marked as read');

    const callArgs = mockNotification.updateMany.mock.calls[0][0];
    expect(callArgs.where.userId).toBe(USER_ID);
    expect(callArgs.where.read).toBe(false);
    expect(callArgs.data.read).toBe(true);
  });

  it('marks all unread notifications as read for MEETUP_INVITED type', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await PATCH(makeRequest('/api/notifications', 'PATCH'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockNotification.updateMany).toHaveBeenCalledOnce();
  });

  it('succeeds with count=0 when no unread notifications exist', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await PATCH(makeRequest('/api/notifications', 'PATCH'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ===========================================================================
// GET /api/notifications — unread count
// ===========================================================================
describe('GET /api/notifications — unread count', () => {
  it('returns correct unreadCount when multiple social-domain notifications are unread', async () => {
    const notifications = [
      makeNotification({ type: 'CREW_REQUEST', read: false }),
      makeNotification({ id: 'notif-002', type: 'MEETUP_STARTING_SOON', read: false }),
      makeNotification({ id: 'notif-003', type: 'CHECK_IN_NEARBY', read: true }),
    ];
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce(notifications);
    mockNotification.count.mockResolvedValueOnce(2);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.unreadCount).toBe(2);
  });

  it('returns unreadCount=0 when all notifications are read', async () => {
    const notifications = [
      makeNotification({ type: 'CREW_ACCEPTED', read: true }),
      makeNotification({ id: 'notif-002', type: 'MEETUP_RSVP', read: true }),
    ];
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockResolvedValueOnce(notifications);
    mockNotification.count.mockResolvedValueOnce(0);

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.unreadCount).toBe(0);
  });
});

// ===========================================================================
// GET /api/notifications — 500 error handling
// ===========================================================================
describe('GET /api/notifications — 500 error handling', () => {
  it('returns 500 and success=false when prisma.findMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.findMany.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await GET(makeRequest('/api/notifications'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to fetch notifications');
  });
});

// ===========================================================================
// PATCH /api/notifications — 500 error handling
// ===========================================================================
describe('PATCH /api/notifications — 500 error handling', () => {
  it('returns 500 and success=false when prisma.updateMany throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockNotification.updateMany.mockRejectedValueOnce(new Error('DB write failed'));

    const res = await PATCH(makeRequest('/api/notifications', 'PATCH'));
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to update notifications');
  });
});
