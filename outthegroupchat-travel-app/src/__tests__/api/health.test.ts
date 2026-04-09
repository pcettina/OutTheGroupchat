/**
 * Unit tests for GET /api/health
 *
 * Strategy
 * --------
 * - The health route is public (no auth, no rate limiting).
 * - It calls prisma.$queryRaw`SELECT 1` to check DB connectivity.
 * - $queryRaw is NOT in the global setup.ts mock factory, so we override the
 *   @/lib/prisma mock in this file to add it as a vi.fn().
 * - All tests call the handler directly (no HTTP layer needed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/health/route';

// ---------------------------------------------------------------------------
// Override the @/lib/prisma mock to include $queryRaw.
// This module-level vi.mock merges with (and extends) the global setup.ts mock
// because Vitest hoists vi.mock calls — the factory here replaces the global one
// for this file only.
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    trip: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    tripMember: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), createMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
  },
}));

// Import prisma AFTER the mock is registered so we get the mocked version.
import { prisma } from '@/lib/prisma';

// Typed reference for $queryRaw
const mockQueryRaw = vi.mocked(prisma.$queryRaw as ReturnType<typeof vi.fn>);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupQueryRawSuccess() {
  mockQueryRaw.mockResolvedValueOnce([{ 1: 1 }]);
}

function setupQueryRawFailure(message = 'Connection refused') {
  mockQueryRaw.mockRejectedValueOnce(new Error(message));
}

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Happy path -----------------------------------------------------------

  it('returns 200 when database is reachable', async () => {
    setupQueryRawSuccess();
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('returns status "ok" when database is reachable', async () => {
    setupQueryRawSuccess();
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns database "connected" when database is reachable', async () => {
    setupQueryRawSuccess();
    const res = await GET();
    const body = await res.json();
    expect(body.database).toBe('connected');
  });

  it('returns a valid ISO 8601 timestamp when database is reachable', async () => {
    setupQueryRawSuccess();
    const before = new Date().toISOString();
    const res = await GET();
    const after = new Date().toISOString();
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    const ts = new Date(body.timestamp as string).toISOString();
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });

  it('response body contains exactly the expected keys', async () => {
    setupQueryRawSuccess();
    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['database', 'status', 'timestamp']);
  });

  // ---- Degraded path --------------------------------------------------------

  it('returns 503 when database is unreachable', async () => {
    setupQueryRawFailure();
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it('returns status "degraded" when database is unreachable', async () => {
    setupQueryRawFailure();
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe('degraded');
  });

  it('returns database "error" when database is unreachable', async () => {
    setupQueryRawFailure();
    const res = await GET();
    const body = await res.json();
    expect(body.database).toBe('error');
  });

  it('still returns a timestamp when database is unreachable', async () => {
    setupQueryRawFailure();
    const res = await GET();
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp as string).toISOString()).not.toThrow();
  });

  it('degraded response contains exactly the expected keys', async () => {
    setupQueryRawFailure();
    const res = await GET();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['database', 'status', 'timestamp']);
  });

  // ---- Error message variants -----------------------------------------------

  it('handles ECONNREFUSED errors gracefully', async () => {
    setupQueryRawFailure('ECONNREFUSED 127.0.0.1:5432');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.database).toBe('error');
  });

  it('handles timeout errors gracefully', async () => {
    setupQueryRawFailure('Query timeout after 30000ms');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
  });

  // ---- Response headers -----------------------------------------------------

  it('responds with JSON content-type', async () => {
    setupQueryRawSuccess();
    const res = await GET();
    const contentType = res.headers.get('content-type');
    expect(contentType).toMatch(/application\/json/);
  });

  // ---- $queryRaw call verification ------------------------------------------

  it('calls prisma.$queryRaw exactly once per request when DB is ok', async () => {
    setupQueryRawSuccess();
    await GET();
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('calls prisma.$queryRaw exactly once per request when DB errors', async () => {
    setupQueryRawFailure();
    await GET();
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  // ---- No auth requirement --------------------------------------------------

  it('does not call getServerSession (route is public)', async () => {
    setupQueryRawSuccess();
    const { getServerSession } = await import('next-auth');
    const mockSession = vi.mocked(getServerSession);
    mockSession.mockClear();
    await GET();
    expect(mockSession).not.toHaveBeenCalled();
  });
});
