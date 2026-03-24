/**
 * @module api-config
 * @description Shared Next.js API route configuration objects for controlling body parser size
 * limits and response limits. Export the appropriate config constant as `config` from any
 * API route file to apply these settings.
 */

/**
 * @description Standard API route configuration with a 1 MB body size limit and no response
 * size limit (suitable for streaming responses).
 * Use: export { apiConfig as config } from '@/lib/api-config';
 */
export const apiConfig = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    // Disable response size limit for streaming responses
    responseLimit: false,
  },
};

/**
 * @description API route configuration for file upload routes with a 10 MB body size limit
 * and no response size limit.
 * Use: export { uploadConfig as config } from '@/lib/api-config';
 */
export const uploadConfig = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: false,
  },
};

/**
 * @description API route configuration for AI streaming routes with a 1 MB body size limit,
 * no response size limit, and a 60-second max duration to accommodate long AI operations.
 * Use: export { streamingConfig as config } from '@/lib/api-config';
 */
export const streamingConfig = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
  },
  // Increase timeout for AI operations
  maxDuration: 60,
};

/**
 * @description Default route segment configuration for the App Router with a 30-second max
 * duration. Add to route.ts files that require custom timeout settings.
 */
export const routeSegmentConfig = {
  // Default body size limit
  maxDuration: 30, // seconds
};

