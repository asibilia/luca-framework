"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time metrics from SpacetimeDB.
 *
 * Subscribes to the metrics table (singleton, id=1) and returns
 * the parsed metrics object.
 *
 * @returns Object with data, loading state, and error
 */
export function useMetrics() {
  const [rows, isLoading] = useTable(tables.metrics);

  const data = useMemo((): Record<string, unknown> | null => {
    const row = rows[0];
    if (!row || !row.metricsJson) return null;

    try {
      return JSON.parse(row.metricsJson);
    } catch {
      return null;
    }
  }, [rows]);

  return { data, loading: isLoading, error: null as string | null };
}
