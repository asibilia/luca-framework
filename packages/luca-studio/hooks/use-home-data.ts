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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Synthesize a human-readable summary from a ledger entry's event_data.
 *
 * Priority:
 * 1. Use existing summary field if present.
 * 2. Check event_data.summary — some transitions embed a summary string.
 * 3. For phase events: extract event_data.phase_id and form a descriptive label.
 * 4. For HARNESS_COMPLETE: event_data.status (with optional error count).
 * 5. For ROUTE_COMPLETE: event_data.complexity → "Routed as {complexity}".
 * 6. For `field_set` events: "Set {field} to {value}".
 * 7. For transitions with previous_state/current_state: "{prev} -> {current}".
 * 8. For actions_executed arrays: join action names.
 * 9. Fallback: empty string.
 *
 * @param entry - Raw ledger entry object
 * @returns Synthesized summary string
 */
function synthesizeSummary(entry: Record<string, unknown>): string {
  // 1. Use existing summary if present
  const existing = get(entry, "summary", "") as string;
  if (existing) return existing;

  const eventData = get(entry, "event_data", {}) as Record<string, unknown>;
  const eventType = get(entry, "event_type", "") as string;

  // 2. Check event_data.summary — some transitions embed a summary string
  const dataSummary = get(eventData, "summary", "") as string;
  if (dataSummary) return dataSummary;

  // 3. For phase events: extract phase_id
  if (eventType.includes("PHASE") && eventType !== "field_set") {
    const phaseId = get(eventData, "phase_id", null) as number | string | null;
    if (phaseId != null) {
      if (eventType === "PHASE_START") return `Phase ${phaseId} started`;
      if (eventType === "PHASE_COMPLETE") return `Phase ${phaseId} completed`;
      if (eventType === "PHASE_VERIFY_PASSED")
        return `Phase ${phaseId} verified`;
      if (eventType === "PHASE_LEARN_COMPLETE")
        return `Phase ${phaseId} learned`;
      return `Phase ${phaseId}`;
    }
  }

  // 4. For HARNESS_COMPLETE: status and optional error count
  if (eventType === "HARNESS_COMPLETE") {
    const status = get(eventData, "status", "") as string;
    if (status) {
      const errorCount = get(eventData, "error_count", null) as number | null;
      return errorCount != null && errorCount > 0
        ? `Harness ${status} (${errorCount} errors)`
        : `Harness ${status}`;
    }
  }

  // 5. For ROUTE_COMPLETE: complexity
  if (eventType === "ROUTE_COMPLETE") {
    const complexity = get(eventData, "complexity", "") as string;
    if (complexity) return `Routed as ${complexity}`;
  }

  // 6. For field_set: "Set {field} to {value}"
  if (eventType === "field_set") {
    const field = get(eventData, "field", "") as string;
    const value = get(eventData, "value", "") as unknown;
    if (field) {
      const displayValue =
        typeof value === "string" ? value : JSON.stringify(value);
      return `Set ${field} to ${displayValue}`;
    }
  }

  // 7. For transitions: "{previous_state} -> {current_state}"
  //    These fields live at the entry root, not nested in event_data.
  const prevState = get(entry, "previous_state", "") as string;
  const currState = get(entry, "current_state", "") as string;
  if (prevState && currState) {
    return `${prevState} -> ${currState}`;
  }

  // 8. For actions_executed: join action names
  //    This field also lives at the entry root level.
  const actions = get(entry, "actions_executed", null) as string[] | null;
  if (Array.isArray(actions) && actions.length > 0) {
    return actions.join(", ");
  }

  // 5. Fallback
  return "";
}

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
            const entryObj = entry as Record<string, unknown>;
            parsed.push({
              ...entryObj,
              event: get(entryObj, "event_type", "unknown") as string,
              timestamp: get(entryObj, "timestamp", "") as string,
              summary: synthesizeSummary(entryObj) || undefined,
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
