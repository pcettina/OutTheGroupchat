/**
 * Unit tests for GET /api/health
 *
 * Route: src/app/api/health/route.ts
 *
 * Strategy
 * --------
 * - No auth or rate-limit guard on this route — tests call the handler directly.
 * - prisma.$queryRaw is mocked in setup.ts; vi.spyOn intercepts it per test.
 * - Each test sets up its own mock via mockResolvedValueOnce / mockRejectedValueOnce.
 * - vi.clearAllMocks() in beforeEach resets call history and queued once-values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns 200 with ok status when database is healthy', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ 1: 1 }] as never);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });

  it('includes a timestamp in ISO 8601 format in the response', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ 1: 1 }] as never);

    const res = await GET();
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    // ISO 8601 strings can be parsed back to a valid Date
    const parsed = new Date(body.timestamp as string);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  it('is publicly accessible without authentication', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ 1: 1 }] as never);

    // Calling GET() with no session set — should still succeed (no auth guard)
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('returns correct Content-Type JSON header', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ 1: 1 }] as never);

    const res = await GET();
    const contentType = res.headers.get('content-type');
    expect(contentType).toMatch(/application\/json/);
  });

  it('calls prisma.$queryRaw to verify DB connectivity', async () => {
    const spy = vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ 1: 1 }] as never);

    await GET();

    expect(spy).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Degraded / error paths
  // -------------------------------------------------------------------------

  it('returns 503 with degraded status when database query fails', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('DB connection refused'));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
  });

  it('returns 503 with error details when DB connection fails with timeout', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection timed out'));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
  });

  it('still includes a timestamp in the response when DB is degraded', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('DB down'));

    const res = await GET();
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    const parsed = new Date(body.timestamp as string);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  it('does not expose raw error messages in the response body', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(
      new Error('password=supersecret in connection string')
    );

    const res = await GET();
    const body = await res.json();

    // Route catches the error silently — only structured status fields returned
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
    // No raw error string should appear at the top level
    expect(body.error).toBeUndefined();
  });
});
