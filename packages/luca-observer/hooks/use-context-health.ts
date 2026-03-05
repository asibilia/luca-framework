"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

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
  const [rows, isLoading] = useTable(tables.contextSnapshots);

  const { snapshots, latest, health } = useMemo(() => {
    const filtered = sessionId
      ? rows.filter((r) => r.sessionId === sessionId)
      : rows;

    const mapped = filtered.map((row) => ({
      id: Number(row.id),
      session_id: row.sessionId,
      context_percent: Number(row.contextPercent),
      message_count: Number(row.messageCount),
      estimated_tokens: Number(row.estimatedTokens),
      phase: row.phase,
      timestamp: Number(row.timestamp),
    }));

    const sorted = orderBy(mapped, "timestamp", "desc");
    const limited = sorted.slice(0, limit);
    const latest = limited[0] ?? null;

    // Determine health based on context usage percentage
    let health: "peak" | "good" | "degrading" | "critical" = "peak";
    if (latest) {
      const pct = latest.context_percent;
      if (pct >= 70) health = "critical";
      else if (pct >= 50) health = "degrading";
      else if (pct >= 30) health = "good";
    }

    return { snapshots: limited, latest, health };
  }, [rows, sessionId, limit]);

  return {
    snapshots,
    latest,
    health,
    loading: isLoading,
  };
}
