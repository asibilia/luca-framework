"use client";

import { useEffect } from "react";

import Link from "next/link";

/**
 * Reusable per-page error UI component.
 *
 * Shared by all route-level error.tsx files to provide a consistent
 * error recovery experience with page-specific context.
 *
 * @param pageName - Display name of the page that errored (e.g., "Iterations")
 * @param error - The error that was thrown
 * @param reset - Function to retry rendering the failed route segment
 *
 * @example
 * ```tsx
 * // In app/iterations/error.tsx
 * export default function IterationsError({ error, reset }) {
 *   return <PageError pageName="Iterations" error={error} reset={reset} />;
 * }
 * ```
 */
export function PageError({
  pageName,
  error,
  reset,
}: {
  pageName: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`[luca-studio] Error on ${pageName} page:`, error);
  }, [pageName, error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <p className="font-mono text-lg font-bold text-destructive">
          Error loading {pageName}
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
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-md border border-border px-4 py-2 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
