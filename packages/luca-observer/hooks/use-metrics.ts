"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { safeJsonParse } from "~/lib/safe-json-parse";
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

    return safeJsonParse<Record<string, unknown> | null>(row.metricsJson, null);
  }, [rows]);

  return { data, loading: isLoading, error: null as string | null };
}
