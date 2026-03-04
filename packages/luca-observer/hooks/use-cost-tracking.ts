"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time cost tracking from SpacetimeDB.
 *
 * Subscribes to the cost_tracking table and returns per-session
 * cost summaries.
 *
 * @param sessionId - Optional session ID to filter by
 * @returns Object with cost data, loading state, and error
 */
export function useCostTracking(sessionId?: string) {
  const [rows, isLoading] = useTable(tables.costTracking);

  const { cost, totalCost } = useMemo(() => {
    const filtered = sessionId
      ? rows.filter((r) => r.sessionId === sessionId)
      : rows;

    const mapped = filtered.map((row) => ({
      session_id: row.sessionId,
      input_cost_cents: Number(row.inputCostCents),
      output_cost_cents: Number(row.outputCostCents),
      total_cost_cents: Number(row.totalCostCents),
      turn_count: Number(row.turnCount),
      timestamp: Number(row.timestamp),
    }));

    const totalCost = mapped.reduce(
      (acc, row) => acc + row.total_cost_cents,
      0,
    );

    return { cost: sessionId ? (mapped[0] ?? null) : mapped, totalCost };
  }, [rows, sessionId]);

  return {
    cost,
    totalCost,
    loading: isLoading,
    error: null as string | null,
  };
}
