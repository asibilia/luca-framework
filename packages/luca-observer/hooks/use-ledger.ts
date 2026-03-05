"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time ledger entries from SpacetimeDB.
 *
 * Subscribes to the ledger_entries table and returns the most recent
 * entries ordered by timestamp.
 *
 * @param tail - Number of most recent entries to return (default 50)
 * @returns Object with entries, total count, loading state, and error
 */
export function useLedger(tail = 50) {
  const [rows, isLoading] = useTable(tables.ledgerEntries);

  const { entries, totalCount } = useMemo(() => {
    const mapped = rows.map((row) => {
      let eventData: Record<string, unknown> = {};
      try {
        eventData = JSON.parse(row.detailsJson || "{}");
      } catch {
        // Ignore malformed JSON
      }

      return {
        previous_state: "",
        current_state: row.result,
        event_type: row.action,
        event_data: eventData,
        actions_executed: [] as string[],
        context: {} as Record<string, unknown>,
        timestamp: row.timestamp
          ? new Date(Number(row.timestamp)).toISOString()
          : "",
        session_id: row.sessionId,
        sequence_number: Number(row.sequenceNumber),
        parent_id: null,
      };
    });

    const sorted = orderBy(mapped, "sequence_number", "desc");
    return {
      entries: sorted.slice(0, tail),
      totalCount: rows.length,
    };
  }, [rows, tail]);

  return {
    entries,
    totalCount,
    loading: isLoading,
    error: null as string | null,
  };
}
