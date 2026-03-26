/**
 * @module sentry
 * @description Conditional Sentry error monitoring utilities. Wraps @sentry/nextjs
 * so that all calls are no-ops when SENTRY_DSN is not configured. Consumers import
 * from this module rather than directly from @sentry/nextjs to ensure consistent
 * graceful-degradation behavior across the application.
 *
 * Usage:
 *   import { captureException, captureMessage } from '@/lib/sentry';
 *   captureException(error);
 *   captureMessage('Something notable happened', 'info');
 */

import * as SentrySDK from '@sentry/nextjs';
import { logger } from '@/lib/logger';

const sentryLogger = logger.child({ component: 'sentry' });

/**
 * Returns true if a SENTRY_DSN environment variable is present and non-empty.
 * Evaluated once at module load time so it never throws in missing-DSN environments.
 */
const isEnabled = Boolean(process.env.SENTRY_DSN);

/**
 * Initialises Sentry with sensible production defaults. Safe to call unconditionally;
 * returns immediately without side-effects when SENTRY_DSN is not set.
 *
 * Note: The canonical Sentry init happens via the framework-level config files
 * (sentry.client.config.ts / sentry.server.config.ts / sentry.edge.config.ts).
 * Call this helper only when you need programmatic re-initialisation (e.g. tests,
 * custom runtimes) — it must NOT be called from sentry.*.config.ts files to avoid
 * double-initialisation.
 */
export function init(): void {
  if (!isEnabled) {
    sentryLogger.debug('SENTRY_DSN not set — Sentry init skipped');
    return;
  }

  SentrySDK.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    debug: false,
  });

  sentryLogger.info('Sentry initialised');
}

/**
 * Captures an exception and forwards it to Sentry. No-ops when SENTRY_DSN is not set.
 *
 * @param error - Any caught value (Error instance, string, or unknown).
 * @param context - Optional key–value pairs attached to the Sentry event as extra data.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (!isEnabled) {
    sentryLogger.debug(
      { err: error instanceof Error ? error.message : String(error) },
      'Sentry disabled — exception not forwarded'
    );
    return;
  }

  SentrySDK.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Captures a plain message and forwards it to Sentry. No-ops when SENTRY_DSN is not set.
 *
 * @param message - Human-readable description of the event.
 * @param level   - Sentry severity level (default: 'info').
 */
export function captureMessage(
  message: string,
  level: SentrySDK.SeverityLevel = 'info'
): void {
  if (!isEnabled) {
    sentryLogger.debug(
      { message, level },
      'Sentry disabled — message not forwarded'
    );
    return;
  }

  SentrySDK.captureMessage(message, level);
}
