/**
 * Unit tests for POST /api/ai/icebreakers
 *
 * Strategy
 * --------
 * - `ai` (Vercel AI SDK) is mocked so generateText returns a controllable payload.
 * - `@/lib/ai/client` is mocked to stub getModel.
 * - `@/lib/rate-limit` is mocked at the module level for rate-limit control.
 * - Prisma, NextAuth, logger, and sentry mocks come from src/__tests__/setup.ts.
 * - Each test uses mockResolvedValueOnce only; vi.clearAllMocks() runs in beforeEach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Module-level mocks — must be hoisted before any static imports that
// transitively pull these modules.
// ---------------------------------------------------------------------------

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@/lib/ai/client', () => ({
  isOpenAIConfigured: vi.fn(() => true),
  getModel: vi.fn(),
  checkRateLimit: vi.fn(() => true),
  checkRedisRateLimit: vi.fn(),
  aiRateLimiter: null,
  getRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: null,
  aiRateLimiter: null,
  authRateLimiter: null,
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

// Static imports — after vi.mock() hoisting
import { generateText } from 'ai';
import { getModel } from '@/lib/ai/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { POST } from '@/app/api/ai/icebreakers/route';

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------
const mockGetServerSession = vi.mocked(getServerSession);
const mockGenerateText = vi.mocked(generateText);
const mockGetModel = vi.mocked(getModel);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

const mockPrismaCrew = prisma.crew as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
};
const mockPrismaUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CALLER_ID = 'user-caller-001';
const CREW_MEMBER_ID = 'user-member-002';

const SESSION = {
  user: { id: CALLER_ID, name: 'Alice', email: 'alice@test.com' },
  expires: '2099-01-01',
};

const MOCK_MODEL = {} as ReturnType<typeof getModel>;

const MOCK_ICEBREAKERS = [
  "What's the best meal you've had recently?",
  'If you could visit any city right now, where would you go?',
  "What's your go-to hangout spot in your city?",
  'What kind of music are you into lately?',
  'Have you discovered any hidden gems in your neighborhood?',
];

const MOCK_AI_TEXT = JSON.stringify(MOCK_ICEBREAKERS);

const ACCEPTED_CREW = {
  id: 'crew-001',
  userAId: CALLER_ID,
  userBId: CREW_MEMBER_ID,
  status: 'ACCEPTED',
  requestedById: CALLER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CREW_MEMBER_USER = { name: 'Bob' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = 'http://localhost/api/ai/icebreakers';

function makePostReq(body: unknown): NextRequest {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// beforeEach — clear state so mockResolvedValueOnce queues don't bleed
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm rate limit mock after clearAllMocks() wipes it
  mockCheckRateLimit.mockResolvedValue({ success: true, limit: 10, remaining: 9, reset: 0 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/ai/icebreakers', () => {
  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when crewMemberId is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makePostReq({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when body is invalid JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON in request body');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const res = await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('returns 403 when users are not crew members', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockPrismaCrew.findFirst.mockResolvedValueOnce(null);

    const res = await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/crew members/i);
  });

  it('returns 200 with icebreakers array on success', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockPrismaCrew.findFirst.mockResolvedValueOnce(ACCEPTED_CREW);
    mockPrismaUser.findUnique.mockResolvedValueOnce(CREW_MEMBER_USER);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('icebreakers');
    expect(Array.isArray(body.icebreakers)).toBe(true);
    expect(body.icebreakers).toHaveLength(5);
    body.icebreakers.forEach((item: unknown) => expect(typeof item).toBe('string'));
  });

  it('returns valid response shape with icebreakers as string[]', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockPrismaCrew.findFirst.mockResolvedValueOnce(ACCEPTED_CREW);
    mockPrismaUser.findUnique.mockResolvedValueOnce(CREW_MEMBER_USER);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockResolvedValueOnce(
      { text: MOCK_AI_TEXT } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));
    const body = await res.json();

    // Shape assertion: only key is icebreakers
    expect(Object.keys(body)).toEqual(['icebreakers']);
    expect(body.icebreakers).toEqual(MOCK_ICEBREAKERS);
  });

  it('returns 500 when generateText throws', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockPrismaCrew.findFirst.mockResolvedValueOnce(ACCEPTED_CREW);
    mockPrismaUser.findUnique.mockResolvedValueOnce(CREW_MEMBER_USER);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    mockGenerateText.mockRejectedValueOnce(new Error('OpenAI service unavailable'));

    const res = await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to generate icebreakers');
  });

  it('checks crew.findFirst with correct OR clause for both orderings', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockPrismaCrew.findFirst.mockResolvedValueOnce(null);

    await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));

    expect(mockPrismaCrew.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { userAId: CALLER_ID, userBId: CREW_MEMBER_ID },
            { userAId: CREW_MEMBER_ID, userBId: CALLER_ID },
          ]),
          status: 'ACCEPTED',
        }),
      })
    );
  });

  it('returns 200 with empty icebreakers when AI returns non-array JSON', async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockPrismaCrew.findFirst.mockResolvedValueOnce(ACCEPTED_CREW);
    mockPrismaUser.findUnique.mockResolvedValueOnce(CREW_MEMBER_USER);
    mockGetModel.mockReturnValueOnce(MOCK_MODEL);
    // AI returns a non-array JSON object — the route should handle gracefully
    mockGenerateText.mockResolvedValueOnce(
      { text: '{"message": "here are your icebreakers"}' } as unknown as Awaited<ReturnType<typeof generateText>>
    );

    const res = await POST(makePostReq({ crewMemberId: CREW_MEMBER_ID }));

    // Route should not crash — returns 200 with empty icebreakers
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('icebreakers');
    expect(Array.isArray(body.icebreakers)).toBe(true);
  });
});
