"use client";

import { useCallback, useMemo } from "react";

import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

/**
 * React hook for real-time context-window health from SpacetimeDB.
 *
 * Subscribes to the context_snapshots table and returns context usage
 * over time, including the latest snapshot and trend data.
 *
 * @param sessionId - Optional session ID to filter by
 * @param limit - Maximum number of snapshots to return (default 50)
 * @returns Object with snapshots, latest snapshot, health status, and loading state
 */
export function useContextHealth(sessionId?: string, limit = 50) {
  const mapper = useCallback(
    (row: {
      id: bigint;
      sessionId: string;
      contextPercent: bigint;
      messageCount: bigint;
      estimatedTokens: bigint;
      phase: string;
      timestamp: bigint;
    }) => ({
      id: Number(row.id),
      session_id: row.sessionId,
      context_percent: Number(row.contextPercent),
      message_count: Number(row.messageCount),
      estimated_tokens: Number(row.estimatedTokens),
      phase: row.phase,
      timestamp: Number(row.timestamp),
    }),
    [],
  );

  const { rows: snapshots, loading } = useFilteredTable(
    tables.contextSnapshots,
    mapper,
    { sessionId, limit },
  );

  const { latest, health } = useMemo(() => {
    const latest = snapshots[0] ?? null;

    let health: "peak" | "good" | "degrading" | "critical" = "peak";
    if (latest) {
      const pct = latest.context_percent;
      if (pct >= 70) health = "critical";
      else if (pct >= 50) health = "degrading";
      else if (pct >= 30) health = "good";
    }

    return { latest, health };
  }, [snapshots]);

  return {
    snapshots,
    latest,
    health,
    loading,
  };
}
