/**
 * Invitation lifecycle integration tests
 * Covers: create → list → accept/decline → edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// Static imports for all route handlers
import { GET as LIST_INVITATIONS, POST as CREATE_INVITATION } from '@/app/api/invitations/route';
import {
  POST as RESPOND_INVITATION,
  GET as GET_INVITATION,
} from '@/app/api/invitations/[invitationId]/route';

// ---------------------------------------------------------------------------
// Top-level mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  apiRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/invitations', () => ({
  processInvitations: vi.fn(),
}));

import { processInvitations } from '@/lib/invitations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'clh7nz5vr0000mg0hb9gkfxe0';
const MOCK_OTHER_USER_ID = 'clh7nz5vr0001mg0hb9gkfxe1';
const MOCK_TRIP_ID = 'clh7nz5vr0002mg0hb9gkfxe2';
const MOCK_INVITATION_ID = 'clh7nz5vr0003mg0hb9gkfxe3';
const MOCK_TRIP_OWNER_ID = 'clh7nz5vr0004mg0hb9gkfxe4';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
  },
};

const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  title: 'Summer Vacation',
  ownerId: MOCK_TRIP_OWNER_ID,
  status: 'PLANNING',
  description: null,
  destination: null,
  startDate: null,
  endDate: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makePendingInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_INVITATION_ID,
    tripId: MOCK_TRIP_ID,
    userId: MOCK_USER_ID,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h in future
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    trip: MOCK_TRIP,
    ...overrides,
  };
}

function makeTripMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clh7nz5vr0005mg0hb9gkfxe5',
    tripId: MOCK_TRIP_ID,
    userId: MOCK_USER_ID,
    role: 'OWNER',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    trip: { title: 'Summer Vacation', ownerId: MOCK_TRIP_OWNER_ID },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a NextRequest
// ---------------------------------------------------------------------------
function makeRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------
describe('Invitation lifecycle integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /api/invitations — List pending invitations
  // =========================================================================
  describe('GET /api/invitations — list invitations', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const res = await LIST_INVITATIONS(makeRequest('http://localhost/api/invitations', 'GET'));
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
    });

    it('returns pending invitations for the authenticated user', async () => {
      const invitation = makePendingInvitation();

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        invitation,
      ]);
      (
        prisma.tripInvitation.updateMany as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ count: 0 });

      const res = await LIST_INVITATIONS(makeRequest('http://localhost/api/invitations', 'GET'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(MOCK_INVITATION_ID);
    });

    it('marks expired invitations with EXPIRED status in the response', async () => {
      const expiredInvitation = makePendingInvitation({
        expiresAt: new Date(Date.now() - 1000), // past
        status: 'PENDING',
      });

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        expiredInvitation,
      ]);
      (
        prisma.tripInvitation.updateMany as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ count: 1 });

      const res = await LIST_INVITATIONS(makeRequest('http://localhost/api/invitations', 'GET'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data[0].status).toBe('EXPIRED');
    });

    it('returns empty array when user has no invitations', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const res = await LIST_INVITATIONS(makeRequest('http://localhost/api/invitations', 'GET'));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(0);
    });
  });

  // =========================================================================
  // POST /api/invitations — Create invitation
  // =========================================================================
  describe('POST /api/invitations — create invitation', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        tripId: MOCK_TRIP_ID,
        emails: ['friend@example.com'],
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
    });

    it('creates invitations successfully for an OWNER of the trip', async () => {
      const processResult = {
        invitations: [{ email: 'friend@example.com', status: 'invited' }],
        errors: [],
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeTripMember()
      );
      vi.mocked(processInvitations).mockResolvedValueOnce(processResult);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        tripId: MOCK_TRIP_ID,
        emails: ['friend@example.com'],
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.invitations).toHaveLength(1);
      expect(json.data.invitations[0].email).toBe('friend@example.com');
    });

    it('returns 403 when user is not an OWNER or ADMIN of the trip', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        tripId: MOCK_TRIP_ID,
        emails: ['friend@example.com'],
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain('permission');
    });

    it('returns 400 when tripId is missing', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        emails: ['friend@example.com'],
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Validation failed');
    });

    it('returns 400 when emails array is empty', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        tripId: MOCK_TRIP_ID,
        emails: [],
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Validation failed');
    });

    it('returns 400 when an invalid email format is provided', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        tripId: MOCK_TRIP_ID,
        emails: ['not-an-email'],
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Validation failed');
    });

    it('handles duplicate emails gracefully (already a member)', async () => {
      const processResult = {
        invitations: [],
        errors: [{ email: 'existing@example.com', status: 'skipped', error: 'Already a member' }],
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeTripMember()
      );
      vi.mocked(processInvitations).mockResolvedValueOnce(processResult);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        tripId: MOCK_TRIP_ID,
        emails: ['existing@example.com'],
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.errors[0].error).toBe('Already a member');
    });

    it('accepts optional expirationHours parameter', async () => {
      const processResult = {
        invitations: [{ email: 'friend@example.com', status: 'invited' }],
        errors: [],
      };

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        makeTripMember()
      );
      vi.mocked(processInvitations).mockResolvedValueOnce(processResult);

      const req = makeRequest('http://localhost/api/invitations', 'POST', {
        tripId: MOCK_TRIP_ID,
        emails: ['friend@example.com'],
        expirationHours: 48,
      });

      const res = await CREATE_INVITATION(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(vi.mocked(processInvitations)).toHaveBeenCalledWith(
        expect.objectContaining({ expirationHours: 48 })
      );
    });
  });

  // =========================================================================
  // POST /api/invitations/[invitationId] — Accept invitation
  // =========================================================================
  describe('POST /api/invitations/[invitationId] — respond to invitation', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'accept' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
    });

    it('accepts a valid pending invitation', async () => {
      const invitation = makePendingInvitation();

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );
      (
        prisma.tripInvitation.update as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ ...invitation, status: 'ACCEPTED' });
      (prisma.tripMember.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'clh7nz5vr0006mg0hb9gkfxe6',
        tripId: MOCK_TRIP_ID,
        userId: MOCK_USER_ID,
        role: 'MEMBER',
      });
      (prisma.notification.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'clh7nz5vr0007mg0hb9gkfxe7',
      });

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'accept' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe('Invitation accepted');
      expect(json.data.tripId).toBe(MOCK_TRIP_ID);
    });

    it('declines a valid pending invitation', async () => {
      const invitation = makePendingInvitation();

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );
      (
        prisma.tripInvitation.update as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ ...invitation, status: 'DECLINED' });

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'decline' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe('Invitation declined');
    });

    it('returns 404 when invitation does not exist', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'accept' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe('Invitation not found');
    });

    it('returns 403 when invitation belongs to a different user', async () => {
      const invitation = makePendingInvitation({ userId: MOCK_OTHER_USER_ID });

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'accept' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe('This invitation is not for you');
    });

    it('returns 400 when invitation has already been accepted', async () => {
      const invitation = makePendingInvitation({ status: 'ACCEPTED' });

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'accept' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('accepted');
    });

    it('returns 400 when invitation has already been declined', async () => {
      const invitation = makePendingInvitation({ status: 'DECLINED' });

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'accept' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('declined');
    });

    it('returns 400 when invitation has expired', async () => {
      const expiredInvitation = makePendingInvitation({
        expiresAt: new Date(Date.now() - 1000), // past
        status: 'PENDING',
      });

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        expiredInvitation
      );
      (prisma.tripInvitation.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ...expiredInvitation,
        status: 'EXPIRED',
      });

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'accept' }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Invitation has expired');
    });

    it('returns 400 when action field is invalid', async () => {
      const invitation = makePendingInvitation();

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        { action: 'maybe' } // invalid
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Validation failed');
    });

    it('accepts invitation with optional budgetRange and departureCity', async () => {
      const invitation = makePendingInvitation();

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );
      (prisma.tripInvitation.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ...invitation,
        status: 'ACCEPTED',
      });
      (prisma.tripMember.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'clh7nz5vr0008mg0hb9gkfxe8',
        tripId: MOCK_TRIP_ID,
        userId: MOCK_USER_ID,
        role: 'MEMBER',
        budgetRange: { min: 500, max: 1500, currency: 'USD' },
        departureCity: 'New York',
      });
      (prisma.notification.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'clh7nz5vr0009mg0hb9gkfxe9',
      });

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'POST',
        {
          action: 'accept',
          budgetRange: { min: 500, max: 1500, currency: 'USD' },
          departureCity: 'New York',
        }
      );

      const res = await RESPOND_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.message).toBe('Invitation accepted');
      expect(prisma.tripMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            departureCity: 'New York',
          }),
        })
      );
    });
  });

  // =========================================================================
  // GET /api/invitations/[invitationId] — Get invitation details
  // =========================================================================
  describe('GET /api/invitations/[invitationId] — get invitation details', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'GET'
      );

      const res = await GET_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
    });

    it('returns invitation details for the correct user', async () => {
      const invitation = makePendingInvitation();

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'GET'
      );

      const res = await GET_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(MOCK_INVITATION_ID);
    });

    it('returns 404 when invitation does not exist', async () => {
      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'GET'
      );

      const res = await GET_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe('Invitation not found');
    });

    it('returns 403 when invitation belongs to a different user', async () => {
      const invitation = makePendingInvitation({ userId: MOCK_OTHER_USER_ID });

      vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
      (prisma.tripInvitation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invitation
      );

      const req = makeRequest(
        `http://localhost/api/invitations/${MOCK_INVITATION_ID}`,
        'GET'
      );

      const res = await GET_INVITATION(req, {
        params: { invitationId: MOCK_INVITATION_ID },
      });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe('This invitation is not for you');
    });
  });
});
