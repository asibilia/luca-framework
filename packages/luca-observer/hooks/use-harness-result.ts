"use client";

import { z } from "zod";

import { HarnessResultSnapshotSchema } from "~/lib/types";

import { usePollingFetch } from "./use-polling-fetch";

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
  const { data, loading, error } = usePollingFetch(
    "/api/harness",
    HarnessResponseSchema,
    intervalMs,
  );

  return {
    result: data?.result ?? null,
    hasResult: data?.has_result ?? false,
    loading,
    error,
  };
}
