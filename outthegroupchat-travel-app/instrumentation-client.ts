// Sentry client-side initialization via Next.js instrumentation-client hook.
// This file is the canonical location for Sentry browser init with Turbopack support.
// sentry.client.config.ts is superseded by this file.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/instrumentation/

import * as Sentry from "@sentry/nextjs";

export function register(): void {
  Sentry.init({
    // Set SENTRY_DSN in your environment variables.
    // Example: https://examplePublicKey@o0.ingest.sentry.io/0
    dsn: process.env.SENTRY_DSN,

    // Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1.0,

    // Setting this option to true will print useful information while setting up Sentry.
    debug: false,

    // Session Replay — captures a video-like reproduction of user sessions on error.
    // Capture 100% of sessions that encounter an error.
    replaysOnErrorSampleRate: 1.0,

    // Capture 10% of all sessions for general replay.
    replaysSessionSampleRate: 0.1,

    integrations: [
      // replayIntegration() — sessionSampleRate/errorSampleRate are set above via
      // replaysSessionSampleRate / replaysOnErrorSampleRate, not on the integration itself.
      Sentry.replayIntegration(),
    ],
  });
}

// Instruments Next.js App Router navigations for Sentry tracing.
// Required to avoid the Sentry build warning about missing onRouterTransitionStart.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
