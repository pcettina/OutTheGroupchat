/**
 * @module api-middleware
 * @description Higher-order functions and utilities for Next.js App Router API routes.
 * Provides composable middleware for authentication, rate limiting, and Zod body/query
 * validation, along with standardized success/error response helpers and common Zod schemas.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ZodSchema, ZodError } from 'zod';
import { authOptions } from '@/lib/auth';
import { checkRateLimit, apiRateLimiter, authRateLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// ============================================
// Types
// ============================================

/**
 * @description Generic API route handler type for Next.js App Router route handlers
 * that do not require an authenticated session.
 */
export type ApiHandler<T = unknown> = (
  req: NextRequest,
  context: { params: Record<string, string> }
) => Promise<NextResponse<T>>;

/**
 * @description API route handler type for routes that require an authenticated session.
 * The `context` argument includes the resolved session user alongside route params.
 */
export type AuthenticatedHandler<T = unknown> = (
  req: NextRequest,
  context: {
    params: Record<string, string>;
    session: { user: { id: string; name?: string | null; email?: string | null } };
  }
) => Promise<NextResponse<T>>;

/**
 * @description Standard shape for API error responses returned by all route handlers.
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

/**
 * @description Standard shape for API success responses returned by all route handlers.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

// ============================================
// Middleware Functions
// ============================================

/**
 * Wrap an API route handler with a NextAuth session authentication check.
 * Returns a 401 JSON response if no valid session is found, otherwise forwards
 * the resolved session user to the inner handler.
 *
 * @param handler - The authenticated route handler to protect
 * @returns A standard `ApiHandler` that performs the auth check before delegating
 */
export function withAuth<T>(
  handler: AuthenticatedHandler<T>
): ApiHandler<T | ApiErrorResponse> {
  return async (req, context) => {
    try {
      const session = await getServerSession(authOptions);

      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }

      return handler(req, {
        ...context,
        session: { user: session.user as { id: string; name?: string | null; email?: string | null } },
      });
    } catch (error) {
      logger.error({ error }, '[API_AUTH_ERROR] Authentication error');
      return NextResponse.json(
        { success: false, error: 'Authentication error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Wrap an API route handler with Upstash Redis-backed rate limiting.
 * Returns a 429 JSON response with standard rate-limit headers when the limit is exceeded.
 *
 * @param handler - The route handler to protect with rate limiting
 * @param type - Limiter profile: `'api'` (default) uses the general API limiter keyed by
 *   Authorization header; `'auth'` uses the stricter auth limiter keyed by client IP
 * @returns A standard `ApiHandler` that enforces rate limits before delegating
 */
export function withRateLimit<T>(
  handler: ApiHandler<T>,
  type: 'api' | 'auth' = 'api'
): ApiHandler<T | ApiErrorResponse> {
  return async (req, context) => {
    const limiter = type === 'auth' ? authRateLimiter : apiRateLimiter;
    
    // Get identifier - use IP for auth routes, user ID for API routes
    const identifier = type === 'auth'
      ? req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'anonymous'
      : req.headers.get('authorization') || 'anonymous';

    const result = await checkRateLimit(limiter, identifier);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.reset.toString(),
            'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    return handler(req, context);
  };
}

/**
 * Wrap an API route handler with Zod validation for the JSON request body.
 * Parses and validates the body against `schema`; returns a 400 response with
 * structured field errors on failure, or a 400 response if the JSON is malformed.
 *
 * @param schema - Zod schema to validate the parsed request body against
 * @param handler - Inner handler that receives the validated, typed body as a third argument
 * @returns A standard `ApiHandler` that validates the body before delegating
 */
export function withValidation<TBody, TResponse>(
  schema: ZodSchema<TBody>,
  handler: (
    req: NextRequest,
    context: { params: Record<string, string> },
    body: TBody
  ) => Promise<NextResponse<TResponse>>
): ApiHandler<TResponse | ApiErrorResponse> {
  return async (req, context) => {
    try {
      const rawBody = await req.json();
      const result = schema.safeParse(rawBody);

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: formatZodError(result.error),
          },
          { status: 400 }
        );
      }

      return handler(req, context, result.data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { success: false, error: 'Invalid JSON in request body' },
          { status: 400 }
        );
      }
      throw error;
    }
  };
}

