'use client';

// Explicit React import so the classic JSX runtime (React.createElement)
// resolves under vitest/esbuild, which does not inject the automatic runtime
// the way the Next.js build does. Harmless under Next 14's own compiler.
import React from 'react';
import { AlertCircle, RotateCw, X } from 'lucide-react';

interface ErrorBannerProps {
  /** The user-facing error message to display. */
  message: string;
  /** When provided, renders a "Retry" button that invokes this callback. */
  onRetry?: () => void;
  /** When provided, renders a dismiss (X) button that invokes this callback. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Shared, visible error banner. Replaces the ad-hoc inline
 * `<div role="alert" className="...border-red-500/30...">` blocks that were
 * duplicated across pages, and gives silent-fail surfaces a visible fallback.
 */
export function ErrorBanner({ message, onRetry, onDismiss, className = '' }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 ${className}`}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-red-300 hover:bg-red-500/10 hover:text-red-200"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="inline-flex flex-shrink-0 rounded-md p-0.5 text-red-300 hover:bg-red-500/10 hover:text-red-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default ErrorBanner;
