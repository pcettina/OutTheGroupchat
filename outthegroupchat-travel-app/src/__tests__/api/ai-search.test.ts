/**
 * Unit tests for POST /api/ai/search and GET /api/ai/search
 *
 * Strategy
 * --------
 * - @/lib/ai/embeddings is mocked so generateEmbedding, cosineSimilarity, and
 *   buildActivityText are fully controllable per test.
 * - @/lib/rate-limit is mocked as a no-op since the route may import it.
 * - @/lib/prisma is mocked via setup.ts; individual tests use mockResolvedValueOnce.
 * - next-auth getServerSession and @/lib/auth are mocked via setup.ts globals.
 *
 * Each test configures its own mocks from scratch after vi.resetAllMocks().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Mock: @/lib/ai/embeddings — control embedding generation and scoring
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbedding: vi.fn(),
  cosineSimilarity: vi.fn(),
  buildActivityText: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — stub out rate limiting so it never blocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, reset: 0, limit: 100 }),
  aiRateLimiter: {},
  apiRateLimiter: {},
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Import mocked modules AFTER vi.mock declarations
import { generateEmbedding, cosineSimilarity, buildActivityText } from '@/lib/ai/embeddings';
import { checkRateLimit } from '@/lib/rate-limit';

// Import the handlers under test
import { POST, GET } from '@/app/api/ai/search/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGenerateEmbedding = vi.mocked(generateEmbedding);
const mockCosineSimilarity = vi.mocked(cosineSimilarity);
const mockBuildActivityText = vi.mocked(buildActivityText);
const mockPrismaActivity = vi.mocked(prisma.activity);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeSession() {
  return { user: { id: 'user-1', email: 'test@example.com' } };
}

const MOCK_EMBEDDING = [0.1, 0.2];

/** Build a minimal activity row as returned by prisma.activity.findMany */
function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'activity-1',
    name: 'Tokyo Ramen Tour',
    description: 'Sample ramen experience',
    category: 'FOOD' as const,
    location: { address: '1-1 Shinjuku, Tokyo' },
    cost: 15,
    priceRange: 'BUDGET' as const,
    trip: { destination: 'Tokyo' },
    _count: { ratings: 42 },
    ...overrides,
  };
}

/** Build a POST Request with JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a GET Request with query params. */
function makeGetRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost:3000/api/ai/search');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: 'GET' });
}

