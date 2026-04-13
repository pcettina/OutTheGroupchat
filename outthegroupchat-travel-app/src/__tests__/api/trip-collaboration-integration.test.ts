/**
 * Integration tests for the full trip collaboration flow.
 * Tests simulate real multi-step user scenarios across multiple API routes,
 * with all Prisma calls mocked via the global setup.ts stubs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
import { GET as getTrips, POST as postTrip } from '@/app/api/trips/route';
import {
  GET as getTripById,
  PATCH as patchTrip,
  DELETE as deleteTrip,
} from '@/app/api/trips/[tripId]/route';
import {
  GET as getInvitations,
  POST as postInvitations,
} from '@/app/api/trips/[tripId]/invitations/route';
import {
  GET as getMembers,
  POST as postMember,
} from '@/app/api/trips/[tripId]/members/route';
import {
  GET as getActivities,
  POST as postActivity,
} from '@/app/api/trips/[tripId]/activities/route';

// ---------------------------------------------------------------------------
// Rate-limit mock — must be present so no Redis calls leak
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  apiRateLimiter: null,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------
const OWNER_ID = 'clownertestuser00001';
const MEMBER_ID = 'clmembertestuser0001';
const OTHER_ID = 'clothertestuser00001';
const TRIP_ID = 'cltrip1testid000001';
const MEMBER_ROW_ID = 'clmemberrow0000001';
const ACTIVITY_ID = 'clactivity000000001';

const mockOwnerSession = {
  user: { id: OWNER_ID, name: 'Trip Owner', email: 'owner@test.com' },
  expires: '9999-01-01',
};

const mockMemberSession = {
  user: { id: MEMBER_ID, name: 'Trip Member', email: 'member@test.com' },
  expires: '9999-01-01',
};

const mockOtherSession = {
  user: { id: OTHER_ID, name: 'Other User', email: 'other@test.com' },
  expires: '9999-01-01',
};

const baseTripRow = {
  id: TRIP_ID,
  title: 'Paris Trip',
  description: 'A wonderful trip to Paris',
  destination: { city: 'Paris', country: 'France' },
  startDate: new Date('2026-06-01'),
  endDate: new Date('2026-06-10'),
  ownerId: OWNER_ID,
  isPublic: false,
  status: 'PLANNING',
  budget: null,
  coverImage: null,
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  owner: { id: OWNER_ID, name: 'Trip Owner', image: null },
  members: [{ userId: OWNER_ID, role: 'OWNER', id: MEMBER_ROW_ID, tripId: TRIP_ID, joinedAt: new Date(), user: { id: OWNER_ID, name: 'Trip Owner', image: null } }],
  activities: [],
  survey: null,
  itinerary: [],
  invitations: [],
  _count: { members: 1, activities: 0 },
};

function makeRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ---------------------------------------------------------------------------
// beforeEach: clear all mock call history (preserves factory defaults)
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Scenario A — Trip Creation & Member Management
// ===========================================================================
describe('Scenario A — Trip Creation & Member Management', () => {
  it('A1: owner can create a trip (POST /api/trips)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    const createdTrip = {
      ...baseTripRow,
      members: [
        {
          userId: OWNER_ID,
          role: 'OWNER',
          id: MEMBER_ROW_ID,
          tripId: TRIP_ID,
          joinedAt: new Date(),
          user: { id: OWNER_ID, name: 'Trip Owner', image: null },
        },
      ],
    };
    (prisma.trip.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createdTrip);

    const req = makeRequest('http://localhost/api/trips', 'POST', {
      title: 'Paris Trip',
      description: 'A wonderful trip to Paris',
      destination: { city: 'Paris', country: 'France' },
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      isPublic: false,
    });

    const res = await postTrip(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Paris Trip');
    expect(json.data.ownerId).toBe(OWNER_ID);
  });

  it('A2: owner can invite a member by email (POST /api/trips/[id]/invitations)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ownerId: OWNER_ID,
      title: 'Paris Trip',
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MEMBER_ROW_ID,
      role: 'OWNER',
      userId: OWNER_ID,
      tripId: TRIP_ID,
    });

    const inviteResult = {
      invitations: [{ email: 'friend@test.com', status: 'SENT' }],
      errors: [],
    };
    const { processInvitations } = await import('@/lib/invitations');
    vi.mocked(processInvitations).mockResolvedValueOnce(inviteResult as never);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/invitations`, 'POST', {
      emails: ['friend@test.com'],
    });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await postInvitations(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('A3: member can view trip details (GET /api/trips/[id])', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockMemberSession);

    const tripWithMember = {
      ...baseTripRow,
      members: [
        { userId: OWNER_ID, role: 'OWNER', id: MEMBER_ROW_ID, tripId: TRIP_ID, joinedAt: new Date(), user: { id: OWNER_ID, name: 'Trip Owner', email: 'owner@test.com', image: null, city: null } },
        { userId: MEMBER_ID, role: 'MEMBER', id: 'clmemberrow0000002', tripId: TRIP_ID, joinedAt: new Date(), user: { id: MEMBER_ID, name: 'Trip Member', email: 'member@test.com', image: null, city: null } },
      ],
    };
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(tripWithMember);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getTripById(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(TRIP_ID);
  });

  it('A4: owner can list all trip members (GET /api/trips/[id]/members)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    const membersList = [
      { id: MEMBER_ROW_ID, userId: OWNER_ID, role: 'OWNER', tripId: TRIP_ID, joinedAt: new Date(), user: { id: OWNER_ID, name: 'Trip Owner', email: 'owner@test.com', image: null, city: null, preferences: null } },
      { id: 'clmemberrow0000002', userId: MEMBER_ID, role: 'MEMBER', tripId: TRIP_ID, joinedAt: new Date(), user: { id: MEMBER_ID, name: 'Trip Member', email: 'member@test.com', image: null, city: null, preferences: null } },
    ];
    (prisma.tripMember.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(membersList);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/members`, 'GET');
    const params = { tripId: TRIP_ID };

    const res = await getMembers(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].role).toBe('OWNER');
    expect(json.data[1].role).toBe('MEMBER');
  });
});

// ===========================================================================
// Scenario B — Activity Collaboration
// ===========================================================================
describe('Scenario B — Activity Collaboration', () => {
  it('B1: member can add an activity to a trip (POST /api/trips/[id]/activities)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockMemberSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: TRIP_ID,
      ownerId: OWNER_ID,
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MEMBER_ROW_ID,
      userId: MEMBER_ID,
      role: 'MEMBER',
      tripId: TRIP_ID,
    });

    const newActivity = {
      id: ACTIVITY_ID,
      tripId: TRIP_ID,
      name: 'Eiffel Tower Visit',
      category: 'CULTURE',
      status: 'SUGGESTED',
      _count: { comments: 0, ratings: 0, savedBy: 0 },
    };
    (prisma.activity.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(newActivity);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/activities`, 'POST', {
      name: 'Eiffel Tower Visit',
      category: 'CULTURE',
    });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await postActivity(req, { params });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Eiffel Tower Visit');
  });

  it('B2: all members can view trip activities (GET /api/trips/[id]/activities)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockMemberSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isPublic: false,
      ownerId: OWNER_ID,
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MEMBER_ROW_ID,
      userId: MEMBER_ID,
    });

    const activitiesList = [
      { id: ACTIVITY_ID, name: 'Eiffel Tower Visit', category: 'CULTURE', _count: { comments: 0, ratings: 0, savedBy: 0 } },
      { id: 'clactivity000000002', name: 'Louvre Museum', category: 'CULTURE', _count: { comments: 2, ratings: 1, savedBy: 3 } },
    ];
    (prisma.activity.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(activitiesList);
    (prisma.activityRating.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ _avg: { score: null } })
      .mockResolvedValueOnce({ _avg: { score: 4.5 } });

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/activities`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getActivities(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
  });

  it('B3: owner can update trip details (PATCH /api/trips/[id])', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MEMBER_ROW_ID,
      userId: OWNER_ID,
      role: 'OWNER',
      tripId: TRIP_ID,
    });

    const updatedTrip = {
      ...baseTripRow,
      title: 'Paris Adventure',
      status: 'INVITING',
    };
    (prisma.trip.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce(updatedTrip);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'PATCH', {
      title: 'Paris Adventure',
      status: 'INVITING',
    });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await patchTrip(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.title).toBe('Paris Adventure');
  });

  it('B4: non-member cannot access private trip (GET /api/trips/[id] → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOtherSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseTripRow,
      isPublic: false,
      ownerId: OWNER_ID,
      members: [
        { userId: OWNER_ID, role: 'OWNER', id: MEMBER_ROW_ID, tripId: TRIP_ID, joinedAt: new Date(), user: { id: OWNER_ID, name: 'Trip Owner', email: 'owner@test.com', image: null, city: null } },
      ],
    });

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getTripById(req, { params });

    expect(res.status).toBe(401);
  });

  it('B5: public trip is visible to non-member without auth (GET /api/trips/[id])', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseTripRow,
      isPublic: true,
      ownerId: OWNER_ID,
      members: [
        { userId: OWNER_ID, role: 'OWNER', id: MEMBER_ROW_ID, tripId: TRIP_ID, joinedAt: new Date(), user: { id: OWNER_ID, name: 'Trip Owner', image: null, city: null } },
      ],
    });
    // Public trip increments view count (update call)
    (prisma.trip.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getTripById(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.isPublic).toBe(true);
  });
});

// ===========================================================================
// Scenario C — Permission Boundaries
// ===========================================================================
describe('Scenario C — Permission Boundaries', () => {
  it('C1: only owner can delete trip (DELETE /api/trips/[id] → 200)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    // isTripOwner → prisma.trip.findFirst returns trip
    (prisma.trip.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: TRIP_ID,
      ownerId: OWNER_ID,
    });
    (prisma.trip.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: TRIP_ID });

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'DELETE');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await deleteTrip(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('Trip deleted successfully');
  });

  it('C2: non-owner cannot delete trip (DELETE /api/trips/[id] → 403)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockMemberSession);

    // isTripOwner → findFirst returns null (not the owner)
    (prisma.trip.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'DELETE');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await deleteTrip(req, { params });

    expect(res.status).toBe(403);
  });

  it('C3: unauthenticated user cannot create trip (POST /api/trips → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest('http://localhost/api/trips', 'POST', {
      title: 'Hacker Trip',
      destination: { city: 'NYC', country: 'USA' },
      startDate: '2026-08-01',
      endDate: '2026-08-10',
    });

    const res = await postTrip(req);

    expect(res.status).toBe(401);
  });

  it('C4: unauthenticated user cannot view private trip (GET /api/trips/[id] → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...baseTripRow,
      isPublic: false,
      members: [],
    });

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getTripById(req, { params });

    expect(res.status).toBe(401);
  });

  it('C5: unauthenticated user cannot update trip (PATCH /api/trips/[id] → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'PATCH', { title: 'Hacked' });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await patchTrip(req, { params });

    expect(res.status).toBe(401);
  });

  it('C6: unauthenticated user cannot delete trip (DELETE /api/trips/[id] → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'DELETE');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await deleteTrip(req, { params });

    expect(res.status).toBe(401);
  });

  it('C7: non-member cannot add activity (POST /api/trips/[id]/activities → 403)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOtherSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: TRIP_ID,
      ownerId: OWNER_ID,
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/activities`, 'POST', {
      name: 'Unauthorized Activity',
      category: 'FOOD',
    });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await postActivity(req, { params });

    expect(res.status).toBe(403);
  });

  it('C8: unauthenticated user cannot add activity (POST /api/trips/[id]/activities → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/activities`, 'POST', {
      name: 'Unauthorized Activity',
      category: 'FOOD',
    });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await postActivity(req, { params });

    expect(res.status).toBe(401);
  });

  it('C9: non-owner/non-admin cannot update trip (PATCH /api/trips/[id] → 403)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockMemberSession);

    // tripMember.findFirst returns MEMBER role (not owner/admin)
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}`, 'PATCH', { title: 'Unauthorized Update' });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await patchTrip(req, { params });

    expect(res.status).toBe(403);
  });

  it('C10: unauthenticated user cannot list invitations (GET /api/trips/[id]/invitations → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/invitations`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getInvitations(req, { params });

    expect(res.status).toBe(401);
  });

  it('C11: non-member cannot list invitations (GET /api/trips/[id]/invitations → 403)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOtherSession);

    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/invitations`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getInvitations(req, { params });

    expect(res.status).toBe(403);
  });

  it('C12: non-member cannot send invitations (POST /api/trips/[id]/invitations → 403)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOtherSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ownerId: OWNER_ID,
      title: 'Paris Trip',
    });
    // Other user has no membership
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/invitations`, 'POST', {
      emails: ['someone@test.com'],
    });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await postInvitations(req, { params });

    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// Scenario D — Edge Cases & Validation
// ===========================================================================
describe('Scenario D — Edge Cases & Validation', () => {
  it('D1: returns 404 when trip does not exist (GET /api/trips/[id])', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/nonexistent-trip`, 'GET');
    const params = Promise.resolve({ tripId: 'nonexistent-trip' });

    const res = await getTripById(req, { params });

    expect(res.status).toBe(404);
  });

  it('D2: trip creation fails without required fields (POST /api/trips → 400)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    const req = makeRequest('http://localhost/api/trips', 'POST', {
      // missing title, destination, startDate, endDate
      description: 'Incomplete trip',
    });

    const res = await postTrip(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('D3: activity creation fails with invalid category (POST /api/trips/[id]/activities → 400)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: TRIP_ID,
      ownerId: OWNER_ID,
    });
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MEMBER_ROW_ID,
      userId: OWNER_ID,
      role: 'OWNER',
    });

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/activities`, 'POST', {
      name: 'Skydiving',
      category: 'ADVENTURE', // invalid — ADVENTURE is not a valid ActivityCategory
    });
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await postActivity(req, { params });

    expect(res.status).toBe(400);
  });

  it('D4: authenticated user can list their own trips (GET /api/trips)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    const trips = [
      { ...baseTripRow, id: TRIP_ID, title: 'Paris Trip' },
    ];
    (prisma.trip.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(trips);

    const req = makeRequest('http://localhost/api/trips', 'GET');

    const res = await getTrips(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it('D5: unauthenticated user cannot list trips (GET /api/trips → 401)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const req = makeRequest('http://localhost/api/trips', 'GET');

    const res = await getTrips(req);

    expect(res.status).toBe(401);
  });

  it('D6: invitation POST for non-existent trip returns 404', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    // Promise.all: trip.findUnique returns null, tripMember.findFirst returns something
    (prisma.trip.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = makeRequest(`http://localhost/api/trips/ghost-trip/invitations`, 'POST', {
      emails: ['friend@test.com'],
    });
    const params = Promise.resolve({ tripId: 'ghost-trip' });

    const res = await postInvitations(req, { params });

    expect(res.status).toBe(404);
  });

  it('D7: owner can view members list without rate limiting blocking them', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    (prisma.tripMember.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: MEMBER_ROW_ID, userId: OWNER_ID, role: 'OWNER', tripId: TRIP_ID, joinedAt: new Date(), user: { id: OWNER_ID, name: 'Trip Owner', email: 'owner@test.com', image: null, city: null, preferences: null } },
    ]);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/members`, 'GET');
    const params = { tripId: TRIP_ID };

    const res = await getMembers(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data[0].role).toBe('OWNER');
  });

  it('D8: owner can view invitations for their trip (GET /api/trips/[id]/invitations)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: MEMBER_ROW_ID,
      userId: OWNER_ID,
      role: 'OWNER',
      tripId: TRIP_ID,
    });

    const invitationsList = [
      { id: 'clinvitation000001', tripId: TRIP_ID, status: 'PENDING', email: 'friend@test.com', user: null, createdAt: new Date() },
    ];
    (prisma.tripInvitation.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(invitationsList);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/invitations`, 'GET');
    const params = Promise.resolve({ tripId: TRIP_ID });

    const res = await getInvitations(req, { params });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it('D9: owner can add trip member directly (POST /api/trips/[id]/members)', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    // requestingMember check → owner
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: MEMBER_ROW_ID, userId: OWNER_ID, role: 'OWNER', tripId: TRIP_ID })
      .mockResolvedValueOnce(null); // existingMember check → not already a member

    const newMemberRow = {
      id: 'clnewmemberrow00001',
      userId: MEMBER_ID,
      role: 'MEMBER',
      tripId: TRIP_ID,
      joinedAt: new Date(),
      user: { id: MEMBER_ID, name: 'Trip Member', email: 'member@test.com', image: null },
    };
    (prisma.tripMember.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(newMemberRow);

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/members`, 'POST', {
      userId: MEMBER_ID,
    });
    const params = { tripId: TRIP_ID };

    const res = await postMember(req, { params });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.userId).toBe(MEMBER_ID);
  });

  it('D10: adding already-existing member returns 409 conflict', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(mockOwnerSession);

    // requestingMember check → owner
    (prisma.tripMember.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: MEMBER_ROW_ID, userId: OWNER_ID, role: 'OWNER', tripId: TRIP_ID })
      .mockResolvedValueOnce({ id: 'clmemberrow0000002', userId: MEMBER_ID, role: 'MEMBER' }); // already a member

    const req = makeRequest(`http://localhost/api/trips/${TRIP_ID}/members`, 'POST', {
      userId: MEMBER_ID,
    });
    const params = { tripId: TRIP_ID };

    const res = await postMember(req, { params });

    expect(res.status).toBe(409);
  });
});
