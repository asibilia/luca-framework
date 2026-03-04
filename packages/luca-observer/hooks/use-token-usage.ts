"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time token usage from SpacetimeDB.
 *
 * Subscribes to the token_usage table and returns per-turn token
 * consumption metrics.
 *
 * @param sessionId - Optional session ID to filter by
 * @param limit - Maximum number of rows to return (default 100)
 * @returns Object with tokenUsage array, totals summary, loading state, and error
 */
export function useTokenUsage(sessionId?: string, limit = 100) {
  const [rows, isLoading] = useTable(tables.tokenUsage);

  const { tokenUsage, totals } = useMemo(() => {
    const filtered = sessionId
      ? rows.filter((r) => r.sessionId === sessionId)
      : rows;

    const mapped = filtered.map((row) => ({
      id: Number(row.id),
      session_id: row.sessionId,
      turn_number: Number(row.turnNumber),
      input_tokens: Number(row.inputTokens),
      output_tokens: Number(row.outputTokens),
      cache_read_tokens: Number(row.cacheReadTokens),
      cache_write_tokens: Number(row.cacheWriteTokens),
      timestamp: Number(row.timestamp),
    }));

    const sorted = orderBy(mapped, "timestamp", "desc");
    const limited = sorted.slice(0, limit);

    const totals = limited.reduce(
      (acc, row) => ({
        input_tokens: acc.input_tokens + row.input_tokens,
        output_tokens: acc.output_tokens + row.output_tokens,
        cache_read_tokens: acc.cache_read_tokens + row.cache_read_tokens,
        cache_write_tokens: acc.cache_write_tokens + row.cache_write_tokens,
        total_tokens: acc.total_tokens + row.input_tokens + row.output_tokens,
      }),
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        total_tokens: 0,
      },
    );

    return { tokenUsage: limited, totals };
  }, [rows, sessionId, limit]);

  return {
    tokenUsage,
    totals,
    loading: isLoading,
    error: null as string | null,
  };
}
