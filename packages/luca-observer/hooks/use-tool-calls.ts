"use client";

import { useCallback } from "react";

import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

/**
 * React hook for real-time tool call telemetry from SpacetimeDB.
 *
 * Subscribes to the tool_calls table and returns per-tool-call
 * metrics including duration, input/output sizes, and turn numbers.
 *
 * @param sessionId - Optional session ID to filter by
 * @param limit - Maximum number of rows to return (default 100)
 * @returns Object with toolCalls array and loading state
 */
export function useToolCalls(sessionId?: string, limit = 100) {
  const mapper = useCallback(
    (row: {
      id: bigint;
      sessionId: string;
      toolName: string;
      durationMs: bigint;
      inputSize: bigint;
      outputSize: bigint;
      turnNumber: bigint;
      timestamp: bigint;
    }) => ({
      id: Number(row.id),
      session_id: row.sessionId,
      tool_name: row.toolName,
      duration_ms: Number(row.durationMs),
      input_size: Number(row.inputSize),
      output_size: Number(row.outputSize),
      turn_number: Number(row.turnNumber),
      timestamp: Number(row.timestamp),
    }),
    [],
  );

  const { rows: toolCalls, loading } = useFilteredTable(
    tables.toolCalls,
    mapper,
    { sessionId, limit },
  );

  return { toolCalls, loading };
}
