"use client";

import { useCallback, useEffect, useState } from "react";

import get from "lodash/get";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Ledger entry shape (best-effort, tolerant of unknown fields). */
export type LedgerEntry = {
  event: string;
  timestamp: string;
  summary?: string;
  [key: string]: unknown;
};

/** Combined home page data from state + ledger APIs. */
export type HomeData = {
  /** Workflow state from /api/state, or null if unavailable. */
  state: Record<string, unknown> | null;
  /** Recent ledger entries from /api/ledger (most-recent-first). */
  entries: LedgerEntry[];
  /** Whether data is currently loading. */
  loading: boolean;
  /** Error message if either fetch failed. */
  error: string | null;
  /** Manual refresh function. */
  refresh: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches combined data for the Home page from `/api/state` and `/api/ledger`.
 *
 * Returns workflow state, recent ledger entries, loading state, error state,
 * and a manual refresh callback. Both endpoints are fetched in parallel on
 * mount. Missing or errored data degrades gracefully (null state, empty
 * entries array).
 *
 * @returns Combined home page data.
 *
 * @example
 * ```ts
 * const { state, entries, loading, error, refresh } = useHomeData();
 * ```
 */
export function useHomeData(): HomeData {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [stateRes, ledgerRes] = await Promise.all([
        fetch("/api/state").catch(() => null),
        fetch("/api/ledger?limit=5").catch(() => null),
      ]);

      // Parse state
      if (stateRes && stateRes.ok) {
        const stateJson = (await stateRes.json()) as Record<string, unknown>;
        setState(stateJson);
      } else {
        setState(null);
      }

      // Parse ledger entries
      if (ledgerRes && ledgerRes.ok) {
        const ledgerJson = (await ledgerRes.json()) as unknown[];
        const parsed: LedgerEntry[] = [];
        for (const entry of ledgerJson) {
          if (entry && typeof entry === "object") {
            parsed.push({
              event: get(entry, "event_type", "unknown") as string,
              timestamp: get(entry, "timestamp", "") as string,
              summary: get(entry, "summary", undefined) as string | undefined,
              ...(entry as Record<string, unknown>),
            });
          }
        }
        setEntries(parsed);
      } else {
        setEntries([]);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load home data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { state, entries, loading, error, refresh: fetchData };
}
