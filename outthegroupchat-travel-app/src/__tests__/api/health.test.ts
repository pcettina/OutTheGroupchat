import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// GET /api/health — public endpoint, no auth or rate-limit required
// ---------------------------------------------------------------------------

// The global prisma mock in setup.ts does not include $queryRaw because it is
// a raw-query method, not a delegate method. We attach a vi.fn() stub directly
// on the mocked prisma object so it can be controlled per-test.
const prismaAny = prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> };

import * as healthRoute from '@/app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure $queryRaw exists as a vi.fn on the mock object before each test
    if (!prismaAny.$queryRaw) {
      prismaAny.$queryRaw = vi.fn();
    } else {
      // Already a vi.fn from a previous attach — clear is handled by clearAllMocks
    }
  });

  // -------------------------------------------------------------------------
  // 200 — healthy path
  // -------------------------------------------------------------------------

  it('returns 200 with status ok when DB is reachable', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await healthRoute.GET();

    expect(response.status).toBe(200);
  });

  it('returns status "ok" in the body when DB is reachable', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(body.status).toBe('ok');
  });

  it('returns database "connected" when DB query succeeds', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(body.database).toBe('connected');
  });

  it('includes a timestamp field in the response body', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns a valid ISO 8601 timestamp', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await healthRoute.GET();
    const body = await response.json();

    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });

  it('returns exactly the three expected fields (status, timestamp, database)', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['database', 'status', 'timestamp']);
  });

  // -------------------------------------------------------------------------
  // 503 — degraded path (DB unreachable)
  // -------------------------------------------------------------------------

  it('returns 503 when the DB query throws', async () => {
    prismaAny.$queryRaw = vi.fn().mockRejectedValueOnce(new Error('Connection refused'));

    const response = await healthRoute.GET();

    expect(response.status).toBe(503);
  });

  it('returns status "degraded" in the body when DB query throws', async () => {
    prismaAny.$queryRaw = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(body.status).toBe('degraded');
  });

  it('returns database "error" in the body when DB query throws', async () => {
    prismaAny.$queryRaw = vi.fn().mockRejectedValueOnce(new Error('timeout'));

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(body.database).toBe('error');
  });

  it('still includes a timestamp when DB query throws', async () => {
    prismaAny.$queryRaw = vi.fn().mockRejectedValueOnce(new Error('DB down'));

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
  });

  it('still returns exactly the three expected fields when DB is unreachable', async () => {
    prismaAny.$queryRaw = vi.fn().mockRejectedValueOnce(new Error('DB down'));

    const response = await healthRoute.GET();
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['database', 'status', 'timestamp']);
  });

  // -------------------------------------------------------------------------
  // Response shape — Content-Type
  // -------------------------------------------------------------------------

  it('responds with application/json content-type on success', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await healthRoute.GET();

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('responds with application/json content-type on failure', async () => {
    prismaAny.$queryRaw = vi.fn().mockRejectedValueOnce(new Error('fail'));

    const response = await healthRoute.GET();

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  // -------------------------------------------------------------------------
  // $queryRaw invocation
  // -------------------------------------------------------------------------

  it('calls prisma.$queryRaw exactly once per request', async () => {
    prismaAny.$queryRaw = vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]);

    await healthRoute.GET();

    expect(prismaAny.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
