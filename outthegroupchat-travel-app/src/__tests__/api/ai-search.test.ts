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
 *
 * IMPORTANT: The route has a module-level embeddingCache (Map). Use unique
 * activity IDs per test to avoid cache hits interfering with mock call counts.
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
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockPrismaActivity = vi.mocked(prisma.activity);
const mockPrismaTrip = prisma.trip as unknown as { findMany: ReturnType<typeof vi.fn> };

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
// Re-establish permanent defaults after reset.
// ---------------------------------------------------------------------------
beforeEach(() => {
  // resetAllMocks flushes both call records AND mockResolvedValueOnce/mockReturnValueOnce queues,
  // preventing state leakage across tests (e.g. leaked rejections from generateEmbedding).
  // The module-level embeddingCache in the route persists across tests by design.
  vi.resetAllMocks();
  // Re-establish defaults after reset removes the factory implementations.
  mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 99, reset: 0, limit: 100 });
  // Default: no trips for destinations branch (added by L3). Each test overrides if needed.
  mockPrismaTrip.findMany.mockResolvedValue([]);
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
      .mockResolvedValueOnce(MOCK_EMBEDDING)   // activity-thresh-1 embedding
      .mockResolvedValueOnce(MOCK_EMBEDDING);  // activity-thresh-2 embedding
    mockBuildActivityText.mockReturnValue('some activity text');
    // First activity scores high, second scores low
    mockCosineSimilarity
      .mockReturnValueOnce(0.9)  // activity-thresh-1: above threshold
      .mockReturnValueOnce(0.3); // activity-thresh-2: below threshold

    const activities = [
      makeActivity({ id: 'activity-thresh-1', name: 'High Relevance' }),
      makeActivity({ id: 'activity-thresh-2', name: 'Low Relevance' }),
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

  // -------------------------------------------------------------------------
  // 11. Returns 429 when rate limit is exceeded
  // -------------------------------------------------------------------------
  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
      limit: 20,
    });

    const req = makePostRequest({ query: 'sushi spots' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/too many requests/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 12. Returns 400 when query exceeds 500 characters
  // -------------------------------------------------------------------------
  it('returns 400 when query exceeds 500 characters', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());

    const longQuery = 'a'.repeat(501);
    const req = makePostRequest({ query: longQuery });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 13. Returns 200 with type='activities' in response meta
  // -------------------------------------------------------------------------
  it('returns 200 with type="activities" reflected in meta when requested', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('surf beach ocean');
    mockCosineSimilarity.mockReturnValue(0.7);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'act-type-1', name: 'Surfing Lesson' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({ query: 'surfing', type: 'activities' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta.type).toBe('activities');
    expect(body.data.activities).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 14. Applies category filter to prisma query
  // -------------------------------------------------------------------------
  it('passes category filter to prisma when filters.category is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('outdoor sports');
    mockCosineSimilarity.mockReturnValue(0.72);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'act-cat-1', name: 'Rock Climbing', category: 'SPORTS' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({
      query: 'outdoor sports',
      filters: { category: 'SPORTS' },
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Verify prisma was called with the category filter
    expect(mockPrismaActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'SPORTS' }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // 15. Applies priceRange filter to prisma query
  // -------------------------------------------------------------------------
  it('passes priceRange filter to prisma when filters.priceRange is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('cheap food budget');
    mockCosineSimilarity.mockReturnValue(0.65);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'act-price-1', name: 'Street Food Tour', priceRange: 'BUDGET' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({
      query: 'cheap street food',
      filters: { priceRange: 'BUDGET' },
    });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ priceRange: 'BUDGET' }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // 16. Respects limit parameter — returns at most 'limit' results
  // -------------------------------------------------------------------------
  it('returns at most limit results when limit=2 is specified', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    // Query embedding + 5 activity embeddings
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('experience text');
    mockCosineSimilarity.mockReturnValue(0.9);

    const manyActivities = [
      makeActivity({ id: 'lim-1', name: 'Act 1' }),
      makeActivity({ id: 'lim-2', name: 'Act 2' }),
      makeActivity({ id: 'lim-3', name: 'Act 3' }),
      makeActivity({ id: 'lim-4', name: 'Act 4' }),
      makeActivity({ id: 'lim-5', name: 'Act 5' }),
    ];
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      manyActivities as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ query: 'fun activities', limit: 2 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities.length).toBeLessThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 17. Returns 500 when prisma.activity.findMany throws
  // -------------------------------------------------------------------------
  it('returns 500 when prisma.activity.findMany throws an error', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding.mockResolvedValueOnce(MOCK_EMBEDDING);
    mockPrismaActivity.findMany.mockRejectedValueOnce(
      new Error('Database connection lost') as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({ query: 'museums in paris' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/semantic search failed/i);
  });

  // -------------------------------------------------------------------------
  // 18. All activities below threshold → empty results array
  // -------------------------------------------------------------------------
  it('returns empty activities array when all scores are at or below threshold', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('irrelevant text');
    // Both scores exactly at the 0.5 threshold — the filter is `> 0.5`, so 0.5 is excluded
    mockCosineSimilarity
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.4);

    const activities = [
      makeActivity({ id: 'below-1', name: 'Activity A' }),
      makeActivity({ id: 'below-2', name: 'Activity B' }),
    ];
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      activities as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ query: 'unrelated search query' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities).toEqual([]);
    expect(body.meta.totalResults).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 19. Results are sorted by score descending
  // -------------------------------------------------------------------------
  it('returns activities sorted by score descending', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('activity text');
    // Low → high → medium scores for three activities
    mockCosineSimilarity
      .mockReturnValueOnce(0.6)  // sort-1
      .mockReturnValueOnce(0.95) // sort-2
      .mockReturnValueOnce(0.75); // sort-3

    const activities = [
      makeActivity({ id: 'sort-1', name: 'Low Score' }),
      makeActivity({ id: 'sort-2', name: 'High Score' }),
      makeActivity({ id: 'sort-3', name: 'Mid Score' }),
    ];
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      activities as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ query: 'tokyo experience' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities.length).toBe(3);
    // First result should have highest score
    expect(body.data.activities[0].score).toBe(0.95);
    expect(body.data.activities[0].name).toBe('High Score');
    expect(body.data.activities[1].score).toBe(0.75);
    expect(body.data.activities[2].score).toBe(0.6);
  });

  // -------------------------------------------------------------------------
  // 20. Response meta includes query and totalResults
  // -------------------------------------------------------------------------
  it('includes correct query and totalResults in meta', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('spa relaxation');
    mockCosineSimilarity.mockReturnValue(0.88);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'meta-1', name: 'Luxury Spa Day' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({ query: 'spa relaxation', type: 'activities' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.meta.query).toBe('spa relaxation');
    expect(body.meta.totalResults).toBe(1);
    expect(body.meta.type).toBe('activities');
  });

  // -------------------------------------------------------------------------
  // 21. Returns 400 when limit is below minimum (< 1)
  // -------------------------------------------------------------------------
  it('returns 400 when limit is below minimum (0)', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());

    const req = makePostRequest({ query: 'food tours', limit: 0 });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/validation/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 22. Activity metadata is included in response
  // -------------------------------------------------------------------------
  it('includes activity metadata (description, category, cost) in results', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('wine tasting culture');
    mockCosineSimilarity.mockReturnValue(0.82);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({
        id: 'meta-check-1',
        name: 'Wine Tasting Tour',
        description: 'Sample local wines',
        category: 'FOOD',
        cost: 50,
        priceRange: 'MODERATE',
      })] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makePostRequest({ query: 'wine tasting' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const activity = body.data.activities[0];
    expect(activity).toHaveProperty('metadata');
    expect(activity.metadata).toHaveProperty('description');
    expect(activity.metadata).toHaveProperty('category');
    expect(activity.metadata).toHaveProperty('cost');
    expect(activity.metadata).toHaveProperty('priceRange');
  });

  // -------------------------------------------------------------------------
  // 23. Score exactly at 0.5 is excluded (strict >0.5 filter)
  // -------------------------------------------------------------------------
  it('excludes activity with score exactly equal to 0.5', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('borderline activity text');
    mockCosineSimilarity.mockReturnValueOnce(0.5); // exactly at boundary

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'exact-thresh-1', name: 'Borderline Activity' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({ query: 'borderline search' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 24. score > 0.5 passes through filter
  // -------------------------------------------------------------------------
  it('includes activity with score just above 0.5 (0.51)', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('just above threshold text');
    mockCosineSimilarity.mockReturnValueOnce(0.51);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'above-thresh-1', name: 'Just Above Threshold' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makePostRequest({ query: 'just above search' });
    const res = await POST(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities.length).toBe(1);
    expect(body.data.activities[0].score).toBe(0.51);
  });
});

// ===========================================================================
// GET /api/ai/search
// ===========================================================================
describe('GET /api/ai/search', () => {
  // -------------------------------------------------------------------------
  // 11 (original). Returns 400 when ?q param is missing
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
  // 12 (original). Returns 200 with results when ?q and ?limit are provided
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

  // -------------------------------------------------------------------------
  // 25. GET returns 400 when q is an empty string
  // -------------------------------------------------------------------------
  it('returns 400 when q is present but empty string in GET', async () => {
    // GET handler checks for falsy `query` — empty string '' is falsy
    const url = new URL('http://localhost:3000/api/ai/search');
    url.searchParams.set('q', '');
    const req = new Request(url.toString(), { method: 'GET' });

    const res = await GET(req);
    const body = await parseJson(res);

    // Empty string is falsy → GET handler returns 400 before forwarding to POST
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/required/i);
  });

  // -------------------------------------------------------------------------
  // 26. GET forwards type param via q to POST
  // -------------------------------------------------------------------------
  it('GET forwards to POST and returns 200 with activities when q param is valid', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('paris sightseeing');
    mockCosineSimilarity.mockReturnValue(0.78);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [makeActivity({ id: 'get-fwd-1', name: 'Eiffel Tower Tour' })] as unknown as Awaited<
        ReturnType<typeof prisma.activity.findMany>
      >
    );

    const req = makeGetRequest({ q: 'paris sightseeing' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta.query).toBe('paris sightseeing');
    expect(Array.isArray(body.data.activities)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 27. GET with unauthenticated session → 401 (forwarded through POST)
  // -------------------------------------------------------------------------
  it('returns 401 when GET is called with no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeGetRequest({ q: 'museums' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  // -------------------------------------------------------------------------
  // 28. GET with rate limit exceeded → 429 (forwarded through POST)
  // -------------------------------------------------------------------------
  it('returns 429 when GET is called and rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
      limit: 20,
    });

    const req = makeGetRequest({ q: 'beach resorts' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/too many requests/i);
  });

  // -------------------------------------------------------------------------
  // 29. GET with limit=1 → at most 1 result
  // -------------------------------------------------------------------------
  it('returns at most 1 activity when GET is called with limit=1', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING)
      .mockResolvedValueOnce(MOCK_EMBEDDING);
    mockBuildActivityText.mockReturnValue('hiking trails outdoor');
    mockCosineSimilarity.mockReturnValue(0.85);

    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [
        makeActivity({ id: 'get-lim-1', name: 'Mountain Hike' }),
        makeActivity({ id: 'get-lim-2', name: 'Forest Walk' }),
        makeActivity({ id: 'get-lim-3', name: 'Coastal Path' }),
      ] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makeGetRequest({ q: 'hiking trails', limit: '1' });
    const res = await GET(req);
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities.length).toBeLessThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 30. GET with no limit param uses default limit (10)
  // -------------------------------------------------------------------------
  it('GET uses default limit of 10 when limit param is not provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(makeSession());
    mockGenerateEmbedding.mockResolvedValueOnce(MOCK_EMBEDDING);
    mockPrismaActivity.findMany.mockResolvedValueOnce(
      [] as unknown as Awaited<ReturnType<typeof prisma.activity.findMany>>
    );

    const req = makeGetRequest({ q: 'default limit test' });
    const res = await GET(req);
    const body = await parseJson(res);

    // Should call POST successfully with default limit — empty DB returns empty array
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.activities).toEqual([]);
  });
});
