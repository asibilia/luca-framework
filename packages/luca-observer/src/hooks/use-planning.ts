"use client";

import { useEffect, useState, useCallback } from "react";

import { z } from "zod";

import type { SessionPlanSnapshot } from "~/lib/types";
import { SessionPlanSnapshotSchema } from "~/lib/types";

/**
 * API Response schema for /api/planning.
 *
 * Uses snake_case for API compatibility.
 */
const PlanningResponseSchema = z.object({
  plan: SessionPlanSnapshotSchema.nullable().default(null),
  has_plan: z.boolean().default(false),
});

/**
 * React hook for polling session plan from the API.
 *
 * Polls /api/planning at the specified interval to get the current
 * session plan with WSJF scores.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 * @returns Object with plan, hasPlan flag, loading state, and error
 */
export function usePlanning(intervalMs = 15000) {
  const [plan, setPlan] = useState<SessionPlanSnapshot | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/planning");
      if (!res.ok) throw new Error("Failed to fetch planning");
      const json = await res.json();
      const parsed = PlanningResponseSchema.safeParse(json);
      if (parsed.success) {
        setPlan(parsed.data.plan);
        setHasPlan(parsed.data.has_plan);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    const interval = setInterval(fetchPlan, intervalMs);
    return () => clearInterval(interval);
  }, [fetchPlan, intervalMs]);

  return { plan, hasPlan, loading, error };
}
