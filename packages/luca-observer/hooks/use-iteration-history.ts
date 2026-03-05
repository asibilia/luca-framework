"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time iteration history from SpacetimeDB.
 *
 * Subscribes to the iteration_records table and returns all iteration
 * checkpoints with convergence status.
 *
 * @returns Object with iterations array and loading state
 */
export function useIterationHistory() {
  const [rows, isLoading] = useTable(tables.iterationRecords);

  const iterations = useMemo(() => {
    const mapped = rows.map((row) => ({
      tag: row.tag,
      phase: 0,
      loop: "harness" as const,
      iteration: Number(row.iteration),
      error_count: Number(row.errorCount),
      error_delta: Number(row.errorDelta),
      convergence_status: row.convergenceStatus as
        | "improved"
        | "stalled"
        | "regressed",
      stale_count: Number(row.staleCount),
      permanent_errors: [] as string[],
      correctable_errors: [] as string[],
      transient_errors: [] as string[],
      artifacts_delta: 0,
      agent_invoked: "",
      duration_ms: 0,
      timestamp: "",
    }));

    return orderBy(mapped, "iteration", "asc");
  }, [rows]);

  return { iterations, loading: isLoading, error: null as string | null };
}
