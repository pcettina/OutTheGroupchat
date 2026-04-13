import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted to the top of the file, so top-level variables defined
// after the mock call cannot be referenced inside the factory. Use vi.hoisted
// to create the stub before the hoisted mock factory executes.
const { mockQueryRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
}));

// Override the prisma mock for this file to include $queryRaw.
// setup.ts does not define $queryRaw on the mocked object, so vi.spyOn fails.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    trip: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Happy path — DB connected
  // ------------------------------------------------------------------

  it('returns HTTP 200 when database is connected', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
  });

  it('returns status "ok" when database is connected', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('ok');
  });

  it('returns database "connected" when $queryRaw succeeds', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(body.database).toBe('connected');
  });

  it('includes a valid ISO timestamp when DB is connected', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const before = new Date().toISOString();
    const res = await GET();
    const after = new Date().toISOString();
    const body = await res.json();

    expect(typeof body.timestamp).toBe('string');
    // Must parse to a real date
    const parsed = new Date(body.timestamp);
    expect(isNaN(parsed.getTime())).toBe(false);
    // Timestamp should fall within the test execution window
    expect(body.timestamp >= before).toBe(true);
    expect(body.timestamp <= after).toBe(true);
  });

  // ------------------------------------------------------------------
  // Error path — DB throws
  // ------------------------------------------------------------------

  it('returns HTTP 503 when database throws an error', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await GET();

    expect(res.status).toBe(503);
  });

  it('returns status "degraded" when database throws an error', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('degraded');
  });

  it('returns database "error" when $queryRaw throws', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('Timeout'));

    const res = await GET();
    const body = await res.json();

    expect(body.database).toBe('error');
  });

  it('includes a valid ISO timestamp even when database fails', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('DB down'));

    const res = await GET();
    const body = await res.json();

    expect(typeof body.timestamp).toBe('string');
    const parsed = new Date(body.timestamp);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  // ------------------------------------------------------------------
  // Response shape — all 3 required fields present
  // ------------------------------------------------------------------

  it('response body always contains status, timestamp, and database fields when healthy', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await GET();
    const body = await res.json();

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('database');
  });

  it('response body always contains all 3 fields even on DB error', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET();
    const body = await res.json();

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('database');
  });

  // ------------------------------------------------------------------
  // Public route — no auth session required
  // ------------------------------------------------------------------

  it('is a public route: returns 200 with no session configured', async () => {
    // getServerSession is not called by this route — confirmed by the route
    // implementation which has no auth check. This test verifies a 200 response
    // arrives without any session mock being established.
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