/**
 * Wrap an API route handler with Zod validation for URL query parameters.
 * Collects all `searchParams` from the request URL (handling repeated keys as arrays),
 * validates against `schema`, and returns a 400 response with field errors on failure.
 *
 * @param schema - Zod schema to validate the collected query parameter object against
 * @param handler - Inner handler that receives the validated, typed query as a third argument
 * @returns A standard `ApiHandler` that validates query params before delegating
 */
export function withQueryValidation<TQuery, TResponse>(
  schema: ZodSchema<TQuery>,
  handler: (
    req: NextRequest,
    context: { params: Record<string, string> },
    query: TQuery
  ) => Promise<NextResponse<TResponse>>
): ApiHandler<TResponse | ApiErrorResponse> {
  return async (req, context) => {
    const { searchParams } = new URL(req.url);
    const queryObject: Record<string, string | string[]> = {};

    searchParams.forEach((value, key) => {
      if (queryObject[key]) {
        // Handle multiple values for same key
        if (Array.isArray(queryObject[key])) {
          (queryObject[key] as string[]).push(value);
        } else {
          queryObject[key] = [queryObject[key] as string, value];
        }
      } else {
        queryObject[key] = value;
      }
    });

    const result = schema.safeParse(queryObject);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: formatZodError(result.error),
        },
        { status: 400 }
      );
    }

    return handler(req, context, result.data);
  };
}

/**
 * Compose multiple middleware wrappers into a single wrapper applied right-to-left
 * (innermost first). The composed wrapper can then be applied to a base handler.
 *
 * @param middlewares - Middleware wrapper functions to compose; applied from right to left
 * @returns A function that accepts a base `ApiHandler<T>` and returns the fully-wrapped handler
 */
export function compose<T>(
  ...middlewares: ((handler: ApiHandler<unknown>) => ApiHandler<unknown>)[]
) {
  return (handler: ApiHandler<T>): ApiHandler<unknown> => {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), handler as ApiHandler<unknown>);
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert a `ZodError` into a flat array of field-level error objects.
 *
 * @param error - The `ZodError` produced by a failed `safeParse` call
 * @returns Array of objects with `field` (dot-joined path) and `message` (validation message)
 */
function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Create a standardized JSON success response with the `ApiSuccessResponse` envelope.
 *
 * @param data - The payload to include under the `data` key
 * @param status - HTTP status code (default: 200)
 * @returns A `NextResponse` with `{ success: true, data }` and the given status
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Create a standardized JSON error response with the `ApiErrorResponse` envelope.
 *
 * @param error - Human-readable error message
 * @param status - HTTP status code (default: 400)
 * @param details - Optional additional diagnostic detail (e.g., Zod field errors)
 * @returns A `NextResponse` with `{ success: false, error, details? }` and the given status
 */
export function apiError(
  error: string,
  status = 400,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = details 
    ? { success: false, error, details }
    : { success: false, error };
  return NextResponse.json(response, { status });
}

/**
 * Safely handle an unknown thrown value and return an appropriate `ApiErrorResponse`.
 * Logs the error via the application logger, returns 400 for `ZodError`, and 500 for
 * all other errors. Internal `Error` messages are only exposed in development.
 *
 * @param error - The caught value (may be `Error`, `ZodError`, or anything else)
 * @returns A `NextResponse` with an appropriate status and `ApiErrorResponse` body
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  logger.error({ error }, '[API_ERROR] Unexpected error');

  if (error instanceof ZodError) {
    return apiError('Validation failed', 400, formatZodError(error));
  }

  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const message = process.env.NODE_ENV === 'development'
      ? error.message
      : 'An unexpected error occurred';
    return apiError(message, 500);
  }

  return apiError('An unexpected error occurred', 500);
}

// ============================================
// Common Validation Schemas
// ============================================

import { z } from 'zod';

/**
 * @description Zod schema for pagination query parameters. Validates and coerces `page`
 * (positive integer, default 1) and `limit` (positive integer up to 100, default 20).
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * @description Zod schema that validates a single CUID `id` route parameter.
 */
export const idParamSchema = z.object({
  id: z.string().cuid(),
});

/**
 * @description Zod schema that validates a single CUID `tripId` route parameter.
 */
export const tripIdParamSchema = z.object({
  tripId: z.string().cuid(),
});

/**
 * @description Zod schema for search query parameters. Validates an optional search string `q`
 * (1–100 characters) combined with pagination fields from `paginationSchema`.
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100).optional(),
  ...paginationSchema.shape,
});
