/**
 * Unit tests for POST /api/invitations
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, logger, processInvitations)
 *   are mocked in src/__tests__/setup.ts.
 * - The POST handler is called directly with NextRequest objects.
 * - Each test resets all mocks via vi.resetAllMocks() in beforeEach and sets
 *   up its own mock responses using mockResolvedValueOnce().
 *
 * Coverage
 * --------
 * - 401 when no session
 * - 400 Zod validation: missing tripId, missing emails array, empty emails,
 *   invalid email format, negative expirationHours
 * - 403 when user is not an OWNER or ADMIN of the trip
 * - 200 success case with invitation data returned
 * - 200 success with optional expirationHours
 * - 500 when prisma.tripMember.findFirst throws
 * - 500 when processInvitations throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { processInvitations } from '@/lib/invitations';

// ---------------------------------------------------------------------------
// Static import of the route handler under test
// ---------------------------------------------------------------------------
import { POST as invitationsPOST } from '@/app/api/invitations/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockProcessInvitations = vi.mocked(processInvitations);
const mockPrismaTripMember = vi.mocked(prisma.tripMember);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-post-inv-001';
const MOCK_TRIP_ID = 'trip-post-inv-abc';

const MOCK_SESSION = {
  user: {
    id: MOCK_USER_ID,
    name: 'Post Invite Tester',
    email: 'poster@example.com',
  },
  expires: '2099-01-01',
};

const MOCK_TRIP_MEMBER_OWNER = {
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'OWNER',
  trip: {
    title: 'Barcelona Getaway',
    ownerId: MOCK_USER_ID,
  },
} as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>;

const MOCK_PROCESS_RESULT = {
  invitations: [
    { email: 'friend@example.com', status: 'sent', message: 'Invitation created' },
  ],
  errors: [],
};

// ---------------------------------------------------------------------------
// Helper: build a NextRequest for the POST /api/invitations endpoint
// ---------------------------------------------------------------------------
function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/invitations', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Reset all mocks before each test to prevent state leakage
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// POST /api/invitations
// ===========================================================================
describe('POST /api/invitations', () => {
  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Zod validation errors
  // -------------------------------------------------------------------------
  it('returns 400 when tripId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makePostRequest({ emails: ['friend@example.com'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when emails array is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when emails array is empty', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: [] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when an email in the array is not a valid email address', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['not-an-email'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when tripId is an empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makePostRequest({ tripId: '', emails: ['friend@example.com'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when expirationHours is not a positive integer', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const req = makePostRequest({
      tripId: MOCK_TRIP_ID,
      emails: ['friend@example.com'],
      expirationHours: -5,
    });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Authorization: trip membership check
  // -------------------------------------------------------------------------
  it('returns 403 when the user is not an OWNER or ADMIN of the trip', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('You do not have permission to invite members to this trip');
    expect(mockPrismaTripMember.findFirst).toHaveBeenCalledOnce();
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('passes the correct where clause to tripMember.findFirst', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    await invitationsPOST(req);

    expect(mockPrismaTripMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tripId: MOCK_TRIP_ID,
          userId: MOCK_USER_ID,
          role: { in: ['OWNER', 'ADMIN'] },
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Success cases
  // -------------------------------------------------------------------------
  it('returns 200 with invitation data on success', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockResolvedValueOnce(MOCK_PROCESS_RESULT);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(MOCK_PROCESS_RESULT);
    expect(body.data.invitations).toHaveLength(1);
    expect(body.data.invitations[0].email).toBe('friend@example.com');
  });

  it('calls processInvitations with correct parameters', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockResolvedValueOnce(MOCK_PROCESS_RESULT);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    await invitationsPOST(req);

    expect(mockProcessInvitations).toHaveBeenCalledOnce();
    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: MOCK_TRIP_ID,
        tripTitle: 'Barcelona Getaway',
        emails: ['friend@example.com'],
        inviterId: MOCK_USER_ID,
      })
    );
  });

  it('returns 200 with multiple emails processed', async () => {
    const multiEmailResult = {
      invitations: [
        { email: 'a@example.com', status: 'sent' },
        { email: 'b@example.com', status: 'sent' },
      ],
      errors: [],
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockResolvedValueOnce(multiEmailResult);

    const req = makePostRequest({
      tripId: MOCK_TRIP_ID,
      emails: ['a@example.com', 'b@example.com'],
    });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.invitations).toHaveLength(2);
  });

  it('passes expirationHours to processInvitations when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockResolvedValueOnce(MOCK_PROCESS_RESULT);

    const req = makePostRequest({
      tripId: MOCK_TRIP_ID,
      emails: ['friend@example.com'],
      expirationHours: 48,
    });
    await invitationsPOST(req);

    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ expirationHours: 48 })
    );
  });

  it('returns 200 when processInvitations returns partial errors', async () => {
    const partialResult = {
      invitations: [{ email: 'good@example.com', status: 'sent' }],
      errors: [{ email: 'bad@example.com', status: 'error', error: 'Already member' }],
    };

    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockResolvedValueOnce(partialResult);

    const req = makePostRequest({
      tripId: MOCK_TRIP_ID,
      emails: ['good@example.com', 'bad@example.com'],
    });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.invitations).toHaveLength(1);
    expect(body.data.errors).toHaveLength(1);
  });

  it('uses the session user name as inviterName', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockResolvedValueOnce(MOCK_PROCESS_RESULT);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    await invitationsPOST(req);

    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: 'Post Invite Tester' })
    );
  });

  it('falls back to "A trip organizer" as inviterName when session name is null', async () => {
    const sessionWithoutName = {
      ...MOCK_SESSION,
      user: { ...MOCK_SESSION.user, name: null },
    };

    mockGetServerSession.mockResolvedValueOnce(sessionWithoutName);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockResolvedValueOnce(MOCK_PROCESS_RESULT);

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    await invitationsPOST(req);

    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: 'A trip organizer' })
    );
  });

  // -------------------------------------------------------------------------
  // Server error cases
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.tripMember.findFirst throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to create invitations');
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('returns 500 when processInvitations throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_TRIP_MEMBER_OWNER);
    mockProcessInvitations.mockRejectedValueOnce(new Error('Email service unavailable'));

    const req = makePostRequest({ tripId: MOCK_TRIP_ID, emails: ['friend@example.com'] });
    const res = await invitationsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Failed to create invitations');
  });
});
