/**
 * Unit tests for GET /api/trips/[tripId]/invitations
 *                 POST /api/trips/[tripId]/invitations
 *
 * Strategy
 * --------
 * - All external dependencies (Prisma, NextAuth, processInvitations) are mocked
 *   via setup.ts.
 * - Each test sets up its own mocks using mockResolvedValueOnce to prevent
 *   state from leaking between tests.
 * - The invitations route awaits params (Promise<{ tripId }>), so we pass
 *   Promise.resolve({ tripId }) as the params argument.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { processInvitations } from '@/lib/invitations';

import { GET, POST } from '@/app/api/trips/[tripId]/invitations/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockProcessInvitations = vi.mocked(processInvitations);

const mockPrismaTripMember = vi.mocked(prisma.tripMember) as typeof prisma.tripMember & {
  findFirst: ReturnType<typeof vi.fn>;
};

const mockPrismaTripInvitation = vi.mocked(prisma.tripInvitation) as typeof prisma.tripInvitation & {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

const mockPrismaTrip = vi.mocked(prisma.trip) as typeof prisma.trip & {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user-inv-001';
const MOCK_TRIP_ID = 'trip-inv-001';
const MOCK_OTHER_USER_ID = 'user-inv-002';

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, name: 'Invite Tester', email: 'invitetester@example.com' },
  expires: '2099-01-01',
};

const MOCK_TRIP = {
  id: MOCK_TRIP_ID,
  ownerId: MOCK_USER_ID,
  title: 'Test Trip',
};

const MOCK_TRIP_OTHER_OWNER = {
  id: MOCK_TRIP_ID,
  ownerId: MOCK_OTHER_USER_ID,
  title: 'Other Owner Trip',
};

const MOCK_MEMBER_ROW = {
  id: 'member-row-inv-001',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'MEMBER',
  joinedAt: new Date('2026-01-01'),
};

const MOCK_ADMIN_MEMBERSHIP = {
  id: 'member-row-inv-001',
  tripId: MOCK_TRIP_ID,
  userId: MOCK_USER_ID,
  role: 'ADMIN',
  joinedAt: new Date('2026-01-01'),
};

const MOCK_INVITATION = {
  id: 'inv-001',
  tripId: MOCK_TRIP_ID,
  email: 'guest@example.com',
  status: 'PENDING',
  token: 'tok-abc123',
  expiresAt: new Date('2099-12-31'),
  createdAt: new Date('2026-03-01'),
  userId: null,
  user: null,
};

const MOCK_INVITATIONS_LIST = [
  MOCK_INVITATION,
  {
    ...MOCK_INVITATION,
    id: 'inv-002',
    email: 'another@example.com',
    token: 'tok-xyz789',
    user: null,
  },
];

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Clear all mocks before every test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/trips/[tripId]/invitations
// ===========================================================================
describe('GET /api/trips/[tripId]/invitations', () => {
  async function callGet(tripId: string, session: unknown = MOCK_SESSION) {
    mockGetServerSession.mockResolvedValueOnce(session as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest(`/api/trips/${tripId}/invitations`);
    return GET(req, { params: Promise.resolve({ tripId }) });
  }

  it('returns 401 when unauthenticated', async () => {
    const res = await callGet(MOCK_TRIP_ID, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTripMember.findFirst).not.toHaveBeenCalled();
    expect(mockPrismaTripInvitation.findMany).not.toHaveBeenCalled();
  });

  it('returns list of pending invitations for a trip member', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripInvitation.findMany.mockResolvedValueOnce(
      MOCK_INVITATIONS_LIST as unknown as Awaited<ReturnType<typeof prisma.tripInvitation.findMany>>
    );

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].email).toBe('guest@example.com');
  });

  it('returns 403 when the user is not a trip member', async () => {
    // findFirst returns null — user is not a member
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not a member of this trip');
    expect(mockPrismaTripInvitation.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array when no invitations exist for the trip', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripInvitation.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.tripInvitation.findMany>>
    );

    const res = await callGet(MOCK_TRIP_ID);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('queries invitations by the correct tripId', async () => {
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(MOCK_MEMBER_ROW);
    mockPrismaTripInvitation.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.tripInvitation.findMany>>
    );

    await callGet(MOCK_TRIP_ID);

    expect(mockPrismaTripInvitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: MOCK_TRIP_ID } })
    );
  });
});

// ===========================================================================
// POST /api/trips/[tripId]/invitations
// ===========================================================================
describe('POST /api/trips/[tripId]/invitations', () => {
  async function callPost(
    tripId: string,
    body: unknown,
    session: unknown = MOCK_SESSION
  ) {
    mockGetServerSession.mockResolvedValueOnce(session as Awaited<ReturnType<typeof getServerSession>>);
    const req = makeRequest(`/api/trips/${tripId}/invitations`, {
      method: 'POST',
      body,
    });
    return POST(req, { params: Promise.resolve({ tripId }) });
  }

  const VALID_BODY = { emails: ['guest@example.com'], expirationHours: 24 };

  it('returns 401 when unauthenticated', async () => {
    const res = await callPost(MOCK_TRIP_ID, VALID_BODY, null);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockPrismaTrip.findUnique).not.toHaveBeenCalled();
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('creates invitation successfully (201-equivalent) when user is the trip owner', async () => {
    // trip.findUnique and tripMember.findFirst run in Promise.all
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null); // owner — membership check not required
    mockProcessInvitations.mockResolvedValueOnce({
      invitations: [{ email: 'guest@example.com', status: 'sent' }],
      errors: [],
    });

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.invitations).toHaveLength(1);
    expect(mockProcessInvitations).toHaveBeenCalledOnce();
  });

  it('creates invitation successfully when user is an ADMIN member', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP_OTHER_OWNER as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(
      MOCK_ADMIN_MEMBERSHIP as unknown as Awaited<ReturnType<typeof prisma.tripMember.findFirst>>
    );
    mockProcessInvitations.mockResolvedValueOnce({
      invitations: [{ email: 'guest@example.com', status: 'sent' }],
      errors: [],
    });

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockProcessInvitations).toHaveBeenCalledOnce();
  });

  it('returns 403 when non-admin member tries to create an invitation', async () => {
    // User is neither owner nor ADMIN/OWNER member
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP_OTHER_OWNER as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    // findFirst for membership with role in [OWNER, ADMIN] returns null
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not authorized to invite members');
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('returns 404 when the trip is not found', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(null);
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await parseJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Trip not found');
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('returns 400 with invalid email format', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, {
      emails: ['not-a-valid-email'],
      expirationHours: 24,
    });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('returns 400 when emails array is missing from body', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);

    const res = await callPost(MOCK_TRIP_ID, { expirationHours: 24 });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(mockProcessInvitations).not.toHaveBeenCalled();
  });

  it('returns 409-equivalent when processInvitations reports a duplicate invitation error', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    // processInvitations returns a structured result indicating conflicts
    mockProcessInvitations.mockResolvedValueOnce({
      invitations: [],
      errors: [{ email: 'guest@example.com', status: 'error', error: 'Invitation already exists' }],
    });

    const res = await callPost(MOCK_TRIP_ID, VALID_BODY);
    const body = await parseJson(res);

    // Route returns 200 with data containing errors array when processInvitations surfaces conflicts
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0].error).toContain('already exists');
    expect(mockProcessInvitations).toHaveBeenCalledOnce();
  });

  it('passes correct arguments to processInvitations', async () => {
    mockPrismaTrip.findUnique.mockResolvedValueOnce(
      MOCK_TRIP as unknown as Awaited<ReturnType<typeof prisma.trip.findUnique>>
    );
    mockPrismaTripMember.findFirst.mockResolvedValueOnce(null);
    mockProcessInvitations.mockResolvedValueOnce({ invitations: [], errors: [] });

    await callPost(MOCK_TRIP_ID, {
      emails: ['friend@example.com'],
      expirationHours: 48,
    });

    expect(mockProcessInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: MOCK_TRIP_ID,
        tripTitle: MOCK_TRIP.title,
        emails: ['friend@example.com'],
        inviterId: MOCK_USER_ID,
        expirationHours: 48,
      })
    );
  });
});
