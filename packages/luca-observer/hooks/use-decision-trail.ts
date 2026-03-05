"use client";

import { useCallback } from "react";

import { safeJsonParse } from "~/lib/safe-json-parse";
import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

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
  const mapper = useCallback(
    (row: {
      id: bigint;
      sessionId: string;
      decisionType: string;
      chosenApproach: string;
      alternativesJson: string;
      reasoning: string;
      timestamp: bigint;
    }) => {
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
    },
    [],
  );

  const { rows: decisions, loading } = useFilteredTable(
    tables.decisionLogs,
    mapper,
    { sessionId, limit },
  );

  return { decisions, loading };
}
