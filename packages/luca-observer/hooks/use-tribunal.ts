"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time tribunal result from SpacetimeDB.
 *
 * Subscribes to the tribunal_results table (singleton, id=1) and returns
 * the latest tribunal/debate result. Replaces the polling-based implementation.
 *
 * @returns Object with result, hasResult flag, loading state, and error
 */
export function useTribunal() {
  const [rows, isLoading] = useTable(tables.tribunalResults);

  const { result, hasResult } = useMemo(() => {
    const row = rows[0];
    if (!row || !row.resultJson) return { result: null, hasResult: false };

    try {
      const parsed = JSON.parse(row.resultJson);
      return { result: parsed, hasResult: true };
    } catch {
      return { result: null, hasResult: false };
    }
  }, [rows]);

  return {
    result,
    hasResult,
    loading: isLoading,
    error: null as string | null,
  };
}
