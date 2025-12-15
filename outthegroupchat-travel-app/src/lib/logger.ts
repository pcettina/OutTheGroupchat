import pino from 'pino';

/**
 * Structured logger using Pino
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info({ userId: '123' }, 'User logged in');
 *   logger.error({ err: error, context: 'API_TRIPS' }, 'Failed to fetch trips');
 */

// Determine if we're in a browser or server environment
const isBrowser = typeof window !== 'undefined';

// Log level from environment or default based on NODE_ENV
const getLogLevel = (): string => {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  if (process.env.NODE_ENV === 'production') return 'info';
  if (process.env.NODE_ENV === 'test') return 'silent';
  return 'debug';
};

// Create logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: getLogLevel(),
  // Add timestamp in ISO format
  timestamp: pino.stdTimeFunctions.isoTime,
  // Base context for all logs
  base: {
    env: process.env.NODE_ENV,
    service: 'outthegroupchat',
  },
  // Format error objects properly
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
    }),
  },
  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'cookie',
      'apiKey',
      '*.password',
      '*.token',
      '*.apiKey',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[REDACTED]',
  },
};

// Create the logger instance
// In development, use pino-pretty for readable output
// In production, use standard JSON output
const logger = pino(
  loggerConfig,
  // Only use pino-pretty in development server-side
  process.env.NODE_ENV === 'development' && !isBrowser
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      })
    : undefined
);

// Browser fallback - pino works in browser but with limitations
const browserLogger = isBrowser
  ? pino({
      ...loggerConfig,
      browser: {
        asObject: true,
      },
    })
  : logger;

// Export the appropriate logger
export { browserLogger as logger };

// Convenience exports for common log contexts
export const apiLogger = logger.child({ component: 'api' });
export const authLogger = logger.child({ component: 'auth' });
export const aiLogger = logger.child({ component: 'ai' });
export const dbLogger = logger.child({ component: 'database' });

// Helper function to create request-scoped logger
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    userId,
    component: 'request',
  });
}

// Type-safe error logging helper
export function logError(
  context: string,
  error: unknown,
  additionalData?: Record<string, unknown>
): void {
  const errorObj = error instanceof Error
    ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
      }
    : { message: String(error) };

  logger.error(
    {
      context,
      err: errorObj,
      ...additionalData,
    },
    `[${context}] ${errorObj.message}`
  );
}

// Log successful operations
export function logSuccess(
  context: string,
  message: string,
  data?: Record<string, unknown>
): void {
  logger.info(
    {
      context,
      ...data,
    },
    `[${context}] ${message}`
  );
}

