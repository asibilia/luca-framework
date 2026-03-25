"use client";

import { useEffect } from "react";

import Link from "next/link";

/**
 * Global error boundary for the studio app.
 *
 * Catches any unhandled rendering error in child routes and
 * displays a recovery UI with reset and navigation options.
 * Uses the Next.js App Router error.tsx convention.
 *
 * @param error - The error that was thrown
 * @param reset - Function to retry rendering the failed route segment
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[luca-studio] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-mono text-lg font-bold text-destructive">
          Something went wrong
        </p>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Digest: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-md border border-border px-4 py-2 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
