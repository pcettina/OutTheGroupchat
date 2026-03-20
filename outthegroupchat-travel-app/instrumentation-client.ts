// Sentry client-side initialization via Next.js instrumentation-client hook.
// This file is loaded in the browser whenever a user loads a page.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/instrumentation/

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

// Required by Next.js App Router for Turbopack compatibility.
// Captures router transition timing for Sentry performance tracing.
// Without this export the build emits a "missing onRouterTransitionStart" warning.
// Required by Next.js instrumentation API to register the client-side hook.
export function register() {}

// Required by Sentry to instrument client-side navigations (router transitions).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
