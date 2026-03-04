"use client";

import { z } from "zod";

import { TribunalResultSnapshotSchema } from "~/lib/types";

import { usePollingFetch } from "./use-polling-fetch";

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
  const { data, loading, error } = usePollingFetch(
    "/api/tribunal",
    TribunalResponseSchema,
    intervalMs,
  );

  return {
    result: data?.result ?? null,
    hasResult: data?.has_result ?? false,
    loading,
    error,
  };
}
