// Sentry server and edge initialization via Next.js instrumentation hook.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/instrumentation/

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      // Set SENTRY_DSN in your environment variables.
      // Example: https://examplePublicKey@o0.ingest.sentry.io/0
      dsn: process.env.SENTRY_DSN,

      // Adjust this value in production, or use tracesSampler for greater control.
      tracesSampleRate: 1.0,

      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      // Set SENTRY_DSN in your environment variables.
      // Example: https://examplePublicKey@o0.ingest.sentry.io/0
      dsn: process.env.SENTRY_DSN,

      // Adjust this value in production, or use tracesSampler for greater control.
      tracesSampleRate: 1.0,

      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }
}
