import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock('@/lib/pusher', () => ({
  triggerCheckinEvent: vi.fn().mockResolvedValue(undefined),
  getCityCheckinChannel: vi.fn().mockReturnValue('city-test-checkins'),
}));

import { getServerSession } from 'next-auth';
import { triggerCheckinEvent } from '@/lib/pusher';

const MOCK_SESSION = { user: { id: 'user-1', name: 'Alice' } };
const CHECKINS_URL = 'http://localhost:3000/api/checkins';
const VALID_CITY_ID = 'cltest1234567890abcdefghijk';

function makePost(body: Record<string, unknown>) {
  return new NextRequest(CHECKINS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCheckIn(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return {
    id: 'ci-abc',
    userId: 'user-1',
    cityId: VALID_CITY_ID,
    venueId: null,
    venueName: null,
    note: null,
    visibility: 'CREW',
    activeUntil: future,
    latitude: null,
    longitude: null,
    createdAt: new Date(),
    user: { id: 'user-1', name: 'Alice', image: null },
    venue: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/checkins — Pusher trigger
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/checkins — Pusher broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls triggerCheckinEvent after successful check-in with cityId', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.create).mockResolvedValueOnce(makeCheckIn({ cityId: VALID_CITY_ID }) as never);
    vi.mocked(prisma.crew.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 } as never);
    const { POST } = await import('@/app/api/checkins/route');
    const res = await POST(makePost({ cityId: VALID_CITY_ID }));
    expect(res.status).toBe(201);
    expect(vi.mocked(triggerCheckinEvent)).toHaveBeenCalledOnce();
    expect(vi.mocked(triggerCheckinEvent)).toHaveBeenCalledWith(
      VALID_CITY_ID,
      'checkin:new',
      expect.objectContaining({ checkInId: 'ci-abc' })
    );
  });

  it('does NOT call triggerCheckinEvent when cityId is absent', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.create).mockResolvedValueOnce(makeCheckIn({ cityId: null }) as never);
    vi.mocked(prisma.crew.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 } as never);
    const { POST } = await import('@/app/api/checkins/route');
    const res = await POST(makePost({}));
    expect(res.status).toBe(201);
    expect(vi.mocked(triggerCheckinEvent)).not.toHaveBeenCalled();
  });

  it('request still succeeds when triggerCheckinEvent throws', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.create).mockResolvedValueOnce(makeCheckIn({ cityId: VALID_CITY_ID }) as never);
    vi.mocked(prisma.crew.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.notification.createMany).mockResolvedValueOnce({ count: 0 } as never);
    vi.mocked(triggerCheckinEvent).mockRejectedValueOnce(new Error('Pusher down'));
    const { POST } = await import('@/app/api/checkins/route');
    const res = await POST(makePost({ cityId: VALID_CITY_ID }));
    expect(res.status).toBe(201);
  });

  it('does NOT call triggerCheckinEvent when DB insert fails', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.create).mockRejectedValueOnce(new Error('DB error'));
    const { POST } = await import('@/app/api/checkins/route');
    const res = await POST(makePost({ cityId: VALID_CITY_ID }));
    expect(res.status).toBe(500);
    expect(vi.mocked(triggerCheckinEvent)).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/checkins/[id] — detail + visibility
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/checkins/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeGetRequest(id: string) {
    return new NextRequest(`http://localhost:3000/api/checkins/${id}`);
  }

  function makeParams(id: string) {
    return { params: { id } };
  }

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/checkins/[id]/route');
    const res = await GET(makeGetRequest('ci-1'), makeParams('ci-1'));
    expect(res.status).toBe(401);
  });

  it('returns PUBLIC check-in to any authenticated user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.findUnique).mockResolvedValueOnce(
      makeCheckIn({ id: 'ci-1', userId: 'user-2', visibility: 'PUBLIC' }) as never
    );
    const { GET } = await import('@/app/api/checkins/[id]/route');
    const res = await GET(makeGetRequest('ci-1'), makeParams('ci-1'));
    expect(res.status).toBe(200);
  });

  it('returns CREW check-in to accepted Crew member', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.findUnique).mockResolvedValueOnce(
      makeCheckIn({ id: 'ci-2', userId: 'user-2', visibility: 'CREW' }) as never
    );
    vi.mocked(prisma.crew.findFirst).mockResolvedValueOnce({
      userAId: 'user-1',
      userBId: 'user-2',
      status: 'ACCEPTED',
    } as never);
    const { GET } = await import('@/app/api/checkins/[id]/route');
    const res = await GET(makeGetRequest('ci-2'), makeParams('ci-2'));
    expect(res.status).toBe(200);
  });

  it('returns 404 for CREW check-in to non-Crew user', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.findUnique).mockResolvedValueOnce(
      makeCheckIn({ id: 'ci-3', userId: 'user-99', visibility: 'CREW' }) as never
    );
    vi.mocked(prisma.crew.findFirst).mockResolvedValueOnce(null as never);
    const { GET } = await import('@/app/api/checkins/[id]/route');
    const res = await GET(makeGetRequest('ci-3'), makeParams('ci-3'));
    expect(res.status).toBe(404);
  });

  it('returns own PRIVATE check-in to the owner', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.findUnique).mockResolvedValueOnce(
      makeCheckIn({ id: 'ci-4', userId: 'user-1', visibility: 'PRIVATE' }) as never
    );
    const { GET } = await import('@/app/api/checkins/[id]/route');
    const res = await GET(makeGetRequest('ci-4'), makeParams('ci-4'));
    expect(res.status).toBe(200);
  });

  it('returns 404 for PRIVATE check-in to non-owner', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.findUnique).mockResolvedValueOnce(
      makeCheckIn({ id: 'ci-5', userId: 'user-99', visibility: 'PRIVATE' }) as never
    );
    const { GET } = await import('@/app/api/checkins/[id]/route');
    const res = await GET(makeGetRequest('ci-5'), makeParams('ci-5'));
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent check-in', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.checkIn.findUnique).mockResolvedValueOnce(null as never);
    const { GET } = await import('@/app/api/checkins/[id]/route');
    const res = await GET(makeGetRequest('nonexistent'), makeParams('nonexistent'));
    expect(res.status).toBe(404);
  });
});
