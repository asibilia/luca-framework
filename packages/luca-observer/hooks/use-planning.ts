"use client";

import { useMemo } from "react";

import { useTable } from "spacetimedb/react";

import { tables } from "~/module_bindings";

/**
 * React hook for real-time session plan from SpacetimeDB.
 *
 * Subscribes to the session_plans table (singleton, id=1) and returns
 * the current session plan with WSJF scores. Replaces the polling-based implementation.
 *
 * @returns Object with plan, hasPlan flag, loading state, and error
 */
export function usePlanning() {
  const [rows, isLoading] = useTable(tables.sessionPlans);

  const { plan, hasPlan } = useMemo(() => {
    const row = rows[0];
    if (!row || !row.planJson) return { plan: null, hasPlan: false };

    try {
      const parsed = JSON.parse(row.planJson);
      return { plan: parsed, hasPlan: true };
    } catch {
      return { plan: null, hasPlan: false };
    }
  }, [rows]);

  return {
    plan,
    hasPlan,
    loading: isLoading,
    error: null as string | null,
  };
}
