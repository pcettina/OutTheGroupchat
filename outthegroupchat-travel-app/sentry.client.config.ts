// DEPRECATED: Client-side Sentry initialization has been migrated to
// instrumentation-client.ts for Turbopack compatibility (Next.js 14+).
// This file is kept as a fallback for non-Turbopack builds but is no longer
// the canonical source of Sentry client config.
//
// See: https://docs.sentry.io/platforms/javascript/guides/nextjs/instrumentation/
// Do NOT add new configuration here — edit instrumentation-client.ts instead.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Set SENTRY_DSN in your environment variables.
  // Example: https://examplePublicKey@o0.ingest.sentry.io/0
  dsn: process.env.SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while setting up Sentry.
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