/** Parse JSON from a Response. */
async function parseJson(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset all mocks between tests.
// vi.resetAllMocks() flushes mockResolvedValueOnce queues, preventing leakage.
// ---------------------------------------------------------------------------
beforeEach(() => {
  // resetAllMocks flushes both call records AND mockResolvedValueOnce/mockReturnValueOnce queues,
  // preventing state leakage across tests (e.g. leaked rejections from generateEmbedding).
  // The module-level embeddingCache in the route persists across tests by design.
  vi.resetAllMocks();
  // Re-establish rate limit default after reset removes the factory implementation.
  vi.mocked(checkRateLimit).mockResolvedValue({ success: true, remaining: 99, reset: 0, limit: 100 });
});

// ===========================================================================
// POST /api/ai/search
// ===========================================================================
describe('POST /api/ai/search', () => {
  // -------------------------------------------------------------------------
  // 1. Returns 401 when unauthenticated
  // -------------------------------------------------------------------------
  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makePostRequest({ query: 'ramen in tokyo' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Returns 400 when body is missing 'query'
  // -------------------------------------------------------------------------
  it('returns 400 when body is missing query field', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());

    const req = makePostRequest({ type: 'activities' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Returns 400 when query is empty string
  // -------------------------------------------------------------------------
  it('returns 400 when query is an empty string', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());

    const req = makePostRequest({ query: '' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Returns 400 when type is an invalid enum value
  // -------------------------------------------------------------------------
  it('returns 400 when type is an invalid enum value', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());

    const req = makePostRequest({ query: 'sushi', type: 'restaurants' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Returns 400 when limit is out of range (> 50)
  // -------------------------------------------------------------------------
  it('returns 400 when limit exceeds 50', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());

    const req = makePostRequest({ query: 'sushi', limit: 99 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Returns 200 with empty activities when no activities in DB
  // -------------------------------------------------------------------------
  it('returns 200 with empty activities when no activities exist in DB', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding.mockResolvedValueOnce(MOCK_EMBEDDING);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ query: 'hiking trails' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities).toEqual([]);
    expect(body.meta.query).toBe('hiking trails');
    expect(body.meta.totalResults).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 7. Returns 200 with scored activities on valid search
  // -------------------------------------------------------------------------
  it('returns 200 with scored activities when search returns results', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    // First call for the query embedding; second call for the activity embedding
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('Tokyo Ramen Tour ramen experience FOOD');
    mockCosineSimilarity.mockReturnValue(0.8);

    const activities = [makeActivity(), makeActivity({ id: 'activity-2', name: 'Tokyo Temple' })];
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      activities as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ query: 'ramen tokyo' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.activities)).toBe(true);
    // Both activities score 0.8 > 0.5 threshold, so both should be returned
    expect(body.data.activities.length).toBeGreaterThanOrEqual(1);
    expect(body.data.activities[0]).toHaveProperty('score');
    expect(body.data.activities[0]).toHaveProperty('id');
    expect(body.data.activities[0]).toHaveProperty('name');
  });

  // -------------------------------------------------------------------------
  // 8. Returns only activities scoring > 0.5 (filters low-score results)
  // -------------------------------------------------------------------------
  it('filters out activities with cosine similarity score at or below 0.5', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)   // query embedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)   // activity-1 embedding
      .mockResolvedValueOnce(MOCK_EMBEDDING);  // activity-2 embedding
    mockBuildActivityText.mockReturnValue('some activity text');
    // First activity scores high, second scores low
    mockCosineSimilarity
      .mockReturnValueOnce(0.9)  // activity-1: above threshold
      .mockReturnValueOnce(0.3); // activity-2: below threshold

    const activities = [
      makeActivity({ id: 'activity-1', name: 'High Relevance' }),
      makeActivity({ id: 'activity-2', name: 'Low Relevance' }),
    ];
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      activities as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ query: 'specific experience', type: 'activities' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Only the high-score activity should survive the 0.5 threshold filter
    expect(body.data.activities.length).toBe(1);
    expect(body.data.activities[0].name).toBe('High Relevance');
    expect(body.data.activities[0].score).toBe(0.9);
  });

  // -------------------------------------------------------------------------
  // 9. Returns 500 on embedding generation error
  // -------------------------------------------------------------------------
  it('returns 500 when generateEmbedding throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding.mockRejectedValueOnce(new Error('Embedding API unavailable'));

    const req = makePostRequest({ query: 'beach activities' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/semantic search failed/i);
  });

  // -------------------------------------------------------------------------
  // 10. Returns 200 with activities when type='all'
  // -------------------------------------------------------------------------
  it('returns 200 with activity results when type is "all"', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('Kyoto temples culture');
    mockCosineSimilarity.mockReturnValue(0.75);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'act-all-1', name: 'Kyoto Temple Tour' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({ query: 'kyoto temples', type: 'all' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities).toBeDefined();
    expect(body.data.activities.length).toBeGreaterThanOrEqual(1);
    expect(body.meta.type).toBe('all');
  });
});

// ===========================================================================
// GET /api/ai/search
// ===========================================================================
describe('GET /api/ai/search', () => {
  // -------------------------------------------------------------------------
  // 11. Returns 400 when ?q param is missing
  // -------------------------------------------------------------------------
  it('returns 400 when the q query param is missing', async () => {
    const req = makeGetRequest({ limit: '5' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/required/i);
  });

  // -------------------------------------------------------------------------
  // 12. Returns 200 with results when ?q and ?limit are provided
  // -------------------------------------------------------------------------
  it('returns 200 with results when q=tokyo and limit=5 are provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('tokyo experience');
    mockCosineSimilarity.mockReturnValue(0.82);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'act-get-1', name: 'Tokyo Skyline Walk' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makeGetRequest({ q: 'tokyo', limit: '5' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta.query).toBe('tokyo');
    expect(body.data.activities).toBeDefined();
    expect(body.data.activities.length).toBeGreaterThanOrEqual(1);
  });
});
