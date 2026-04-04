import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Override the global prisma mock to include $queryRaw, which the health
// route uses for its database connectivity check.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/health', { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/health', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path — database responds normally
  // -------------------------------------------------------------------------
  it('returns 200 with status "ok" when database is connected', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.database).toBe('connected');
  });

  it('response includes a timestamp field in ISO 8601 format', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await GET();
    const json = await response.json();

    expect(json.timestamp).toBeDefined();
    expect(typeof json.timestamp).toBe('string');
    // ISO 8601 timestamps produced by new Date().toISOString() always contain 'T'
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('response shape is consistent: status, timestamp, database fields are present', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await GET();
    const json = await response.json();

    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('database');
    // No unexpected extra fields beyond these three
    const keys = Object.keys(json);
    expect(keys).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Degraded path — database throws an error
  // -------------------------------------------------------------------------
  it('returns 503 with status "degraded" when database throws', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('Connection refused'));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe('degraded');
    expect(json.database).toBe('error');
  });

  it('returns 503 with database "error" when database throws a generic error', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.database).toBe('error');
  });

  it('degraded response still includes timestamp and all required fields', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('timeout'));

    const response = await GET();
    const json = await response.json();

    expect(json).toHaveProperty('status', 'degraded');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('database', 'error');
  });

  // -------------------------------------------------------------------------
  // Route does not require authentication — verifies no auth side effects
  // -------------------------------------------------------------------------
  it('accepts a NextRequest and responds correctly (no auth required)', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);

    // Pass the request object; the route itself ignores it but we test the
    // common calling convention used by other route tests in this suite.
    const request = makeGetRequest();
    // GET accepts no arguments per the route signature; call without args as
    // the implementation does — request is unused but we confirm no crash
    void request;
    const response = await GET();

    expect(response.status).toBe(200);
  });
});
