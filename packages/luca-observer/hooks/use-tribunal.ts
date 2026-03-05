"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { safeJsonParse } from "~/lib/safe-json-parse";
import { tables } from "~/module_bindings";

/**
 * React hook for real-time tribunal result from SpacetimeDB.
 *
 * Subscribes to the tribunal_results table (singleton, id=1) and returns
 * the latest tribunal/debate result.
 *
 * @returns Object with result, hasResult flag, and loading state
 */
export function useTribunal() {
  const [rows, isLoading] = useTable(tables.tribunalResults);

  const { result, hasResult } = useMemo(() => {
    const row = rows[0];
    if (!row || !row.resultJson) return { result: null, hasResult: false };

    const parsed = safeJsonParse<Record<string, unknown> | null>(
      row.resultJson,
      null,
    );
    return parsed
      ? { result: parsed, hasResult: true }
      : { result: null, hasResult: false };
  }, [rows]);

  return {
    result,
    hasResult,
    loading: isLoading,
  };
}
