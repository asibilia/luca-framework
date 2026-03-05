"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

import { safeJsonParse } from "~/lib/safe-json-parse";
import { tables } from "~/module_bindings";

/**
 * React hook for real-time decision audit trail from SpacetimeDB.
 *
 * Subscribes to the decision_logs table and returns decision records
 * with reasoning and alternatives.
 *
 * @param sessionId - Optional session ID to filter by
 * @param limit - Maximum number of decisions to return (default 50)
 * @returns Object with decisions array and loading state
 */
export function useDecisionTrail(sessionId?: string, limit = 50) {
  const [rows, isLoading] = useTable(tables.decisionLogs);

  const decisions = useMemo(() => {
    const filtered = sessionId
      ? rows.filter((r) => r.sessionId === sessionId)
      : rows;

    const mapped = filtered.map((row) => {
      const alternatives = safeJsonParse<string[]>(row.alternativesJson, []);

      return {
        id: Number(row.id),
        session_id: row.sessionId,
        decision_type: row.decisionType,
        chosen_approach: row.chosenApproach,
        alternatives,
        reasoning: row.reasoning,
        timestamp: Number(row.timestamp),
      };
    });

    const sorted = orderBy(mapped, "timestamp", "desc");
    return sorted.slice(0, limit);
  }, [rows, sessionId, limit]);

  return { decisions, loading: isLoading, error: null as string | null };
}
