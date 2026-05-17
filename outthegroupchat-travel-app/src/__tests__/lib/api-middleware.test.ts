/**
 * Unit tests for src/lib/api-middleware.ts
 *
 * Covers:
 *  - withAuth — returns 401 when no session, calls handler when authenticated,
 *    returns 500 on getServerSession throw.
 *  - withRateLimit — returns 429 when limiter blocks, calls handler when allowed,
 *    chooses correct identifier (IP for auth, authorization header for api).
 *  - withValidation — returns 400 on Zod failure, 400 on invalid JSON, calls
 *    handler with parsed body on success.
 *  - withQueryValidation — returns 400 on Zod failure, calls handler with parsed
 *    query on success, handles repeated query keys as arrays.
 *  - compose — applies middleware right-to-left.
 *  - apiSuccess / apiError — produce standardized response shapes.
 *  - handleApiError — branches for ZodError, Error, and unknown.
 *  - Schemas — paginationSchema, idParamSchema, tripIdParamSchema,
 *    searchQuerySchema parse/reject expected inputs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z, ZodError } from 'zod';

import {
  withAuth,
  withRateLimit,
  withValidation,
  withQueryValidation,
  compose,
  apiSuccess,
  apiError,
  handleApiError,
  paginationSchema,
  idParamSchema,
  tripIdParamSchema,
  searchQuerySchema,
  type ApiHandler,
} from '@/lib/api-middleware';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Mock rate-limit module (setup.ts already mocks next-auth, logger, sentry)
// ---------------------------------------------------------------------------
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  apiRateLimiter: { name: 'api' },
  authRateLimiter: { name: 'auth' },
}));

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

// Helper: build a NextRequest with optional headers
function makeRequest(
  url = 'https://example.com/api/test',
  init?: RequestInit
): NextRequest {
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

const emptyContext = { params: {} as Record<string, string> };

beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// withAuth
// ===========================================================================
describe('withAuth', () => {
  it('returns 401 when there is no session', async () => {
    mockedGetServerSession.mockResolvedValueOnce(null);

    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), emptyContext);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when session exists but lacks user.id', async () => {
    mockedGetServerSession.mockResolvedValueOnce({ user: {} } as never);

    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), emptyContext);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the wrapped handler with session when authenticated', async () => {
    mockedGetServerSession.mockResolvedValueOnce({
      user: { id: 'user-123', email: 'a@b.com', name: 'Alice' },
    } as never);

    const handler = vi.fn().mockResolvedValueOnce(
      NextResponse.json({ ok: true })
    );
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), emptyContext);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0][1];
    expect(ctx.session.user.id).toBe('user-123');
    expect(ctx.session.user.email).toBe('a@b.com');
  });

  it('preserves the original params on the context passed to the handler', async () => {
    mockedGetServerSession.mockResolvedValueOnce({
      user: { id: 'u1' },
    } as never);

    const handler = vi.fn().mockResolvedValueOnce(NextResponse.json({}));
    const wrapped = withAuth(handler);

    await wrapped(makeRequest(), { params: { tripId: 'trip-abc' } });

    expect(handler.mock.calls[0][1].params).toEqual({ tripId: 'trip-abc' });
  });

  it('returns 500 when getServerSession throws', async () => {
    mockedGetServerSession.mockRejectedValueOnce(new Error('boom'));

    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), emptyContext);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, error: 'Authentication error' });
    expect(handler).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// withRateLimit
// ===========================================================================
describe('withRateLimit', () => {
  const okHandler = (): ReturnType<ApiHandler> =>
    Promise.resolve(NextResponse.json({ ok: true }) as NextResponse);

  it('calls the wrapped handler when checkRateLimit succeeds', async () => {
    mockedCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
    });

    const handler = vi.fn(okHandler);
    const wrapped = withRateLimit(handler);

    const res = await wrapped(makeRequest(), emptyContext);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns 429 with rate-limit headers when checkRateLimit blocks', async () => {
    const reset = Date.now() + 30_000;
    mockedCheckRateLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset,
    });

    const handler = vi.fn(okHandler);
    const wrapped = withRateLimit(handler);

    const res = await wrapped(makeRequest(), emptyContext);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body).toEqual({
      success: false,
      error: 'Rate limit exceeded. Please try again later.',
    });
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(res.headers.get('X-RateLimit-Reset')).toBe(reset.toString());
    expect(res.headers.get('Retry-After')).not.toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses the authorization header as identifier for type 'api'", async () => {
    mockedCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });

    const handler = vi.fn(okHandler);
    const wrapped = withRateLimit(handler, 'api');

    const req = makeRequest('https://example.com/api/test', {
      headers: { authorization: 'Bearer tok-xyz' },
    });
    await wrapped(req, emptyContext);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'Bearer tok-xyz'
    );
  });

  it("uses x-forwarded-for as identifier for type 'auth'", async () => {
    mockedCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 0,
    });

    const handler = vi.fn(okHandler);
    const wrapped = withRateLimit(handler, 'auth');

    const req = makeRequest('https://example.com/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    await wrapped(req, emptyContext);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      '203.0.113.7'
    );
  });

  it("falls back to 'anonymous' when no identifying header is present", async () => {
    mockedCheckRateLimit.mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: 0,
    });

    const handler = vi.fn(okHandler);
    const wrapped = withRateLimit(handler, 'api');

    await wrapped(makeRequest(), emptyContext);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'anonymous'
    );
  });
});

// ===========================================================================
// withValidation (body)
// ===========================================================================
describe('withValidation', () => {
  const bodySchema = z.object({
    name: z.string().min(1),
    age: z.number().int().nonnegative(),
  });

  it('calls handler with parsed body when validation succeeds', async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ ok: true }));
    const wrapped = withValidation(bodySchema, handler);

    const req = makeRequest('https://example.com/api/x', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice', age: 30 }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await wrapped(req, emptyContext);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][2]).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns 400 with validation details when body fails schema', async () => {
    const handler = vi.fn();
    const wrapped = withValidation(bodySchema, handler);

    const req = makeRequest('https://example.com/api/x', {
      method: 'POST',
      body: JSON.stringify({ name: '', age: -1 }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await wrapped(req, emptyContext);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body is invalid JSON', async () => {
    const handler = vi.fn();
    const wrapped = withValidation(bodySchema, handler);

    const req = makeRequest('https://example.com/api/x', {
      method: 'POST',
      body: 'not-json{',
      headers: { 'content-type': 'application/json' },
    });

    const res = await wrapped(req, emptyContext);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: 'Invalid JSON in request body',
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// withQueryValidation
// ===========================================================================
describe('withQueryValidation', () => {
  const querySchema = z.object({
    q: z.string().min(1),
    page: z.coerce.number().int().positive().optional(),
  });

  it('calls handler with parsed query when validation succeeds', async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ ok: true }));
    const wrapped = withQueryValidation(querySchema, handler);

    const req = makeRequest('https://example.com/api/x?q=hello&page=2');

    const res = await wrapped(req, emptyContext);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][2]).toEqual({ q: 'hello', page: 2 });
  });

  it('returns 400 with invalid query parameter details', async () => {
    const handler = vi.fn();
    const wrapped = withQueryValidation(querySchema, handler);

    const req = makeRequest('https://example.com/api/x'); // missing required q

    const res = await wrapped(req, emptyContext);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid query parameters');
    expect(Array.isArray(body.details)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('groups repeated query keys into an array', async () => {
    const repeatSchema = z.object({
      tag: z.array(z.string()),
    });

    const handler = vi
      .fn()
      .mockResolvedValueOnce(NextResponse.json({ ok: true }));
    const wrapped = withQueryValidation(repeatSchema, handler);

    const req = makeRequest('https://example.com/api/x?tag=a&tag=b&tag=c');

    const res = await wrapped(req, emptyContext);

    expect(res.status).toBe(200);
    expect(handler.mock.calls[0][2]).toEqual({ tag: ['a', 'b', 'c'] });
  });
});

// ===========================================================================
// compose
// ===========================================================================
describe('compose', () => {
  it('applies middleware in right-to-left order', async () => {
    const calls: string[] = [];

    const mwA =
      (inner: ApiHandler<unknown>): ApiHandler<unknown> =>
      async (req, ctx) => {
        calls.push('A-before');
        const res = await inner(req, ctx);
        calls.push('A-after');
        return res;
      };

    const mwB =
      (inner: ApiHandler<unknown>): ApiHandler<unknown> =>
      async (req, ctx) => {
        calls.push('B-before');
        const res = await inner(req, ctx);
        calls.push('B-after');
        return res;
      };

    const handler: ApiHandler = async () => {
      calls.push('handler');
      return NextResponse.json({ ok: true });
    };

    const composed = compose(mwA, mwB)(handler);
    await composed(makeRequest(), emptyContext);

    // compose uses reduceRight: rightmost wraps first → leftmost is outermost.
    // So A is outermost, B is innermost: A-before, B-before, handler, B-after, A-after
    expect(calls).toEqual([
      'A-before',
      'B-before',
      'handler',
      'B-after',
      'A-after',
    ]);
  });

  it('returns a no-op composition when no middleware is provided', async () => {
    const handler = vi
      .fn<ApiHandler>()
      .mockResolvedValueOnce(NextResponse.json({ ok: true }));

    const composed = compose()(handler);
    const res = await composed(makeRequest(), emptyContext);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// apiSuccess / apiError
// ===========================================================================
describe('apiSuccess', () => {
  it('returns 200 with success: true and the provided data', async () => {
    const res = apiSuccess({ id: 1, name: 'thing' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { id: 1, name: 'thing' } });
  });

  it('honors a custom status code', async () => {
    const res = apiSuccess({ created: true }, 201);
    expect(res.status).toBe(201);
  });
});

describe('apiError', () => {
  it('returns 400 by default with the provided error message', async () => {
    const res = apiError('Bad thing');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Bad thing' });
  });

  it('honors a custom status code', async () => {
    const res = apiError('Forbidden', 403);
    expect(res.status).toBe(403);
  });

  it('includes details when provided', async () => {
    const res = apiError('Validation failed', 422, [{ field: 'email', message: 'invalid' }]);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: 'Validation failed',
      details: [{ field: 'email', message: 'invalid' }],
    });
  });

  it('omits details when not provided', async () => {
    const res = apiError('Nope', 401);
    const body = await res.json();
    expect(body).not.toHaveProperty('details');
  });
});

// ===========================================================================
// handleApiError
// ===========================================================================
describe('handleApiError', () => {
  it('returns 400 with validation details when given a ZodError', async () => {
    const schema = z.object({ x: z.string() });
    const parse = schema.safeParse({ x: 1 });
    expect(parse.success).toBe(false);
    const zodErr = (parse as { error: ZodError }).error;

    const res = handleApiError(zodErr);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 500 with generic message for a non-development Error', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = handleApiError(new Error('internal boom'));
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns 500 with the real message for an Error in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const res = handleApiError(new Error('detailed dev msg'));
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.error).toBe('detailed dev msg');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns 500 with generic message for an unknown non-Error value', async () => {
    const res = handleApiError('a bare string error');
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: 'An unexpected error occurred',
    });
  });
});

// ===========================================================================
// Common Validation Schemas
// ===========================================================================
describe('paginationSchema', () => {
  it('parses valid page/limit values', () => {
    const result = paginationSchema.parse({ page: '3', limit: '50' });
    expect(result).toEqual({ page: 3, limit: 50 });
  });

  it('applies defaults when fields are missing', () => {
    const result = paginationSchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it('rejects non-positive page', () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
  });

  it('rejects limit greater than 100', () => {
    expect(() => paginationSchema.parse({ limit: 200 })).toThrow();
  });
});

describe('idParamSchema', () => {
  it('accepts a valid CUID', () => {
    const result = idParamSchema.parse({ id: 'clx7g8h2k0000abcd1234efgh' });
    expect(result.id).toBe('clx7g8h2k0000abcd1234efgh');
  });

  it('rejects a non-CUID string', () => {
    expect(() => idParamSchema.parse({ id: 'not-a-cuid' })).toThrow();
  });
});

describe('tripIdParamSchema', () => {
  it('accepts a valid CUID for tripId', () => {
    const result = tripIdParamSchema.parse({ tripId: 'clx7g8h2k0000abcd1234efgh' });
    expect(result.tripId).toBe('clx7g8h2k0000abcd1234efgh');
  });

  it('rejects an empty tripId', () => {
    expect(() => tripIdParamSchema.parse({ tripId: '' })).toThrow();
  });
});

describe('searchQuerySchema', () => {
  it('accepts q with default pagination', () => {
    const result = searchQuerySchema.parse({ q: 'hello' });
    expect(result).toEqual({ q: 'hello', page: 1, limit: 20 });
  });

  it('allows q to be omitted', () => {
    const result = searchQuerySchema.parse({});
    expect(result.q).toBeUndefined();
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('rejects empty q string', () => {
    expect(() => searchQuerySchema.parse({ q: '' })).toThrow();
  });

  it('rejects q longer than 100 characters', () => {
    expect(() => searchQuerySchema.parse({ q: 'a'.repeat(101) })).toThrow();
  });
});
