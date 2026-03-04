"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { IterationRecordSnapshot } from "~/lib/types";
import { IterationRecordSnapshotSchema } from "~/lib/types";

/**
 * API Response schema for /api/iterations.
 *
 * Uses snake_case for API compatibility.
 */
const IterationsResponseSchema = z.object({
  iterations: z.array(IterationRecordSnapshotSchema).default([]),
  total_count: z.number().default(0),
});

/**
 * React hook for polling iteration history from the API.
 *
 * Polls /api/iterations at the specified interval to get the latest
 * iteration checkpoint data with convergence status.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 * @returns Object with iterations array, loading state, and error
 */
export function useIterationHistory(intervalMs = 15000) {
  const [iterations, setIterations] = useState<IterationRecordSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIterations = useCallback(async () => {
    try {
      const res = await fetch("/api/iterations");
      if (!res.ok) throw new Error("Failed to fetch iterations");
      const json = await res.json();
      const parsed = IterationsResponseSchema.safeParse(json);
      if (parsed.success) {
        setIterations(parsed.data.iterations);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIterations();
    const interval = setInterval(fetchIterations, intervalMs);
    return () => clearInterval(interval);
  }, [fetchIterations, intervalMs]);

  return { iterations, loading, error };
}
