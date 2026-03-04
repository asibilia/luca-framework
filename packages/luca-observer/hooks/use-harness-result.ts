"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { HarnessResultSnapshot } from "~/lib/types";
import { HarnessResultSnapshotSchema } from "~/lib/types";

/**
 * API Response schema for /api/harness.
 *
 * Uses snake_case for API compatibility.
 */
const HarnessResponseSchema = z.object({
  result: HarnessResultSnapshotSchema.nullable().default(null),
  has_result: z.boolean().default(false),
});

/**
 * React hook for polling harness result from the API.
 *
 * Polls /api/harness at the specified interval to get the latest
 * verification harness result.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 * @returns Object with result, hasResult flag, loading state, and error
 */
export function useHarnessResult(intervalMs = 15000) {
  const [result, setResult] = useState<HarnessResultSnapshot | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHarness = useCallback(async () => {
    try {
      const res = await fetch("/api/harness");
      if (!res.ok) throw new Error("Failed to fetch harness result");
      const json = await res.json();
      const parsed = HarnessResponseSchema.safeParse(json);
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
    fetchHarness();
    const interval = setInterval(fetchHarness, intervalMs);
    return () => clearInterval(interval);
  }, [fetchHarness, intervalMs]);

  return { result, hasResult, loading, error };
}
