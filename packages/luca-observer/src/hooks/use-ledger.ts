"use client";

import { useEffect, useState, useCallback } from "react";
import { z } from "zod";

import type { LedgerEntry } from "~/lib/types";
import { LedgerEntrySchema } from "~/lib/types";

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
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    try {
      const res = await fetch(`/api/ledger?tail=${tail}`);
      if (!res.ok) throw new Error("Failed to fetch ledger");
      const json = await res.json();
      const parsed = LedgerResponseSchema.safeParse(json);
      if (parsed.success) {
        setEntries(parsed.data.entries);
        setTotalCount(parsed.data.total_count);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [tail]);

  useEffect(() => {
    fetchLedger();
    const interval = setInterval(fetchLedger, intervalMs);
    return () => clearInterval(interval);
  }, [fetchLedger, intervalMs]);

  return { entries, totalCount, loading, error };
}
