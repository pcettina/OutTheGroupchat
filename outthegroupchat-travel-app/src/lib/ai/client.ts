import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

// OpenAI client configuration
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: 'strict',
});

// Anthropic Claude client configuration
export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default models
export const models = {
  // Fast model for quick responses
  fast: openai('gpt-4o-mini'),
  
  // High quality model for complex tasks
  quality: openai('gpt-4o'),
  
  // Claude for long-form content
  claude: anthropic('claude-3-5-sonnet-20241022'),
  
  // Claude Haiku for fast responses
  claudeFast: anthropic('claude-3-haiku-20240307'),
} as const;

// Get the appropriate model based on task type
export function getModel(task: 'itinerary' | 'chat' | 'suggestions' | 'analysis' | 'recommendations') {
  switch (task) {
    case 'itinerary':
      return models.quality;
    case 'chat':
      return models.fast;
    case 'suggestions':
      return models.fast;
    case 'recommendations':
      return models.fast;
    case 'analysis':
      return models.quality; // Fall back to OpenAI if no Anthropic key
    default:
      return models.fast;
  }
}

// Re-export rate limiting from centralized module
// This provides Redis-backed rate limiting for serverless environments
export { 
  aiRateLimiter, 
  checkRateLimit as checkRedisRateLimit,
  getRateLimitHeaders 
} from '@/lib/rate-limit';

/**
 * @deprecated Use checkRedisRateLimit from @/lib/rate-limit instead
 * Legacy rate limiting helper - kept for backward compatibility
 * This in-memory version fails in serverless/multi-instance deployments
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string, limit = 20, windowMs = 60000): boolean {
  console.warn('[DEPRECATED] Using in-memory rate limiting. Migrate to Redis-based rate limiting.');
  const now = Date.now();
  const userLimit = requestCounts.get(userId);
  
  if (!userLimit || userLimit.resetAt < now) {
    requestCounts.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (userLimit.count >= limit) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

// Token estimation helper
export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Cost tracking (approximate)
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-3-5-sonnet' | 'claude-3-haiku'
): number {
  const rates = {
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  };
  
  const rate = rates[model];
  return (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
}

