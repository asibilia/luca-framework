"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

/**
 * Factory hook for the common SpacetimeDB table pipeline:
 * subscribe -> filter by sessionId -> map rows -> sort -> limit.
 *
 * Extracts the repeated pattern from 5 observer hooks into a single
 * reusable hook. Each consumer provides a table reference, a mapper
 * function, and optional sort/limit configuration.
 *
 * @param table - SpacetimeDB table reference (e.g., `tables.tokenUsage`)
 * @param mapper - Function to transform a raw SpacetimeDB row into the desired shape
 * @param options - Optional configuration for filtering, sorting, and limiting
 * @returns Object with mapped rows array and loading state
 *
 * @example
 * ```typescript
 * const mapper = useCallback((row: ToolCallRow) => ({
 *   id: Number(row.id),
 *   session_id: row.sessionId,
 *   tool_name: row.toolName,
 *   timestamp: Number(row.timestamp),
 * }), []);
 *
 * const { rows, loading } = useFilteredTable(
 *   tables.toolCalls,
 *   mapper,
 *   { sessionId, limit: 100 },
 * );
 * ```
 */
export function useFilteredTable<TRow, TMapped extends Record<string, unknown>>(
  table: Parameters<typeof useTable>[0],
  mapper: (row: TRow) => TMapped,
  options: {
    sessionId?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    limit?: number;
  } = {},
) {
  const [rawRows, isLoading] = useTable(table);
  const {
    sessionId,
    sortBy = "timestamp",
    sortOrder = "desc",
    limit,
  } = options;

  const rows = useMemo(() => {
    const filtered = sessionId
      ? (rawRows as TRow[]).filter(
          (r) => (r as Record<string, unknown>).sessionId === sessionId,
        )
      : (rawRows as TRow[]);

    const mapped = filtered.map(mapper);

    const sorted = sortBy ? orderBy(mapped, sortBy, sortOrder) : mapped;

    return limit ? sorted.slice(0, limit) : sorted;
  }, [rawRows, sessionId, sortBy, sortOrder, limit, mapper]);

  return { rows, loading: isLoading };
}
