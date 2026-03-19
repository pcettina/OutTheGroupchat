import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { logger } from '@/lib/logger';

/**
 * @description Checks whether the OpenAI API key is present and well-formed (starts with 'sk-').
 * @returns {boolean} True if the OPENAI_API_KEY environment variable is set and valid.
 */
export function isOpenAIConfigured(): boolean {
  const apiKey = process.env.OPENAI_API_KEY;
  // Check if key exists and is not empty, and starts with 'sk-' (OpenAI key format)
  return !!(apiKey && apiKey.trim().length > 0 && apiKey.startsWith('sk-'));
}

/**
 * @description Checks whether the Anthropic API key is present in the environment.
 * @returns {boolean} True if the ANTHROPIC_API_KEY environment variable is set.
 */
export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Create clients lazily to avoid issues with missing env vars at module load
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: 'strict',
  });
}

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * @description Returns the appropriate AI model instance for the given task type.
 * Uses GPT-4o for itinerary and analysis tasks, GPT-4o-mini for chat and suggestions,
 * and Claude claude-3-5-sonnet for analysis when Anthropic is configured.
 * @param {'itinerary' | 'chat' | 'suggestions' | 'analysis' | 'recommendations'} task - The task type to select a model for.
 * @returns The configured AI model instance for the specified task.
 * @throws {Error} If OPENAI_API_KEY is not configured.
 */
export function getModel(task: 'itinerary' | 'chat' | 'suggestions' | 'analysis' | 'recommendations') {
  // Check if OpenAI is configured (required for most tasks)
  if (!isOpenAIConfigured()) {
    throw new Error('AI service is not configured. Please set OPENAI_API_KEY environment variable.');
  }
  
  const openai = getOpenAIClient();
  
  switch (task) {
    case 'itinerary':
      return openai('gpt-4o');
    case 'chat':
      return openai('gpt-4o-mini');
    case 'suggestions':
      return openai('gpt-4o-mini');
    case 'recommendations':
      return openai('gpt-4o-mini');
    case 'analysis':
      // Use Claude if available, otherwise fall back to OpenAI
      if (isAnthropicConfigured()) {
        const anthropic = getAnthropicClient();
        return anthropic('claude-3-5-sonnet-20241022');
      }
      return openai('gpt-4o');
    default:
      return openai('gpt-4o-mini');
  }
}

/**
 * @description Legacy OpenAI client instance for backward compatibility.
 * Null when OPENAI_API_KEY is not configured. Prefer getModel() for new code.
 */
export const openai = isOpenAIConfigured() 
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY, compatibility: 'strict' })
  : null;

/**
 * @description Legacy Anthropic client instance for backward compatibility.
 * Null when ANTHROPIC_API_KEY is not configured. Prefer getModel() for new code.
 */
export const anthropic = isAnthropicConfigured()
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * @description Lazy model accessor object that creates model instances on demand.
 * Each getter calls the underlying client factory, throwing if the required API key is absent.
 */
export const models = {
  get fast() { return getOpenAIClient()('gpt-4o-mini'); },
  get quality() { return getOpenAIClient()('gpt-4o'); },
  get claude() { return getAnthropicClient()('claude-3-5-sonnet-20241022'); },
  get claudeFast() { return getAnthropicClient()('claude-3-haiku-20240307'); },
};

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

/**
 * @deprecated Use checkRedisRateLimit from @/lib/rate-limit instead.
 * @description In-memory rate limiter that tracks per-user request counts in a sliding window.
 * Fails in multi-instance or serverless deployments where memory is not shared.
 * @param {string} userId - The identifier of the user being rate-limited.
 * @param {number} [limit=20] - Maximum number of requests allowed within the window.
 * @param {number} [windowMs=60000] - Duration of the rate-limit window in milliseconds.
 * @returns {boolean} True if the request is within the allowed limit, false if it should be rejected.
 */
export function checkRateLimit(userId: string, limit = 20, windowMs = 60000): boolean {
  logger.warn('[DEPRECATED] Using in-memory rate limiting. Migrate to Redis-based rate limiting.');
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

/**
 * @description Estimates the number of tokens in a text string using a rough 4-characters-per-token heuristic.
 * @param {string} text - The input text to estimate token count for.
 * @returns {number} Approximate token count, rounded up.
 */
export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * @description Estimates the USD cost of an AI API call based on token counts and per-model pricing rates.
 * @param {number} inputTokens - Number of input (prompt) tokens consumed.
 * @param {number} outputTokens - Number of output (completion) tokens generated.
 * @param {'gpt-4o' | 'gpt-4o-mini' | 'claude-3-5-sonnet' | 'claude-3-haiku'} model - The model used for the request.
 * @returns {number} Approximate cost in USD.
 */
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

