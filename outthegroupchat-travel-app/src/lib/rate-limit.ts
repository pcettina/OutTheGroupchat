/**
 * @module rate-limit
 * @description Rate limiting utilities backed by Upstash Redis. Provides pre-configured
 * sliding-window rate limiters for AI, general API, and authentication endpoints, along with
 * helper functions for checking limits and generating standard HTTP rate-limit response headers.
 * When Redis environment variables are absent (e.g. local development) all limiters are null
 * and {@link checkRateLimit} returns a permissive allow-all result.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from '@/lib/logger';

// Get and clean environment variables (remove any whitespace/newlines)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.trim();
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

// Check if Redis is configured
const isRedisConfigured = !!(REDIS_URL && REDIS_TOKEN);

// Create Redis instance only if configured
const redis = isRedisConfigured 
  ? new Redis({
      url: REDIS_URL!,
      token: REDIS_TOKEN!,
    })
  : null;

/**
 * @description Rate limiter for AI endpoints using a sliding window algorithm.
 * Allows 20 requests per minute per identifier. Analytics are enabled for monitoring.
 * Resolves to `null` when Redis is not configured; callers should treat `null` as disabled.
 */
export const aiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      analytics: true,
      prefix: "ratelimit:ai",
    })
  : null;

/**
 * @description Rate limiter for general API endpoints using a sliding window algorithm.
 * Allows 100 requests per minute per identifier.
 * Resolves to `null` when Redis is not configured; callers should treat `null` as disabled.
 */
export const apiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "ratelimit:api",
    })
  : null;

/**
 * @description Rate limiter for authentication endpoints using a stricter sliding window.
 * Allows only 5 requests per minute per IP address to mitigate brute-force attacks.
 * Analytics are enabled for monitoring. Resolves to `null` when Redis is not configured.
 */
export const authRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      analytics: true,
      prefix: "ratelimit:auth",
    })
  : null;

/**
 * @description Checks whether the given identifier has exceeded the rate limit imposed by `limiter`.
 * When `limiter` is `null` (Redis not configured) all requests are permitted and zeros are returned
 * for the numeric fields. On unexpected errors the function logs the failure and returns a
 * permissive result so that rate-limit errors never silently break API responses.
 *
 * @param {Ratelimit | null} limiter - The Upstash Ratelimit instance to check against, or `null`
 *   to skip rate limiting (development / unconfigured fallback).
 * @param {string} identifier - A unique key representing the caller, typically a user ID or IP address.
 * @returns {Promise<{ success: boolean; limit: number; remaining: number; reset: number }>}
 *   An object indicating whether the request is allowed (`success`), the configured window limit,
 *   the number of remaining requests in the current window, and the UNIX timestamp (ms) at which
 *   the window resets.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  // If Redis is not configured, allow all requests (development fallback)
  if (!limiter) {
    logger.warn('[RATE_LIMIT] Redis not configured, skipping rate limit check');
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    logger.error({ error }, '[RATE_LIMIT] Error checking rate limit');
    // On error, allow the request but log the issue
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
}

/**
 * @description Converts a rate-limit result into a set of standard HTTP response headers
 * (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) suitable for inclusion
 * in any HTTP response.
 *
 * @param {{ limit: number; remaining: number; reset: number }} result - The rate-limit result
 *   fields to encode as headers (typically obtained from {@link checkRateLimit}).
 * @returns {Record<string, string>} A plain object mapping header names to their string values.
 */
export function getRateLimitHeaders(result: {
  limit: number;
  remaining: number;
  reset: number;
}): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };
}

