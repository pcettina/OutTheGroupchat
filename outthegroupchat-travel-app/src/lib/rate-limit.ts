import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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
 * Rate limiter for AI endpoints
 * Limits: 20 requests per minute per user
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
 * Rate limiter for general API endpoints
 * Limits: 100 requests per minute per user
 */
export const apiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "ratelimit:api",
    })
  : null;

/**
 * Rate limiter for authentication endpoints
 * Limits: 5 requests per minute per IP (stricter for auth)
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
 * Check rate limit for a given identifier
 * Returns { success: boolean, limit: number, remaining: number, reset: number }
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  // If Redis is not configured, allow all requests (development fallback)
  if (!limiter) {
    console.warn('[RATE_LIMIT] Redis not configured, skipping rate limit check');
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
    console.error('[RATE_LIMIT] Error checking rate limit:', error);
    // On error, allow the request but log the issue
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
}

/**
 * Get rate limit headers for response
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

