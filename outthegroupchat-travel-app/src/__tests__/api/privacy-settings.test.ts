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

import { getServerSession } from 'next-auth';

const MOCK_SESSION = { user: { id: 'user-1', name: 'Alice' } };
const BASE_URL = 'http://localhost:3000/api/users/privacy';

function makeRequest(method: string, body?: unknown) {
  return new NextRequest(BASE_URL, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/users/privacy
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/users/privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/users/privacy/route');
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns CREW as default when preferences is null', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ preferences: null } as never);
    const { GET } = await import('@/app/api/users/privacy/route');
    const res = await GET(makeRequest('GET'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.checkInVisibility).toBe('CREW');
  });

  it('returns stored PUBLIC visibility', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      preferences: { checkInVisibility: 'PUBLIC' },
    } as never);
    const { GET } = await import('@/app/api/users/privacy/route');
    const res = await GET(makeRequest('GET'));
    const json = await res.json();
    expect(json.data.checkInVisibility).toBe('PUBLIC');
  });

  it('returns stored PRIVATE visibility', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      preferences: { checkInVisibility: 'PRIVATE' },
    } as never);
    const { GET } = await import('@/app/api/users/privacy/route');
    const res = await GET(makeRequest('GET'));
    const json = await res.json();
    expect(json.data.checkInVisibility).toBe('PRIVATE');
  });

  it('returns 500 on DB error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(new Error('DB down'));
    const { GET } = await import('@/app/api/users/privacy/route');
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/users/privacy
// ──────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/users/privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/users/privacy/route');
    const res = await PATCH(makeRequest('PATCH', { checkInVisibility: 'CREW' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid visibility value', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const { PATCH } = await import('@/app/api/users/privacy/route');
    const res = await PATCH(makeRequest('PATCH', { checkInVisibility: 'EVERYONE' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 if checkInVisibility is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    const { PATCH } = await import('@/app/api/users/privacy/route');
    const res = await PATCH(makeRequest('PATCH', {}));
    expect(res.status).toBe(400);
  });

  it('updates to PUBLIC successfully', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ preferences: null } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'user-1' } as never);
    const { PATCH } = await import('@/app/api/users/privacy/route');
    const res = await PATCH(makeRequest('PATCH', { checkInVisibility: 'PUBLIC' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.checkInVisibility).toBe('PUBLIC');
  });

  it('updates to CREW successfully', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ preferences: null } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'user-1' } as never);
    const { PATCH } = await import('@/app/api/users/privacy/route');
    const res = await PATCH(makeRequest('PATCH', { checkInVisibility: 'CREW' }));
    const json = await res.json();
    expect(json.data.checkInVisibility).toBe('CREW');
  });

  it('updates to PRIVATE successfully', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ preferences: null } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'user-1' } as never);
    const { PATCH } = await import('@/app/api/users/privacy/route');
    const res = await PATCH(makeRequest('PATCH', { checkInVisibility: 'PRIVATE' }));
    const json = await res.json();
    expect(json.data.checkInVisibility).toBe('PRIVATE');
  });

  it('preserves other preference fields on update', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      preferences: { language: 'en', currency: 'USD' },
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'user-1' } as never);
    const { PATCH } = await import('@/app/api/users/privacy/route');
    await PATCH(makeRequest('PATCH', { checkInVisibility: 'PRIVATE' }));
    expect(vi.mocked(prisma.user.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preferences: expect.objectContaining({ language: 'en', currency: 'USD', checkInVisibility: 'PRIVATE' }),
        }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ preferences: null } as never);
    vi.mocked(prisma.user.update).mockRejectedValueOnce(new Error('DB down'));
    const { PATCH } = await import('@/app/api/users/privacy/route');
    const res = await PATCH(makeRequest('PATCH', { checkInVisibility: 'CREW' }));
    expect(res.status).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/checkins/feed — visibility enforcement
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/checkins/feed — visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const FEED_URL = 'http://localhost:3000/api/checkins/feed';
  const now = new Date();
  const future = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const past = new Date(now.getTime() - 60 * 60 * 1000);   // -1h

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/checkins/feed/route');
    const res = await GET(new NextRequest(FEED_URL));
    expect(res.status).toBe(401);
  });

  it('includes PUBLIC check-ins from Crew members', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.crew.findMany).mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ] as never);
    vi.mocked(prisma.checkIn.findMany).mockResolvedValueOnce([
      { id: 'ci-1', userId: 'user-2', visibility: 'PUBLIC', activeUntil: future },
    ] as never);
    const { GET } = await import('@/app/api/checkins/feed/route');
    const res = await GET(new NextRequest(FEED_URL));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
  });

  it('includes CREW check-ins from accepted Crew members', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.crew.findMany).mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ] as never);
    vi.mocked(prisma.checkIn.findMany).mockResolvedValueOnce([
      { id: 'ci-2', userId: 'user-2', visibility: 'CREW', activeUntil: future },
    ] as never);
    const { GET } = await import('@/app/api/checkins/feed/route');
    const res = await GET(new NextRequest(FEED_URL));
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });

  it('includes own check-ins regardless of visibility', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.crew.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.checkIn.findMany).mockResolvedValueOnce([
      { id: 'ci-3', userId: 'user-1', visibility: 'PRIVATE', activeUntil: future },
    ] as never);
    const { GET } = await import('@/app/api/checkins/feed/route');
    const res = await GET(new NextRequest(FEED_URL));
    const json = await res.json();
    expect(json.data).toHaveLength(1);
  });

  it('excludes expired check-ins via query', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.crew.findMany).mockResolvedValueOnce([
      { userAId: 'user-1', userBId: 'user-2' },
    ] as never);
    // DB returns empty — activeUntil filter applied at DB level
    vi.mocked(prisma.checkIn.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import('@/app/api/checkins/feed/route');
    const res = await GET(new NextRequest(FEED_URL));
    const json = await res.json();
    expect(json.data).toHaveLength(0);
    // Verify query included activeUntil: { gt: expect.any(Date) }
    expect(vi.mocked(prisma.checkIn.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activeUntil: { gt: expect.any(Date) } }),
      })
    );
  });

  it('returns 500 on DB error', async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(MOCK_SESSION);
    vi.mocked(prisma.crew.findMany).mockRejectedValueOnce(new Error('DB down'));
    const { GET } = await import('@/app/api/checkins/feed/route');
    const res = await GET(new NextRequest(FEED_URL));
    expect(res.status).toBe(500);
  });
});
