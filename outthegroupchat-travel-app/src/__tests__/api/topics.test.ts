/**
 * Unit tests for GET /api/topics — the lightweight Topic list used by the
 * Intent create form's manual-picker fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/topics/route';

type MockFn = ReturnType<typeof vi.fn>;
const mockPrismaTopic = prisma.topic as unknown as { findMany: MockFn };
const mockGetServerSession = vi.mocked(getServerSession);

const sessionFor = (id = 'user-1') => ({
  user: { id, name: 'Alice', email: 'alice@example.com' },
  expires: '2099-01-01',
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/topics', () => {
  it('401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('200 returns ordered topic list (id/slug/displayName only)', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockResolvedValueOnce([
      { id: 't1', slug: 'brunch', displayName: 'Brunch' },
      { id: 't2', slug: 'drinks', displayName: 'Drinks' },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.topics).toHaveLength(2);

    const select = mockPrismaTopic.findMany.mock.calls[0][0].select;
    expect(select).toEqual({ id: true, slug: true, displayName: true });
    const orderBy = mockPrismaTopic.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual({ displayName: 'asc' });
  });

  it('500 when prisma throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(sessionFor());
    mockPrismaTopic.findMany.mockRejectedValueOnce(new Error('db down'));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
