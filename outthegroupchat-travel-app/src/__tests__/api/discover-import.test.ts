/**
 * Unit tests for POST /api/discover/import
 *
 * Route: outthegroupchat-travel-app/src/app/api/discover/import/route.ts
 *
 * This route:
 *   1. Applies rate limiting (checkRateLimit / apiRateLimiter)
 *   2. Requires authentication via getServerSession (401 when no session)
 *   3. Validates the request body with Zod (400 on invalid input)
 *   4. Returns 500 when OPENTRIPMAP_API_KEY is not configured
 *   5. Calls the OpenTripMap API (fetch) to list places, then upserts each via prisma
 *
 * NOTE: OPENTRIPMAP_API_KEY is captured as a module-level constant at import
 * time. Tests that exercise the success path (and the external-fetch-error path)
 * use vi.resetModules() + a dynamic import inside beforeAll so the constant is
 * set before the module loads.  All other describe blocks use the statically
 * imported handler and rely on the env var being absent (empty string), which
 * correctly exercises the "API key not configured" branch of the route.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before imports by vitest)
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  apiRateLimiter: {},
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Static import of the route handler (OPENTRIPMAP_API_KEY will be '' here
// since the env var is not set in the test environment)
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/discover/import/route';

// ---------------------------------------------------------------------------
// Typed references to mocked modules
// ---------------------------------------------------------------------------

const mockGetServerSession = vi.mocked(getServerSession);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

// externalActivity in setup.ts only has findMany/findUnique; the route uses
// upsert, so we need to add it. We cast through unknown to extend the type.
const mockPrismaExternalActivity = vi.mocked(prisma.externalActivity) as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION = {
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
  expires: '9999-01-01',
};

const RATE_LIMIT_OK = { success: true, limit: 100, remaining: 99, reset: 0 };
const RATE_LIMIT_EXCEEDED = { success: false, limit: 100, remaining: 0, reset: Date.now() + 60000 };

const VALID_BODY = {
  latitude: 48.8566,
  longitude: 2.3522,
  city: 'Paris',
  country: 'France',
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/discover/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

// Helper: mock externalActivity.upsert if it doesn't exist yet on the mock
function ensureUpsertMock(): void {
  if (!mockPrismaExternalActivity.upsert) {
    (mockPrismaExternalActivity as Record<string, unknown>).upsert = vi.fn();
  }
}

// ---------------------------------------------------------------------------
// Helper: build a minimal OpenTripMap place fixture
// ---------------------------------------------------------------------------

function makePlacesResponse(count = 1): object[] {
  return Array.from({ length: count }, (_, i) => ({
    xid: `xid-${i + 1}`,
    name: `Place ${i + 1}`,
    kinds: 'museum,cultural',
    point: { lat: 48.8566 + i * 0.001, lon: 2.3522 + i * 0.001 },
    rate: 6,
  }));
}

function makePlaceDetailResponse(xid: string): object {
  return {
    xid,
    name: `Detail for ${xid}`,
    kinds: 'museum,cultural',
    point: { lat: 48.8566, lon: 2.3522 },
    rate: 6,
    address: {
      city: 'Paris',
      road: 'Rue de Rivoli',
      house_number: '1',
      state: 'Île-de-France',
      country: 'France',
      postcode: '75001',
    },
    wikipedia_extracts: { text: 'A famous place.' },
    preview: { source: 'https://example.com/image.jpg' },
    url: 'https://example.com/place',
  };
}

// ---------------------------------------------------------------------------
// Tests using the statically-imported handler
// (OPENTRIPMAP_API_KEY is '' — only tests that don't reach the API-key check
// or that expect 500 for missing key belong here)
// ---------------------------------------------------------------------------

describe('POST /api/discover/import — rate limiting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ensureUpsertMock();
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('does not call getServerSession when rate limit is exceeded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_EXCEEDED);

    await POST(makeReq(VALID_BODY));

    expect(mockGetServerSession).not.toHaveBeenCalled();
  });
});

describe('POST /api/discover/import — authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ensureUpsertMock();
  });

  it('returns 401 when there is no session', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authentication required/i);
  });

  it('returns 401 when session has no user', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce({ expires: '9999-01-01', user: undefined } as never);

    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authentication required/i);
  });
});

describe('POST /api/discover/import — Zod validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ensureUpsertMock();
  });

  it('returns 400 when latitude is missing', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await POST(makeReq({ longitude: 2.3522 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
    expect(body.details).toBeDefined();
  });

  it('returns 400 when longitude is missing', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await POST(makeReq({ latitude: 48.8566 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
    expect(body.details).toBeDefined();
  });

  it('returns 400 when radius is below minimum (100)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await POST(makeReq({ ...VALID_BODY, radius: 50 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
  });

  it('returns 400 when radius exceeds maximum (50000)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await POST(makeReq({ ...VALID_BODY, radius: 99999 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
  });

  it('returns 400 when limit is below minimum (1)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await POST(makeReq({ ...VALID_BODY, limit: 0 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
  });

  it('returns 400 when limit exceeds maximum (200)', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const res = await POST(makeReq({ ...VALID_BODY, limit: 201 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid request body/i);
  });

  it('returns 400 when body is not valid JSON object', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // Send a string instead of an object
    const req = new NextRequest('http://localhost:3000/api/discover/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
      body: '"not-an-object"',
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/discover/import — API key not configured (env var absent)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ensureUpsertMock();
  });

  it('returns 500 when OPENTRIPMAP_API_KEY is not set', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // The static import captured OPENTRIPMAP_API_KEY as '' (no env var in test env)
    const res = await POST(makeReq(VALID_BODY));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/api key not configured/i);
  });
});

// ---------------------------------------------------------------------------
// Tests that require OPENTRIPMAP_API_KEY to be set at module load time.
// We use vi.resetModules() + dynamic import in beforeAll so the module reads
// the env var after we've set it. The handler is stored in a closure-level
// variable and used in the tests.
// ---------------------------------------------------------------------------

describe('POST /api/discover/import — with API key configured', () => {
  let POSTWithKey: (req: NextRequest) => Promise<Response>;

  // Save and restore the env var
  const originalApiKey = process.env.OPENTRIPMAP_API_KEY;

  beforeEach(async () => {
    vi.resetAllMocks();
    ensureUpsertMock();
    // Re-set the env var and re-import the module fresh so the constant is populated
    process.env.OPENTRIPMAP_API_KEY = 'test-api-key-12345';
    vi.resetModules();
    const mod = await import('@/app/api/discover/import/route');
    POSTWithKey = mod.POST;
  });

  afterAll(() => {
    process.env.OPENTRIPMAP_API_KEY = originalApiKey;
  });

  it('returns 200 with imported/skipped counts on successful import', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const places = makePlacesResponse(2);
    const detail0 = makePlaceDetailResponse('xid-1');
    const detail1 = makePlaceDetailResponse('xid-2');

    // Mock global fetch: first call = places list, then one detail per place
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => places,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => detail0,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => detail1,
      });

    vi.stubGlobal('fetch', mockFetch);

    // upsert succeeds for both places
    mockPrismaExternalActivity.upsert
      .mockResolvedValueOnce({ id: 'ext-1' })
      .mockResolvedValueOnce({ id: 'ext-2' });

    const res = await POSTWithKey(makeReq(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.imported).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(2);

    vi.unstubAllGlobals();
  });

  it('counts skipped when detail fetch returns non-ok response', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const places = makePlacesResponse(1);

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => places,
      })
      // detail fetch fails
      .mockResolvedValueOnce({ ok: false, status: 404 });

    vi.stubGlobal('fetch', mockFetch);

    const res = await POSTWithKey(makeReq(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.skipped).toBe(1);
    expect(body.data.imported).toBe(0);

    vi.unstubAllGlobals();
  });

  it('returns 500 when the places list fetch throws an error', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const res = await POSTWithKey(makeReq(VALID_BODY));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to import/i);

    vi.unstubAllGlobals();
  });

  it('returns 500 when places list fetch returns non-ok response', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', mockFetch);

    const res = await POSTWithKey(makeReq(VALID_BODY));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to import/i);

    vi.unstubAllGlobals();
  });

  it('filters out places with names shorter than 3 characters', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    // Mix of valid and invalid name lengths
    const places = [
      { xid: 'xid-good', name: 'Louvre Museum', kinds: 'museum', point: { lat: 48.86, lon: 2.33 }, rate: 8 },
      { xid: 'xid-bad', name: 'AB', kinds: 'other', point: { lat: 48.87, lon: 2.34 }, rate: 1 },
    ];

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => places })
      .mockResolvedValueOnce({ ok: true, json: async () => makePlaceDetailResponse('xid-good') });

    vi.stubGlobal('fetch', mockFetch);
    mockPrismaExternalActivity.upsert.mockResolvedValueOnce({ id: 'ext-good' });

    const res = await POSTWithKey(makeReq(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Only 1 valid place (name > 2 chars), 1 filtered out
    expect(body.data.imported).toBe(1);
    // total reflects valid places (after name filter)
    expect(body.data.total).toBe(1);

    vi.unstubAllGlobals();
  });

  it('returns empty results when places list is empty', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    const res = await POSTWithKey(makeReq(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.imported).toBe(0);
    expect(body.data.skipped).toBe(0);
    expect(body.data.total).toBe(0);

    vi.unstubAllGlobals();
  });

  it('uses optional defaults for radius and limit when not provided', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    // No radius or limit in body — should use defaults (10000 and 100)
    const res = await POSTWithKey(makeReq({ latitude: 51.5074, longitude: -0.1278 }));

    expect(res.status).toBe(200);
    // Verify the fetch URL contained the default radius
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain('radius=10000');
    expect(fetchUrl).toContain('limit=100');

    vi.unstubAllGlobals();
  });

  it('respects custom radius and limit in request body', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', mockFetch);

    const res = await POSTWithKey(makeReq({ ...VALID_BODY, radius: 5000, limit: 50 }));

    expect(res.status).toBe(200);
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain('radius=5000');
    expect(fetchUrl).toContain('limit=50');

    vi.unstubAllGlobals();
  });

  it('includes error details in response when individual place upsert fails', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(RATE_LIMIT_OK);
    mockGetServerSession.mockResolvedValueOnce(MOCK_SESSION);

    const places = makePlacesResponse(1);
    const detail = makePlaceDetailResponse('xid-1');

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => places })
      .mockResolvedValueOnce({ ok: true, json: async () => detail });

    vi.stubGlobal('fetch', mockFetch);

    // upsert throws
    mockPrismaExternalActivity.upsert.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await POSTWithKey(makeReq(VALID_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.skipped).toBe(1);
    expect(body.data.imported).toBe(0);
    // Errors array should contain the failure description
    expect(Array.isArray(body.data.errors)).toBe(true);
    expect(body.data.errors.length).toBeGreaterThan(0);
    expect(body.data.errors[0]).toMatch(/Place 1/);

    vi.unstubAllGlobals();
  });
});
