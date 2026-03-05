"use client";

import { useCallback, useMemo } from "react";

import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

/**
 * React hook for real-time cost tracking from SpacetimeDB.
 *
 * Subscribes to the cost_tracking table and returns per-session
 * cost summaries.
 *
 * @param sessionId - Optional session ID to filter by
 * @returns Object with cost data and loading state
 */
export function useCostTracking(sessionId?: string) {
  const mapper = useCallback(
    (row: {
      sessionId: string;
      inputCostCents: bigint;
      outputCostCents: bigint;
      totalCostCents: bigint;
      turnCount: bigint;
      timestamp: bigint;
    }) => ({
      session_id: row.sessionId,
      input_cost_cents: Number(row.inputCostCents),
      output_cost_cents: Number(row.outputCostCents),
      total_cost_cents: Number(row.totalCostCents),
      turn_count: Number(row.turnCount),
      timestamp: Number(row.timestamp),
    }),
    [],
  );

  const { rows, loading } = useFilteredTable(tables.costTracking, mapper, {
    sessionId,
    sortBy: null,
  });

  const { cost, totalCost } = useMemo(() => {
    const totalCost = rows.reduce((acc, row) => acc + row.total_cost_cents, 0);

    return { cost: sessionId ? (rows[0] ?? null) : rows, totalCost };
  }, [rows, sessionId]);

  return {
    cost,
    totalCost,
    loading,
  };
}
