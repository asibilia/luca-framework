"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time tool call telemetry from SpacetimeDB.
 *
 * Subscribes to the tool_calls table and returns per-tool-call
 * metrics including duration, input/output sizes, and turn numbers.
 *
 * @param sessionId - Optional session ID to filter by
 * @param limit - Maximum number of rows to return (default 100)
 * @returns Object with toolCalls array, loading state, and error
 */
export function useToolCalls(sessionId?: string, limit = 100) {
  const [rows, isLoading] = useTable(tables.toolCalls);

  const toolCalls = useMemo(() => {
    const filtered = sessionId
      ? rows.filter((r) => r.sessionId === sessionId)
      : rows;

    const mapped = filtered.map((row) => ({
      id: Number(row.id),
      session_id: row.sessionId,
      tool_name: row.toolName,
      duration_ms: Number(row.durationMs),
      input_size: Number(row.inputSize),
      output_size: Number(row.outputSize),
      turn_number: Number(row.turnNumber),
      timestamp: Number(row.timestamp),
    }));

    const sorted = orderBy(mapped, "timestamp", "desc");
    return sorted.slice(0, limit);
  }, [rows, sessionId, limit]);

  return { toolCalls, loading: isLoading, error: null as string | null };
}
