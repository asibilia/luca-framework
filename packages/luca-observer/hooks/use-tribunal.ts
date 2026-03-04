"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { TribunalResultSnapshot } from "~/lib/types";
import { TribunalResultSnapshotSchema } from "~/lib/types";

/**
 * API Response schema for /api/tribunal.
 *
 * Uses snake_case for API compatibility.
 */
const TribunalResponseSchema = z.object({
  result: TribunalResultSnapshotSchema.nullable().default(null),
  has_result: z.boolean().default(false),
});

/**
 * React hook for polling tribunal result from the API.
 *
 * Polls /api/tribunal at the specified interval to get the latest
 * tribunal/debate result.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 * @returns Object with result, hasResult flag, loading state, and error
 */
export function useTribunal(intervalMs = 15000) {
  const [result, setResult] = useState<TribunalResultSnapshot | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTribunal = useCallback(async () => {
    try {
      const res = await fetch("/api/tribunal");
      if (!res.ok) throw new Error("Failed to fetch tribunal");
      const json = await res.json();
      const parsed = TribunalResponseSchema.safeParse(json);
      if (parsed.success) {
        setResult(parsed.data.result);
        setHasResult(parsed.data.has_result);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTribunal();
    const interval = setInterval(fetchTribunal, intervalMs);
    return () => clearInterval(interval);
  }, [fetchTribunal, intervalMs]);

  return { result, hasResult, loading, error };
}
