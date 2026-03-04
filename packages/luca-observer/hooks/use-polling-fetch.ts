"use client";

import { useEffect, useState, useCallback } from "react";

import type { z } from "zod";

/**
 * Generic polling fetch hook that encapsulates the common
 * fetch -> parse -> poll pattern used by all observer data hooks.
 *
 * Fetches the given URL, validates the response with a Zod schema,
 * and re-fetches on a fixed interval.
 *
 * @param url - API endpoint to poll
 * @param schema - Zod schema used to validate and parse the JSON response
 * @param intervalMs - Polling interval in milliseconds
 * @returns Object with parsed data (or null), loading state, and error
 *
 * @example
 * ```typescript
 * const { data, loading, error } = usePollingFetch(
 *   "/api/state",
 *   WorkflowSnapshotSchema,
 *   5000,
 * );
 * ```
 */
export function usePollingFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  intervalMs: number,
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}`);
      const json = await res.json();
      const parsed = schema.safeParse(json);
      if (parsed.success) {
        setData(parsed.data);
        setError(null);
      } else {
        console.warn(
          `[usePollingFetch] Schema validation failed for ${url}:`,
          parsed.error.issues,
        );
        setError(`Schema validation failed for ${url}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [url, schema]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, intervalMs);
    return () => clearInterval(interval);
  }, [fetchData, intervalMs]);

  return { data, loading, error };
}
