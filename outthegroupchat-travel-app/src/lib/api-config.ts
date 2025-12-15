/**
 * Shared API route configurations for security and performance
 */

/**
 * Standard API route config with body size limit
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
 * Config for file upload routes (larger body size)
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
 * Config for AI streaming routes
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
 * Route segment config for App Router
 * Add to route.ts files that need custom configurations
 */
export const routeSegmentConfig = {
  // Default body size limit
  maxDuration: 30, // seconds
};

