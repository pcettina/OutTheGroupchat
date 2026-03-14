"use client";

// global-error.tsx — catches React render errors that bubble past all error.tsx
// boundaries, including errors in the root layout. Sentry captures the error
// before presenting a recovery UI to the user.
// https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errorjs

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "Arial, Helvetica, sans-serif",
          backgroundColor: "#ffffff",
          color: "#111827",
          margin: 0,
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "0.75rem",
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: "#6b7280",
            marginBottom: "1.5rem",
            maxWidth: "480px",
          }}
        >
          An unexpected error occurred. Our team has been notified. You can try
          reloading the page or come back later.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.625rem 1.25rem",
            backgroundColor: "#111827",
            color: "#ffffff",
            border: "none",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
