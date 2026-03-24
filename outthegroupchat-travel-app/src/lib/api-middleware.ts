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
 * Wrap an API route with authentication check
 * Returns 401 if user is not authenticated
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
 * Wrap an API route with rate limiting
 * @param type - 'api' for general routes, 'auth' for authentication routes
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
 * Wrap an API route with Zod validation for request body
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
 * Wrap an API route with query parameter validation
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
 * Combine multiple middleware functions
 * Apply from right to left (innermost to outermost)
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
 * Format Zod validation errors into a more readable format
 */
function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Create a standardized success response
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Create a standardized error response
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
 * Handle unknown errors safely
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
