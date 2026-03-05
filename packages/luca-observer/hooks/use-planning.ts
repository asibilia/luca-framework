"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { safeJsonParse } from "~/lib/safe-json-parse";
import { tables } from "~/module_bindings";

/**
 * React hook for real-time session plan from SpacetimeDB.
 *
 * Subscribes to the session_plans table (singleton, id=1) and returns
 * the current session plan with WSJF scores.
 *
 * @returns Object with plan, hasPlan flag, and loading state
 */
export function usePlanning() {
  const [rows, isLoading] = useTable(tables.sessionPlans);

  const { plan, hasPlan } = useMemo(() => {
    const row = rows[0];
    if (!row || !row.planJson) return { plan: null, hasPlan: false };

    const parsed = safeJsonParse<Record<string, unknown> | null>(
      row.planJson,
      null,
    );
    return parsed
      ? { plan: parsed, hasPlan: true }
      : { plan: null, hasPlan: false };
  }, [rows]);

  return {
    plan,
    hasPlan,
    loading: isLoading,
  };
}
