"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time workflow state from SpacetimeDB.
 *
 * Subscribes to the workflow_state table (singleton, id=1) and returns
 * the latest workflow snapshot.
 *
 * @returns Object with data, loading state, and error
 */
export function useWorkflowState() {
  const [rows, isLoading] = useTable(tables.workflowState);

  const data = useMemo(() => {
    const row = rows[0];
    if (!row) return null;

    return {
      workflow_state: row.workflowState ?? "idle",
      current_phase: row.currentPhase ? Number(row.currentPhase) : 0,
      current_plan: "",
      complexity: row.complexity ?? "MODERATE",
      oversight: row.oversight ?? "milestone",
      ticket_id: row.ticketId ?? "",
      branch: "",
      session_id: row.sessionId ?? "",
      errors: [] as string[],
    };
  }, [rows]);

  return { data, loading: isLoading, error: null as string | null };
}
