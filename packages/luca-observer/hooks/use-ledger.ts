"use client";

import { z } from "zod";

import { LedgerEntrySchema } from "~/lib/types";

import { usePollingFetch } from "./use-polling-fetch";

/**
 * API Response schema for /api/ledger.
 *
 * Uses snake_case for API compatibility.
 */
const LedgerResponseSchema = z.object({
  entries: z.array(LedgerEntrySchema).default([]),
  total_count: z.number().default(0),
});

/**
 * React hook for polling ledger entries from the API.
 *
 * Polls /api/ledger at the specified interval to get recent
 * state machine transitions from session-ledger.jsonl.
 *
 * @param tail - Number of most recent entries to fetch (default 50)
 * @param intervalMs - Polling interval in milliseconds (default 10000)
 * @returns Object with entries, total count, loading state, and error
 */
export function useLedger(tail = 50, intervalMs = 10000) {
  const { data, loading, error } = usePollingFetch(
    `/api/ledger?tail=${tail}`,
    LedgerResponseSchema,
    intervalMs,
  );

  return {
    entries: data?.entries ?? [],
    totalCount: data?.total_count ?? 0,
    loading,
    error,
  };
}
