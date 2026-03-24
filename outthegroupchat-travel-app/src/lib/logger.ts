/**
 * @module logger
 * @description Structured logging utilities using Pino. Provides a root application logger,
 * component-scoped child loggers, and helper functions for standardized error and success logging.
 * Sensitive fields (passwords, tokens, cookies) are automatically redacted from all log output.
 */
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

/**
 * @description The primary application logger. Uses pino-pretty in development (server-side)
 * and a browser-compatible pino instance in the browser, with sensitive fields automatically redacted.
 */
export { browserLogger as logger };

/**
 * @description Child logger pre-bound to the 'api' component context.
 */
export const apiLogger = logger.child({ component: 'api' });

/**
 * @description Child logger pre-bound to the 'auth' component context.
 */
export const authLogger = logger.child({ component: 'auth' });

/**
 * @description Child logger pre-bound to the 'ai' component context.
 */
export const aiLogger = logger.child({ component: 'ai' });

/**
 * @description Child logger pre-bound to the 'database' component context.
 */
export const dbLogger = logger.child({ component: 'database' });

/**
 * @description Creates a child logger scoped to a specific request, optionally binding a user ID.
 * @param {string} requestId - A unique identifier for the request (e.g., correlation ID).
 * @param {string} [userId] - Optional user ID to associate with all log entries from this logger.
 * @returns A pino child logger instance with requestId and optional userId bound.
 */
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    userId,
    component: 'request',
  });
}

/**
 * @description Logs an error at the ERROR level with structured context, normalizing both
 * Error instances and unknown thrown values into a consistent shape.
 * @param {string} context - A label identifying the code location or operation that failed.
 * @param {unknown} error - The caught error value to log.
 * @param {Record<string, unknown>} [additionalData] - Optional extra fields to include in the log entry.
 * @returns {void}
 */
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

/**
 * @description Logs a successful operation at the INFO level with optional structured data.
 * @param {string} context - A label identifying the code location or operation that succeeded.
 * @param {string} message - A human-readable description of the successful outcome.
 * @param {Record<string, unknown>} [data] - Optional extra fields to include in the log entry.
 * @returns {void}
 */
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

