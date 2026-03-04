"use client";

import { z } from "zod";

import { IterationRecordSnapshotSchema } from "~/lib/types";

import { usePollingFetch } from "./use-polling-fetch";

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
  const { data, loading, error } = usePollingFetch(
    "/api/iterations",
    IterationsResponseSchema,
    intervalMs,
  );

  return {
    iterations: data?.iterations ?? [],
    loading,
    error,
  };
}
